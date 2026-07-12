import { jsPDF } from 'jspdf';
import { saveFileBlob } from './storage';
import type { Book } from '@/types/book';

export interface ProcessResult {
  book: Book | null;
  error?: string;
}

/** 处理导入的文件，返回 Book 元数据（不加载 pdfjs，快速返回） */
export async function processFile(file: File): Promise<ProcessResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const title = file.name.replace(/\.[^.]+$/, '');
  const bookId = `user-${Date.now()}`;

  if (ext === 'txt') {
    return processTxt(file, bookId, title);
  } else if (ext === 'pdf') {
    return processPdf(file, bookId, title);
  } else if (ext === 'epub') {
    return processEpub(file, bookId, title);
  } else if (ext === 'docx' || ext === 'doc') {
    return processOffice(file, bookId, title, 'docx');
  } else if (ext === 'ppt' || ext === 'pptx') {
    return processOffice(file, bookId, title, 'pptx');
  } else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext || '')) {
    return processImage(file, bookId, title);
  }

  return { book: null, error: `不支持的格式: .${ext}，请上传 TXT/PDF/EPUB/Word/PPT/图片 文件` };
}

/** 处理 TXT 文件：转为带文本层的 PDF */
async function processTxt(file: File, bookId: string, title: string): Promise<ProcessResult> {
  const text = await file.text();
  if (!text.trim()) {
    return { book: null, error: '文件内容为空' };
  }

  const pdfBlob = await textToPdfBlob(text, title);
  await saveFileBlob(bookId, pdfBlob);

  // 估算页数（A4 每页约 36 行，每行约 45 字符）
  const estimatedPages = Math.max(1, Math.ceil(text.length / 1600));

  return {
    book: {
      id: bookId,
      title,
      fileType: 'txt',
      storageType: 'pdf-blob',
      addedDate: new Date(),
      lastReadPage: 1,
      totalPages: estimatedPages,
    },
  };
}

/** 处理 PDF 文件：直接存 blob，不加载 pdfjs */
async function processPdf(file: File, bookId: string, title: string): Promise<ProcessResult> {
  const arrayBuffer = await file.arrayBuffer();
  await saveFileBlob(bookId, new Blob([arrayBuffer], { type: 'application/pdf' }));

  // 页数由 PdfViewer 渲染时报告，导入时不加载 pdfjs
  return {
    book: {
      id: bookId,
      title,
      fileType: 'pdf',
      storageType: 'pdf-blob',
      addedDate: new Date(),
      lastReadPage: 1,
    },
  };
}

/** 处理 EPUB 文件：保留文本渲染（不转 PDF） */
async function processEpub(file: File, bookId: string, title: string): Promise<ProcessResult> {
  const arrayBuffer = await file.arrayBuffer();
  await saveFileBlob(bookId, new Blob([arrayBuffer], { type: 'application/epub+zip' }));

  const ePub = (await import('epubjs')).default;
  const book = ePub(arrayBuffer);
  await book.ready;
  const spine = book.spine as unknown as { items: { href: string }[] };
  const totalChapters = spine?.items?.length || 1;

  return {
    book: {
      id: bookId,
      title,
      fileType: 'epub',
      storageType: 'epub-blob',
      addedDate: new Date(),
      lastReadPage: 1,
      totalPages: totalChapters,
    },
  };
}

/** 处理 Office 文件（Word/PPT）：后端转 PDF，降级用 mammoth */
async function processOffice(
  file: File,
  bookId: string,
  title: string,
  kind: 'docx' | 'pptx',
): Promise<ProcessResult> {
  // 尝试调用后端转为 PDF
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const pdfBlob = await response.blob();
      await saveFileBlob(bookId, pdfBlob);
      // 页数由 PdfViewer 报告，不在此加载
      return {
        book: {
          id: bookId,
          title,
          fileType: kind,
          storageType: 'pdf-blob',
          addedDate: new Date(),
          lastReadPage: 1,
        },
      };
    }
  } catch (e) {
    console.warn('Backend convert failed, falling back:', e);
  }

  // Word 降级：用 mammoth.js 提取文本，再转 PDF
  if (kind === 'docx') {
    try {
      const mammoth = await import('mammoth/mammoth.browser');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;

      if (!text.trim()) {
        return { book: null, error: 'Word 文件内容为空' };
      }

      const pdfBlob = await textToPdfBlob(text, title);
      await saveFileBlob(bookId, pdfBlob);

      const estimatedPages = Math.max(1, Math.ceil(text.length / 1600));

      return {
        book: {
          id: bookId,
          title,
          fileType: 'docx',
          storageType: 'pdf-blob',
          addedDate: new Date(),
          lastReadPage: 1,
          totalPages: estimatedPages,
        },
      };
    } catch (e) {
      return { book: null, error: 'Word 文件解析失败: ' + (e as Error).message };
    }
  }

  return {
    book: null,
    error: 'PPT 转换需要后端服务支持，请先启动转换服务（cd server && npm start）',
  };
}

/** 处理图片文件：嵌入 PDF */
async function processImage(file: File, bookId: string, title: string): Promise<ProcessResult> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  const orientation = img.width > img.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [img.width, img.height],
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);

  const pdfBlob = pdf.output('blob');
  await saveFileBlob(bookId, pdfBlob);

  return {
    book: {
      id: bookId,
      title,
      fileType: 'image',
      storageType: 'pdf-blob',
      addedDate: new Date(),
      lastReadPage: 1,
      totalPages: 1,
    },
  };
}

/**
 * 将文本排版为带文本层的 PDF
 */
async function textToPdfBlob(text: string, title: string): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 7;
  let y = margin;

  // 标题
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  const titleLines = pdf.splitTextToSize(title, maxWidth);
  for (const line of titleLines) {
    if (y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight * 1.5;
  }
  y += 10;

  // 正文
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

  for (const para of paragraphs) {
    const lines = pdf.splitTextToSize(para.trim(), maxWidth);
    for (const line of lines) {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += lineHeight * 0.5;
  }

  return pdf.output('blob');
}

/** File 转 dataURL */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 加载图片获取尺寸 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
