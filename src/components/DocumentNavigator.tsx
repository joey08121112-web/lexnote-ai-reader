import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { X, Bookmark, Plus, Trash2, ChevronDown, ChevronRight, FileText, BookOpen, LayoutGrid } from 'lucide-react';
import type ePub from 'epubjs';
import { useBookStore } from '@/stores/bookStore';
import { getPdfOutline, type OutlineNode } from '@/lib/pdfOutline';
import { loadTldrawSnapshot } from '@/lib/tldrawStorage';
import { cn } from '@/lib/utils';

type Tab = 'outline' | 'bookmarks' | 'pages';

interface DocumentNavigatorProps {
  bookId: string;
  totalPages: number;
  currentPage: number;
  pdfBlob: Blob | null;
  epubBook?: ePub.Book | null;
  onClose: () => void;
  onJumpToPage: (page: number) => void;
}

export default function DocumentNavigator({
  bookId,
  totalPages,
  currentPage,
  pdfBlob,
  epubBook,
  onClose,
  onJumpToPage,
}: DocumentNavigatorProps) {
  const [tab, setTab] = useState<Tab>('outline');
  const { bookmarks, addBookmark, removeBookmark } = useBookStore();
  const bookBookmarks = bookmarks.filter((b) => b.bookId === bookId);

  // 大纲数据
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [outlineLoading, setOutlineLoading] = useState(false);

  // 加载大纲（PDF 或 EPUB）
  useEffect(() => {
    let cancelled = false;
    const loadOutline = async () => {
      setOutlineLoading(true);
      try {
        if (pdfBlob) {
          const nodes = await getPdfOutline(pdfBlob);
          if (!cancelled) setOutline(nodes);
        } else if (epubBook) {
          // EPUB: 用 navigation.toc，解析 href 为 spine index
          const toc = epubBook.navigation?.toc || [];
          const resolveToc = (items: typeof toc): OutlineNode[] => {
            return items.map((item) => {
              let pageNumber = 1;
              try {
                const section = epubBook.spine.get(item.href);
                if (section && typeof section.index === 'number') {
                  pageNumber = section.index + 1;
                }
              } catch {
                // 解析失败默认第 1 页
              }
              const children = item.subitems ? resolveToc(item.subitems) : [];
              return { title: item.label || '(无标题)', pageNumber, children };
            });
          };
          if (!cancelled) setOutline(resolveToc(toc));
        }
      } catch (e) {
        console.warn('[DocumentNavigator] load outline failed:', e);
      } finally {
        if (!cancelled) setOutlineLoading(false);
      }
    };
    loadOutline();
    return () => {
      cancelled = true;
    };
  }, [pdfBlob, epubBook]);

  // 添加当前页书签
  const handleAddBookmark = () => {
    addBookmark({
      id: `bm-${Date.now()}`,
      bookId,
      pageNumber: currentPage,
      title: `第 ${currentPage} 页`,
      createdAt: new Date(),
    });
  };

  // EPUB 无页面缩略图，切换到页面 tab 时若是 EPUB 则保留在大纲/书签
  const hasPagesTab = !!pdfBlob;

  return (
    <div className="fixed left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-40 flex flex-col border-r border-[#E8E4DE]">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DE]">
        <h2 className="text-sm font-semibold text-[#4A3F35]">文档导航</h2>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#E8E4DE] text-[#6B5E54]">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-[#E8E4DE]">
        <TabButton active={tab === 'outline'} onClick={() => setTab('outline')} icon={<FileText className="w-3.5 h-3.5" />} label="大纲" />
        <TabButton active={tab === 'bookmarks'} onClick={() => setTab('bookmarks')} icon={<Bookmark className="w-3.5 h-3.5" />} label="书签" />
        {hasPagesTab && (
          <TabButton active={tab === 'pages'} onClick={() => setTab('pages')} icon={<LayoutGrid className="w-3.5 h-3.5" />} label="页面" />
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {/* 大纲 tab */}
        {tab === 'outline' && (
          <div className="p-2">
            {outlineLoading ? (
              <p className="text-xs text-[#9B8E84] px-2 py-4 text-center">加载目录中...</p>
            ) : outline.length === 0 ? (
              <p className="text-xs text-[#9B8E84] px-2 py-4 text-center">本文档无目录</p>
            ) : (
              outline.map((node, i) => (
                <OutlineTreeItem key={`${node.title}-${i}`} node={node} depth={0} onJump={onJumpToPage} />
              ))
            )}
          </div>
        )}

        {/* 书签 tab */}
        {tab === 'bookmarks' && (
          <div className="p-2">
            <button
              onClick={handleAddBookmark}
              className="flex items-center gap-1 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-[#D4A574] hover:bg-[#D4A574]/10 mb-2"
            >
              <Plus className="w-3.5 h-3.5" />
              添加当前页书签（第 {currentPage} 页）
            </button>
            {bookBookmarks.length === 0 ? (
              <p className="text-xs text-[#9B8E84] px-2 py-4 text-center">暂无书签</p>
            ) : (
              bookBookmarks
                .slice()
                .sort((a, b) => a.pageNumber - b.pageNumber)
                .map((bm) => (
                  <div
                    key={bm.id}
                    className="group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[#FAF8F5]"
                    onClick={() => onJumpToPage(bm.pageNumber)}
                  >
                    <Bookmark className="w-3.5 h-3.5 text-[#D4A574] flex-shrink-0" />
                    <span className="flex-1 text-sm text-[#4A3F35] truncate">{bm.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBookmark(bm.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#E8E4DE] text-[#9B8E84] hover:text-[#E85D75]"
                      title="删除书签"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
            )}
          </div>
        )}

        {/* 页面 tab（PDF 缩略图，内联精简版） */}
        {tab === 'pages' && pdfBlob && (
          <PageThumbnails
            bookId={bookId}
            totalPages={totalPages}
            currentPage={currentPage}
            pdfBlob={pdfBlob}
            onJumpToPage={onJumpToPage}
          />
        )}
      </div>
    </div>
  );
}

/** Tab 按钮 */
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors border-b-2',
        active
          ? 'text-[#D4A574] border-[#D4A574]'
          : 'text-[#9B8E84] border-transparent hover:text-[#6B5E54]',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** 大纲树节点（递归） */
function OutlineTreeItem({ node, depth, onJump }: { node: OutlineNode; depth: number; onJump: (p: number) => void }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className="group flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-[#FAF8F5] rounded-lg"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onJump(node.pageNumber)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-[#E8E4DE] rounded"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <span className="text-sm text-[#4A3F35] truncate flex-1">{node.title}</span>
        <span className="text-[10px] text-[#9B8E84]">{node.pageNumber}</span>
      </div>
      {expanded && hasChildren && node.children.map((c, i) => (
        <OutlineTreeItem key={`${c.title}-${i}`} node={c} depth={depth + 1} onJump={onJump} />
      ))}
    </div>
  );
}

/** 内联精简版页面缩略图（PDF only，IntersectionObserver 懒渲染） */
function PageThumbnails({
  bookId,
  totalPages,
  currentPage,
  pdfBlob,
  onJumpToPage,
}: {
  bookId: string;
  totalPages: number;
  currentPage: number;
  pdfBlob: Blob;
  onJumpToPage: (page: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [notePages, setNotePages] = useState<Set<number>>(new Set());
  const renderedRef = useRef<Set<number>>(new Set());

  // 加载 PDF + 检查笔记
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const arrayBuffer = await pdfBlob.arrayBuffer();
        if (cancelled) return;
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        pdfDocRef.current = pdf;

        // 检查每页是否有笔记
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
        console.warn('[PageThumbnails] load pdf failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      if (pdfDocRef.current) {
        pdfDocRef.current.loadingTask.destroy().catch(() => {});
      }
    };
  }, [bookId, totalPages, pdfBlob]);

  // 懒渲染缩略图
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
            console.warn('[PageThumbnails] render page', pageNum, 'failed:', e);
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
    <div ref={containerRef} className="p-3 space-y-3">
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
          <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
            {pageNum}
          </span>
          {notePages.has(pageNum) && (
            <span
              className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#E85D75] border-2 border-white"
              title="此页有笔记"
            />
          )}
        </button>
      ))}
    </div>
  );
}
