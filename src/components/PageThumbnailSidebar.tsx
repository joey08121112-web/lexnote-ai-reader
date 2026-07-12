import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { loadTldrawSnapshot } from '@/lib/tldrawStorage';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageThumbnailSidebarProps {
  bookId: string;
  totalPages: number;
  currentPage: number;
  pdfBlob: Blob;
  onJumpToPage: (page: number) => void;
  onClose: () => void;
}

export default function PageThumbnailSidebar({
  bookId,
  totalPages,
  currentPage,
  pdfBlob,
  onJumpToPage,
  onClose,
}: PageThumbnailSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [notePages, setNotePages] = useState<Set<number>>(new Set());
  // 防止重复渲染的标记
  const renderedRef = useRef<Set<number>>(new Set());

  // 加载 PDF 文档 + 检查每页是否有笔记
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const arrayBuffer = await pdfBlob.arrayBuffer();
        if (cancelled) return;
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;

        // 检查每页是否有笔记（snapshot.document.store 含 shape 记录）
        // TLEditorSnapshot 结构：{ document: { store: Record<id, TLRecord>, schema }, session }
        const pages = new Set<number>();
        for (let i = 1; i <= totalPages; i++) {
          const snap = await loadTldrawSnapshot(bookId, i);
          if (!snap?.document?.store) continue;
          const records = Object.values(snap.document.store);
          const hasShape = records.some(
            (r) => (r as { typeName?: string }).typeName === 'shape',
          );
          if (hasShape) pages.add(i);
        }
        if (!cancelled) setNotePages(pages);
      } catch (e) {
        console.warn('[PageThumbnail] load pdf failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      pdfDocRef.current?.loadingTask.destroy().catch(() => {});
    };
  }, [bookId, totalPages, pdfBlob]);

  // 懒渲染缩略图（IntersectionObserver）
  useEffect(() => {
    if (!containerRef.current || totalPages === 0) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageNum = Number((entry.target as HTMLElement).dataset.pageNum);
          if (renderedRef.current.has(pageNum)) continue;
          const pdf = pdfDocRef.current;
          if (!pdf) continue;
          renderedRef.current.add(pageNum);
          try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.2 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            await page.render({ canvas, canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/png');
            setThumbnails((prev) => new Map(prev).set(pageNum, dataUrl));
          } catch (e) {
            console.warn('[PageThumbnail] render page', pageNum, 'failed:', e);
            renderedRef.current.delete(pageNum);
          }
        }
      },
      { root: containerRef.current, rootMargin: '200px' },
    );
    const items = containerRef.current.querySelectorAll('[data-page-num]');
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [totalPages]);

  return (
    <div className="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-2xl z-40 flex flex-col border-r border-[#E8E4DE]">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DE]">
        <h2 className="text-sm font-semibold text-[#4A3F35]">页面缩略图</h2>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#E8E4DE] text-[#6B5E54]">
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* 缩略图列表 */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            data-page-num={pageNum}
            onClick={() => onJumpToPage(pageNum)}
            className={cn(
              'relative w-full rounded-lg border-2 overflow-hidden bg-[#FAF8F5] transition-all hover:shadow-md',
              currentPage === pageNum ? 'border-[#D4A574] shadow-md' : 'border-[#E8E4DE]',
            )}
          >
            {thumbnails.get(pageNum) ? (
              <img src={thumbnails.get(pageNum)} alt={`Page ${pageNum}`} className="w-full" />
            ) : (
              <div className="w-full aspect-[3/4] flex items-center justify-center text-[#9B8E84] text-xs">
                加载中...
              </div>
            )}
            {/* 页码 */}
            <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
              {pageNum}
            </span>
            {/* 笔记角标 */}
            {notePages.has(pageNum) && (
              <span
                className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#E85D75] border-2 border-white"
                title="此页有笔记"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
