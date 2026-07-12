import { jsPDF } from 'jspdf';
import type { Editor } from 'tldraw';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * 导出当前页（tldraw 笔记层）为 PDF
 * 仅包含 tldraw shape，不含底层 PDF 原文（tldraw 不知道 PDF）
 */
export async function exportCurrentPageToPdf(editor: Editor, fileName: string) {
  const shapes = editor.getCurrentPageShapesSorted();
  const svgResult = await editor.getSvgString(shapes, { background: true, padding: 0 });
  if (!svgResult) throw new Error('导出失败：无法生成 SVG（页面可能为空）');

  const { blob } = await editor.toImage(shapes, {
    format: 'png',
    scale: 2,
    pixelRatio: 1,
    background: true,
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const dataUrl = await blobToDataUrl(blob);

  const ratio = svgResult.width / svgResult.height;
  let w = pageW;
  let h = pageW / ratio;
  if (h > pageH) {
    h = pageH;
    w = pageH * ratio;
  }
  doc.addImage(dataUrl, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h);
  doc.save(fileName);
}
