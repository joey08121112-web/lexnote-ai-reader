import { useState, useEffect, useRef } from 'react';
import ePub from 'epubjs';
import type { PersistedHighlight } from '@/lib/storage';

interface EpubViewerProps {
  blob: Blob;
  chapter: number;
  onChapterChange?: (chapter: number) => void;
  onTotalChapters?: (total: number) => void;
  onRendered?: () => void;
  /** book 就绪后回调（让父组件持有 book 引用，用于 cfi 生成） */
  onBookReady?: (book: ePub.Book) => void;
  /** 获取本书所有持久化高亮（每次章节渲染后调用以重新 add annotations） */
  getHighlights?: () => Promise<PersistedHighlight[]>;
  /** 点击持久化高亮 */
  onHighlightClick?: (h: PersistedHighlight) => void;
  /** 笔记模式：true 时禁用 epub iframe 的 pointer events，让 tldraw 画布接收书写输入 */
  noteMode?: boolean;
}

// 持久化高亮的 epubjs annotation 类型标记
const HL_ANNOTATION_TYPE = 'lexnote-persistent-highlight';

export default function EpubViewer({
  blob,
  chapter,
  onTotalChapters,
  onRendered,
  onBookReady,
  getHighlights,
  onHighlightClick,
  noteMode = false,
}: EpubViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<ePub.Book | null>(null);
  const renditionRef = useRef<ePub.Rendition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 用 ref 存所有回调，避免变化触发 loadEpub 重建
  const onBookReadyRef = useRef(onBookReady);
  onBookReadyRef.current = onBookReady;
  const getHighlightsRef = useRef(getHighlights);
  getHighlightsRef.current = getHighlights;
  const onHighlightClickRef = useRef(onHighlightClick);
  onHighlightClickRef.current = onHighlightClick;
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;

  /** 渲染当前章节的持久化高亮（每次 display 后调用） */
  const renderHighlights = async () => {
    const rendition = renditionRef.current;
    if (!rendition || !getHighlightsRef.current) return;
    try {
      const highlights = await getHighlightsRef.current();
      // 只处理 epub-cfi 类型
      const epubHighlights = highlights.filter(
        (h) => h.locator.type === 'epub-cfi' && h.locator.cfiRange,
      );
      for (const h of epubHighlights) {
        try {
          rendition.annotations.add(
            'highlight',
            h.locator.cfiRange!,
            { id: h.id },
            () => onHighlightClickRef.current?.(h),
            `lexnote-epub-highlight lexnote-hl-${h.color}`,
          );
        } catch {
          // cfi 失效或其他错误，忽略
        }
      }
    } catch (e) {
      console.warn('Render EPUB highlights failed:', e);
    }
  };

  // 初始化 EPUB
  useEffect(() => {
    let cancelled = false;

    async function loadEpub() {
      setLoading(true);
      setError('');
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const book = ePub(arrayBuffer);
        bookRef.current = book;

        if (!viewerRef.current || cancelled) return;

        const rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'none',
        });
        renditionRef.current = rendition;

        await book.ready;
        onBookReadyRef.current?.(book);

        // 获取章节数
        const spineItems = (book.spine as unknown as { items: { href: string }[] })?.items || [];
        onTotalChapters?.(spineItems.length);

        // 渲染第一章
        if (spineItems.length > 0) {
          await rendition.display(spineItems[0].href);
        }

        if (!cancelled) {
          setLoading(false);
          onRenderedRef.current?.();
          // 首次渲染持久高亮
          renderHighlights();
        }
      } catch (e) {
        if (!cancelled) {
          setError('EPUB 加载失败: ' + (e as Error).message);
          setLoading(false);
        }
      }
    }

    loadEpub();

    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      bookRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  // 切换章节
  useEffect(() => {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    if (!rendition || !book || loading) return;

    const spineItems = (book.spine as unknown as { items: { href: string }[] })?.items || [];
    if (chapter >= 0 && chapter < spineItems.length) {
      rendition.display(spineItems[chapter].href).then(() => {
        onRenderedRef.current?.();
        // 章节切换后重新渲染持久高亮（annotations 跨章节保留，但章节切换时当前章节的可见高亮会自动显示）
        renderHighlights();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#9B8E84] animate-pulse">正在加载 EPUB...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#E85D75]">{error}</p>
      </div>
    );
  }

  // ==== noteMode 变化时：禁用/启用 epub iframe 的 pointer-events ====
  // epub.js 在 viewer div 内创建 iframe，iframe 会拦截书写事件。
  // 笔记模式下设 pointer-events: none，让 tldraw 画布接收输入。
  useEffect(() => {
    if (!viewerRef.current) return;
    const pe = noteMode ? 'none' : 'auto';
    // viewer div 本身
    viewerRef.current.style.pointerEvents = pe;
    // iframe（epub.js 创建）
    const iframe = viewerRef.current.querySelector('iframe');
    if (iframe) iframe.style.pointerEvents = pe;
  }, [noteMode, loading]);

  return (
    <>
      <div
        ref={viewerRef}
        className={`w-full min-h-[500px] bg-white rounded-lg shadow-sm epub-text ${noteMode ? 'note-mode' : ''}`}
        style={{ minHeight: '500px', pointerEvents: noteMode ? 'none' : 'auto' }}
      />
      <style>{`
        /* EPUB 持久化高亮样式 */
        .lexnote-epub-highlight {
          cursor: pointer;
          border-radius: 2px;
        }
        .lexnote-epub-highlight.lexnote-hl-yellow {
          background: rgba(255, 235, 153, 0.55) !important;
        }
        .lexnote-epub-highlight.lexnote-hl-green {
          background: rgba(200, 230, 201, 0.55) !important;
        }
        .lexnote-epub-highlight.lexnote-hl-blue {
          background: rgba(187, 222, 251, 0.55) !important;
        }
        .lexnote-epub-highlight.lexnote-hl-pink {
          background: rgba(248, 187, 217, 0.55) !important;
        }
        /* 笔记模式下：禁用 EpubViewer 内所有元素的 pointer-events，
           让 tldraw 画布独占书写输入 */
        .epub-text.note-mode,
        .epub-text.note-mode * {
          pointer-events: none !important;
        }
      `}</style>
    </>
  );
}
