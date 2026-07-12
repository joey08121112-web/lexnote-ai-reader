import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bookmark, MessageCircle, PenTool, ChevronLeft, ChevronRight, Trash2, BookOpen, Sparkles, Send, X, ZoomIn, ZoomOut, Check, Plus, PanelRight, PanelLeft, Search, FileText, Highlighter, Mic, BookMarked, StickyNote as StickyNoteIcon, Image as ImageIcon } from 'lucide-react';
import { useBookStore } from '@/stores/bookStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVocabularyStore } from '@/stores/vocabularyStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import Markdown from '@/components/common/Markdown';
import { cn } from '@/lib/utils';
import { getFileBlob, getBookContent, saveHighlight, getHighlightsByPage, deleteHighlight, getStickyNotesByBook, saveStickyNote } from '@/lib/storage';
import type { PersistedHighlight, HighlightLocator, StickyNoteData } from '@/lib/storage';
import { solveFromImage, askFromText, translateText, PROMPTS, type ChatMessage } from '@/lib/aiService';
import PdfViewer from '@/components/PdfViewer';
import EpubViewer from '@/components/EpubViewer';
import PageThumbnailSidebar from '@/components/PageThumbnailSidebar';
import HandwritingSearchPanel from '@/components/HandwritingSearchPanel';
import AIDocumentPanel from '@/components/AIDocumentPanel';
import AIChatPopup from '@/components/AIChatPopup';
import HighlightManagerPanel from '@/components/HighlightManagerPanel';
import DocumentNavigator from '@/components/DocumentNavigator';
import AudioNotePanel from '@/components/AudioNotePanel';
import MistakeBookPanel from '@/components/MistakeBookPanel';
import StickyNoteCard from '@/components/StickyNoteCard';
import { useMistakeStore } from '@/stores/mistakeStore';
import type { AudioRecorder } from '@/lib/audioNotes';
import ePub from 'epubjs';
import * as pdfjsLib from 'pdfjs-dist';
import type { VocabularyWord } from '@/types/vocabulary';
import { renderDomTextHighlights, buildDomAnchorFromRange, createTempDomHighlight } from '@/lib/domTextHighlightRenderer';

// tldraw 笔记组件按需加载（包体积 ~1.5MB）
const TldrawEditor = lazy(() => import('@/components/TldrawEditor'));

export default function Reader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { books, updateLastReadPage, addBookmark } = useBookStore();
  const updateLastReadPageRef = useRef(updateLastReadPage);
  updateLastReadPageRef.current = updateLastReadPage;
  const book = books.find((b) => b.id === id);

  // 状态
  const [currentPage, setCurrentPage] = useState(book?.lastReadPage || 1);
  const [noteMode, setNoteMode] = useState(false); // false: 阅读模式, true: 笔记模式
  const [selection, setSelection] = useState<{ text: string; range: Range | null }>({ text: '', range: null });
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });
  const [showAIModal, setShowAIModal] = useState(false);
  const [highlightColor, setHighlightColor] = useState<'yellow' | 'green' | 'blue' | 'pink'>('yellow');

  // AI 解题侧栏状态（保留用于AI文档助手的兼容性，新的浮动弹窗使用 chatPopup）
  const [showSolverPanel, setShowSolverPanel] = useState(false);
  const [solverMessages, setSolverMessages] = useState<ChatMessage[]>([]);
  const [solverLoading, setSolverLoading] = useState(false);
  const [solverError, setSolverError] = useState('');
  const [solverFollowUp, setSolverFollowUp] = useState('');
  const [pendingChatImage, setPendingChatImage] = useState<string | null>(null);

  // AI 浮动对话弹窗状态
  const [chatPopup, setChatPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 阅读模式矩形框选状态
  const [rectSelect, setRectSelect] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // 翻译气泡状态
  const [translation, setTranslation] = useState<{
    text: string;
    result: string;
    loading: boolean;
    error: string;
    top: number;
    left: number;
    source?: string;
  } | null>(null);
  // 当前单词高亮 span（点击其他地方时移除）
  const highlightedSpanRef = useRef<HTMLSpanElement | null>(null);
  // 最近点击单词的持久化高亮 locator（加生词本时用它创建 PersistedHighlight）
  const lastClickedWordLocatorRef = useRef<HighlightLocator | null>(null);
  // EPUB book 引用（用于 cfi 生成）
  const epubBookRef = useRef<ePub.Book | null>(null);
  // 最近点击 EPUB 单词的 Range（加生词本时用它生成 cfi）
  const lastClickedEpubRangeRef = useRef<Range | null>(null);
  // 点击持久化高亮时弹出的删除气泡
  const [highlightBubble, setHighlightBubble] = useState<{
    highlightId: string;
    top: number;
    left: number;
  } | null>(null);
  // 持久化高亮版本号：加/删高亮后递增，触发 PdfViewer 重新渲染该页高亮
  const [highlightsVersion, setHighlightsVersion] = useState(0);
  // 离线状态
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // 监听网络状态
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const solverMessagesRef = useRef<ChatMessage[]>([]);
  solverMessagesRef.current = solverMessages;
  const aiApiHistoryRef = useRef<ChatMessage[]>([]);
  const aiSelectedImageRef = useRef<string | null>(null);
  const { addWord, words: vocabularyWords } = useVocabularyStore();
  const addMistake = useMistakeStore((s) => s.addMistake);
  const [addedToVocab, setAddedToVocab] = useState<string | null>(null);
  const [vocabToast, setVocabToast] = useState('');

  // 笔记模式缩放（PdfViewer scale 用，tldraw 笔记模式自带 zoom）
  const [zoom, setZoom] = useState(1);

  // 多页缩略图侧栏
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [jumpToPageSignal, setJumpToPageSignal] = useState(0);

  // 手写搜索侧栏（与缩略图互斥，二者都在左侧）
  const [showHandwritingSearch, setShowHandwritingSearch] = useState(false);

  // AI 文档侧栏（与 AI 解题侧栏互斥，二者都在右侧）
  const [showDocumentPanel, setShowDocumentPanel] = useState(false);
  // D1.4 高亮管理侧栏（右侧）
  const [showHighlightManager, setShowHighlightManager] = useState(false);
  // D3.4 文档导航侧栏（左侧）
  const [showNavigator, setShowNavigator] = useState(false);
  const [documentText, setDocumentText] = useState('');
  const [documentTextLoading, setDocumentTextLoading] = useState(false);
  // 全文缓存：避免重复提取
  const documentTextRef = useRef('');

  // ==== 录音功能（从 TldrawToolbar 迁移到顶部工具栏） ====
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // tldraw editor 引用（AudioNotePanel 回放高亮需要）
  const tldrawEditorRef = useRef<import('tldraw').Editor | null>(null);
  // 共享 AudioRecorder 引用（TldrawEditor 读取用于笔画时间戳记录）
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  // 笔工具栏 Portal 目标容器（渲染到 header 工具行，避免遮挡书写区域）
  const [toolbarPortalEl, setToolbarPortalEl] = useState<HTMLDivElement | null>(null);

  // ==== 错题本 ====
  const [showMistakeBook, setShowMistakeBook] = useState(false);

  // ==== 便签 ====
  const [stickyNotes, setStickyNotes] = useState<StickyNoteData[]>([]);

  // ==== 图片插入 ====
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // ==== AI 选区模式（阅读模式选文字，笔记模式框选） ====
  const [aiSelectionMode, setAiSelectionMode] = useState<'none' | 'text' | 'rect'>('none');

  // 当前可见页的布局信息（TldrawEditor 定位用）
  const [pageLayout, setPageLayout] = useState<{ top: number; height: number } | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // text 类型书的 article 元素引用（用于笔记模式定位）
  const articleRef = useRef<HTMLElement>(null);
  // EPUB 类型书的内容容器引用（用于笔记模式定位）
  const epubContentRef = useRef<HTMLDivElement>(null);

  // 多格式内容加载
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [epubBlob, setEpubBlob] = useState<Blob | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // 从 IndexedDB 加载书籍内容
  useEffect(() => {
    if (!book) return;
    setPdfBlob(null);
    setEpubBlob(null);
    setTextContent(null);
    // 切书时清空全文缓存（避免上一本的文本串到新文档助手）
    documentTextRef.current = '';
    setDocumentText('');
    setShowDocumentPanel(false);

    setContentLoading(true);
    (async () => {
      if (book.storageType === 'pdf-blob') {
        const blob = await getFileBlob(book.id);
        if (blob) setPdfBlob(blob);
      } else if (book.storageType === 'epub-blob') {
        const blob = await getFileBlob(book.id);
        if (blob) setEpubBlob(blob);
      } else {
        // text 类型：优先用 book.content（示例书有内置 content），否则从 IndexedDB 加载
        if (book.content) {
          setTextContent(book.content);
        } else {
          const content = await getBookContent(book.id);
          if (content) setTextContent(content);
        }
      }
      setContentLoading(false);
    })();
  }, [book?.id]);

  // ==== 加载便签（切书时） ====
  useEffect(() => {
    if (!book) return;
    getStickyNotesByBook(book.id)
      .then(setStickyNotes)
      .catch((e) => console.warn('[Reader] load sticky notes failed:', e));
  }, [book?.id]);

  // ==== 切页：清除单词临时高亮和翻译气泡 ====
  useEffect(() => {
    if (book) {
      // 切页时清除临时高亮 span 和翻译气泡（属于上一页 DOM）
      highlightedSpanRef.current = null;
      setTranslation(null);
    }
  }, [book, currentPage]);

  // ==== 稳定回调：用 ref 存最新值，回调引用永不变化 ====
  // 避免回调依赖 currentPage/pageLayout 导致 PdfViewer 加载 effect 重新触发（频闪根因）
  const stateRef = useRef({ pageLayout, currentPage, book, id });
  stateRef.current = { pageLayout, currentPage, book, id };

  // ==== 内容渲染完成回调：占位（tldraw 笔记层不依赖此回调） ====
  const handleContentRendered = useCallback(() => {
    // PdfViewer 完成渲染后会调用，TldrawEditor 自身通过 pageLayout 定位
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==== PdfViewer 报告可见页变化：更新页码 + TldrawEditor 定位 ====
  const handleVisiblePageChange = useCallback(
    (page: number, rect: { top: number; height: number }) => {
      const { currentPage: cp, id: bid } = stateRef.current;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      // 无 CSS zoom，视觉坐标 = 基准坐标，直接用
      const visualTop = rect.top - containerRect.top;
      setPageLayout({ top: visualTop, height: rect.height });
      if (page !== cp) {
        setCurrentPage(page);
        if (bid) updateLastReadPageRef.current(bid, page);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ==== 主动测量当前最佳可见页（用于笔记模式切换时确保 pageLayout 正确） ====
  const measureBestVisiblePage = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const windowH = window.innerHeight;

    if (stateRef.current.book?.storageType === 'pdf-blob') {
      const pageDivs = container.querySelectorAll<HTMLElement>('[data-page-num]');
      let bestPage = 0;
      let bestArea = -1;
      let bestTop = 0;
      let bestHeight = 0;
      pageDivs.forEach((div) => {
        const rect = div.getBoundingClientRect();
        const overlapTop = Math.max(rect.top, 0);
        const overlapBottom = Math.min(rect.bottom, windowH);
        const overlapHeight = Math.max(0, overlapBottom - overlapTop);
        if (overlapHeight > bestArea) {
          bestArea = overlapHeight;
          bestPage = Number(div.dataset.pageNum);
          bestTop = rect.top;
          bestHeight = rect.height;
        }
      });
      if (bestPage > 0) {
        const visualTop = bestTop - containerRect.top;
        setPageLayout({ top: visualTop, height: bestHeight });
        if (bestPage !== stateRef.current.currentPage) {
          setCurrentPage(bestPage);
          if (stateRef.current.id) updateLastReadPageRef.current(stateRef.current.id, bestPage);
        }
      }
    } else {
      const target = stateRef.current.book?.storageType === 'epub-blob'
        ? epubContentRef.current
        : articleRef.current;
      if (target) {
        const rect = target.getBoundingClientRect();
        setPageLayout({
          top: rect.top - containerRect.top,
          height: rect.height,
        });
      }
    }
  }, []);

  // 切换到笔记模式时，主动测量当前可见页，确保 TldrawEditor 定位正确
  useEffect(() => {
    if (noteMode) {
      const raf = requestAnimationFrame(() => measureBestVisiblePage());
      return () => cancelAnimationFrame(raf);
    }
  }, [noteMode, measureBestVisiblePage]);

  // 滚动时持续更新 pageLayout（作为 IntersectionObserver 的补充，确保定位始终正确）
  useEffect(() => {
    if (!noteMode) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        measureBestVisiblePage();
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [noteMode, measureBestVisiblePage]);

  // ==== PdfViewer 报告真实页数 ====
  const handleTotalPages = useCallback((total: number) => {
    const { book: bk, id: bid, currentPage: cp } = stateRef.current;
    if (bk && !bk.totalPages && bid) {
      updateLastReadPageRef.current(bid, cp);
      useBookStore.setState((state) => ({
        books: state.books.map((b) =>
          b.id === bid ? { ...b, totalPages: total } : b
        ),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==== text/EPUB 类型书：手动设置 pageLayout（PdfViewer 有自己的回调，无需此处理） ====
  // 阅读模式和笔记模式都需要 pageLayout，让笔记层能叠加显示
  useEffect(() => {
    if (!book) return;
    // 仅 text 和 epub-blob 类型需要手动测量（pdf-blob 由 PdfViewer 回调）
    if (book.storageType === 'pdf-blob') return;
    // text 类型需要 textContent 已加载；EPUB 类型需要 epubBlob 已加载
    if (book.storageType !== 'epub-blob' && !textContent) return;
    if (book.storageType === 'epub-blob' && !epubBlob) return;

    // 用 requestAnimationFrame 确保 DOM 已渲染后再测量
    const raf = requestAnimationFrame(() => {
      const target = book.storageType === 'epub-blob' ? epubContentRef.current : articleRef.current;
      const container = containerRef.current;
      if (!target || !container) return;
      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setPageLayout({
        top: targetRect.top - containerRect.top,
        height: targetRect.height,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [book, textContent, epubBlob, currentPage]);

  // ==== 缩略图点击跳页（通过 signal 触发 PdfViewer 滚动） ====
  const handleJumpToPage = useCallback((page: number) => {
    setJumpToPageSignal(page);
  }, []);

  // ==== 错题本定位：跳转到指定页 ====
  const handleLocateMistake = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
    setJumpToPageSignal(pageNumber);
    // 切到阅读模式以便查看原文
    if (noteMode) setNoteMode(false);
  }, [noteMode]);

  // 移除当前单词高亮（把 span 拆回纯文本）
  const clearWordHighlight = useCallback(() => {
    const el = highlightedSpanRef.current;
    if (!el) return;
    if (el.classList.contains('lex-word-highlight-overlay')) {
      el.remove();
    } else {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        parent.normalize();
      }
    }
    highlightedSpanRef.current = null;
  }, []);

  // ==== 鼠标按下：清除旧单词高亮/翻译（准备新的交互）====
  // 注意：不清除选区selection本身，因为用户可能点击选中工具栏按钮
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (noteMode) return;
    const target = e.target as HTMLElement;
    // 点击工具栏、翻译弹窗、AI弹窗等UI元素时不清除
    if (target.closest('[class*="z-50"], [class*="z-40"], [class*="fixed"], [class*="sticky"]')) return;
    if (target.closest('button')) return;
    clearWordHighlight();
    setTranslation(null);
    setAddedToVocab(null);
  }, [noteMode, clearWordHighlight]);

  // ==== 文字选中处理（仅阅读模式） ====
  const handleSelectionChange = useCallback(() => {
    if (noteMode) return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim() && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const anchorNode = sel.anchorNode as Node | null;
      const focusNode = sel.focusNode as Node | null;
      const getEl = (n: Node | null) => {
        if (!n) return null;
        return n.nodeType === Node.TEXT_NODE ? (n as Text).parentElement : (n as HTMLElement);
      };
      const anchorEl = getEl(anchorNode);
      const focusEl = getEl(focusNode);
      const inReadableArea = (el: HTMLElement | null) =>
        !!el && !!(el.closest('article.prose') || el.closest('.epub-text') || el.closest('.epub-container') || el.closest('.textLayer'));
      if (!inReadableArea(anchorEl) || !inReadableArea(focusEl)) {
        setShowToolbar(false);
        setSelection({ text: '', range: null });
        return;
      }
      const text = sel.toString().trim();
      if (text.length > 2000) {
        setShowToolbar(false);
        setSelection({ text: '', range: null });
        return;
      }
      const rect = range.getBoundingClientRect();
      const toolbarTop = rect.top - 50;
      const toolbarLeft = rect.left + rect.width / 2 - 150;
      setSelection({ text, range: range.cloneRange() });
      setToolbarPosition({ top: toolbarTop, left: toolbarLeft });
      setShowToolbar(true);
    } else {
      setShowToolbar(false);
      setSelection({ text: '', range: null });
    }
  }, [noteMode]);

  // 监听 selectionchange 事件（替代 onMouseUp/onKeyUp，覆盖键盘选择和鼠标选择所有场景）
  useEffect(() => {
    let rafId: number | null = null;
    const onSelChange = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        handleSelectionChange();
      });
    };
    document.addEventListener('selectionchange', onSelChange);
    return () => {
      document.removeEventListener('selectionchange', onSelChange);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [handleSelectionChange]);

  // ==== 辅助：从 Range 计算 PDF textLayer 选区的 locator（起始/结束 item + offset）====
  const computePdfLocatorFromRange = useCallback((range: Range): {
    pageDiv: HTMLElement | null;
    firstItemIndex: number;
    firstStartOffset: number;
    lastItemIndex: number;
    lastEndOffset: number;
  } => {
    const result = {
      pageDiv: null as HTMLElement | null,
      firstItemIndex: -1,
      firstStartOffset: 0,
      lastItemIndex: -1,
      lastEndOffset: 0,
    };

    const findItemSpan = (node: Node | null): HTMLElement | null => {
      if (!node) return null;
      const el = node.nodeType === Node.TEXT_NODE
        ? (node as Text).parentElement
        : node as HTMLElement;
      return el?.closest('.textLayer span[data-item-index]') as HTMLElement | null;
    };

    const getOffsetInSpan = (span: HTMLElement, node: Node, offset: number): number => {
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let acc = 0;
      let tn: Node | null;
      while ((tn = walker.nextNode())) {
        if (tn === node) return acc + offset;
        acc += (tn as Text).length;
      }
      return offset;
    };

    const startSpan = findItemSpan(range.startContainer);
    const endSpan = findItemSpan(range.endContainer);
    if (!startSpan || !endSpan) return result;

    const startIdx = Number(startSpan.getAttribute('data-item-index'));
    const endIdx = Number(endSpan.getAttribute('data-item-index'));
    if (isNaN(startIdx) || isNaN(endIdx)) return result;

    result.pageDiv = startSpan.closest('[data-page-num]') as HTMLElement | null;
    result.firstItemIndex = Math.min(startIdx, endIdx);
    result.lastItemIndex = Math.max(startIdx, endIdx);

    if (startIdx <= endIdx) {
      result.firstStartOffset = getOffsetInSpan(startSpan, range.startContainer, range.startOffset);
      result.lastEndOffset = getOffsetInSpan(endSpan, range.endContainer, range.endOffset);
    } else {
      result.firstStartOffset = getOffsetInSpan(endSpan, range.endContainer, range.endOffset);
      result.lastEndOffset = getOffsetInSpan(startSpan, range.startContainer, range.startOffset);
    }
    return result;
  }, []);

  // ==== 辅助：在 PDF pageDiv 上创建临时选区高亮 overlay（即时视觉反馈）====
  const createTempPdfHighlight = useCallback((range: Range, color: string) => {
    const pageDiv = range.startContainer.parentElement?.closest('[data-page-num]') as HTMLElement | null
      || range.endContainer.parentElement?.closest('[data-page-num]') as HTMLElement | null;
    if (!pageDiv) return;

    const pageRect = pageDiv.getBoundingClientRect();
    const colorMap: Record<string, string> = {
      yellow: 'rgba(255, 235, 153, 0.55)',
      green: 'rgba(200, 230, 201, 0.55)',
      blue: 'rgba(187, 222, 251, 0.55)',
      pink: 'rgba(248, 187, 217, 0.55)',
    };
    const bg = colorMap[color] || colorMap.yellow;

    const tempLayer = document.createElement('div');
    tempLayer.className = 'lex-temp-highlight-layer';
    tempLayer.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:6;';

    const clientRects = range.getClientRects();
    for (let i = 0; i < clientRects.length; i++) {
      const r = clientRects[i];
      if (r.width < 2 || r.height < 2) continue;
      const div = document.createElement('div');
      div.style.cssText = `position:absolute;left:${r.left - pageRect.left}px;top:${r.top - pageRect.top}px;width:${r.width}px;height:${r.height}px;background:${bg};border-radius:2px;mix-blend-mode:multiply;`;
      tempLayer.appendChild(div);
    }
    pageDiv.appendChild(tempLayer);

    setTimeout(() => tempLayer.remove(), 1500);
  }, []);

  // ==== 高亮（D1.3: 持久化到 IndexedDB，替代内存态 bookStore.addHighlight）====
  const handleHighlight = useCallback(() => {
    if (!selection.range || !book) {
      setShowToolbar(false);
      window.getSelection()?.removeAllRanges();
      return;
    }
    const range = selection.range.cloneRange();

    const isInTextLayer = (node: Node | null): boolean => {
      if (!node) return false;
      const el = node.nodeType === Node.TEXT_NODE
        ? (node as Text).parentElement
        : node as HTMLElement;
      return !!el?.closest('.textLayer');
    };

    const isInArticleProse = (node: Node | null): boolean => {
      if (!node) return false;
      const el = node.nodeType === Node.TEXT_NODE
        ? (node as Text).parentElement
        : node as HTMLElement;
      return !!el?.closest('article.prose');
    };

    const startInTextLayer = isInTextLayer(range.startContainer);
    const endInTextLayer = isInTextLayer(range.endContainer);
    const startInArticle = isInArticleProse(range.startContainer);
    const endInArticle = isInArticleProse(range.endContainer);

    const isPdfSelection = startInTextLayer && endInTextLayer;
    const isDomTextSelection = !isPdfSelection && startInArticle && endInArticle;

    const epubBook = epubBookRef.current;
    let savedCfi: string | null = null;
    if (epubBook && !isPdfSelection && !isDomTextSelection) {
      try {
        const section = epubBook.spine.get(currentPage - 1);
        if (section) {
          savedCfi = section.cfiFromRange(range);
        }
      } catch (e) {
        console.warn('EPUB cfi for highlight failed:', e);
      }
    }

    let locator: HighlightLocator;

    if (isPdfSelection) {
      const { pageDiv, firstItemIndex, firstStartOffset, lastItemIndex, lastEndOffset } =
        computePdfLocatorFromRange(range);

      if (pageDiv && firstItemIndex >= 0 && lastItemIndex >= 0) {
        createTempPdfHighlight(range, highlightColor);
        locator = {
          type: 'pdf-text-item',
          pageIndex: currentPage,
          itemIndex: firstItemIndex,
          startOffset: firstStartOffset,
          endOffset: firstItemIndex === lastItemIndex ? lastEndOffset : undefined,
          endItemIndex: firstItemIndex === lastItemIndex ? undefined : lastItemIndex,
          endItemEndOffset: firstItemIndex === lastItemIndex ? undefined : lastEndOffset,
        };
      } else {
        locator = { type: 'pdf-text-item', pageIndex: currentPage };
      }
    } else if (isDomTextSelection) {
      const article = range.startContainer.parentElement?.closest('article.prose') as HTMLElement | null
        || range.endContainer.parentElement?.closest('article.prose') as HTMLElement | null;
      if (article && containerRef.current) {
        createTempDomHighlight(containerRef.current, range, highlightColor);
        const { prefix, suffix } = buildDomAnchorFromRange(range, article);
        locator = {
          type: 'dom-text-anchor',
          pageIndex: currentPage,
          prefix,
          suffix,
        };
      } else {
        locator = { type: 'dom-text-anchor', pageIndex: currentPage };
      }
    } else {
      locator = savedCfi
        ? { type: 'epub-cfi', cfiRange: savedCfi }
        : { type: 'pdf-text-item', pageIndex: currentPage };
    }

    const newHighlight: PersistedHighlight = {
      id: `hl-${Date.now()}`,
      bookId: book.id,
      pageNumber: currentPage,
      locator,
      text: selection.text,
      color: highlightColor,
      source: 'manual-select',
      createdAt: new Date().toISOString(),
    };
    saveHighlight(newHighlight).catch((e) => console.warn('saveHighlight failed:', e));
    setHighlightsVersion((v) => v + 1);
    setShowToolbar(false);
    window.getSelection()?.removeAllRanges();
  }, [selection, highlightColor, id, currentPage, book, computePdfLocatorFromRange, createTempPdfHighlight]);

  const handleAIAsk = useCallback(() => {
    setShowToolbar(false);
    setShowAIModal(true);
  }, [selection]);

  // ==== 翻译 ====
  const doTranslate = useCallback(async (text: string, top: number, left: number) => {
    setTranslation({ text, result: '', loading: true, error: '', top, left });
    try {
      const { translated, source } = await translateText(text);
      setTranslation({ text, result: translated, loading: false, error: '', top, left, source });
    } catch (e) {
      setTranslation({ text, result: '', loading: false, error: (e as Error).message, top, left });
    }
  }, []);

  // ==== PDF 单词点击（由 PdfViewer onWordClick 回调驱动，基于textContent数学计算100%准确）====
  const handlePdfWordClick = useCallback((
    word: string,
    rect: { left: number; top: number; right: number; bottom: number },
    locator: { itemIndex: number; startOffset: number; endOffset: number } | null,
  ) => {
    if (noteMode) return;
    const existingSel = window.getSelection();
    if (existingSel && existingSel.toString().trim()) return;

    clearWordHighlight();

    // 记录 locator 供 handleAddToVocab 创建持久化高亮用
    lastClickedWordLocatorRef.current = locator
      ? {
          type: 'pdf-text-item',
          pageIndex: currentPage,
          itemIndex: locator.itemIndex,
          startOffset: locator.startOffset,
          endOffset: locator.endOffset,
        }
      : null;

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      const overlay = document.createElement('div');
      overlay.className = 'lex-word-highlight-overlay';
      overlay.style.position = 'absolute';
      overlay.style.left = `${rect.left - containerRect.left}px`;
      overlay.style.top = `${rect.top - containerRect.top}px`;
      overlay.style.width = `${rect.right - rect.left}px`;
      overlay.style.height = `${rect.bottom - rect.top}px`;
      containerRef.current.appendChild(overlay);
      highlightedSpanRef.current = overlay;
    }
    // D1.2: 创建持久化 word-lookup 高亮（跨会话保留；确定性 id 去重，重复点同一词只更新不新增）
    if (locator && id) {
      const hl: PersistedHighlight = {
        id: `wl-${id}-${currentPage}-${locator.itemIndex}-${locator.startOffset}-${locator.endOffset}`,
        bookId: id,
        pageNumber: currentPage,
        locator: {
          type: 'pdf-text-item',
          pageIndex: currentPage,
          itemIndex: locator.itemIndex,
          startOffset: locator.startOffset,
          endOffset: locator.endOffset,
        },
        text: word,
        color: 'yellow',
        source: 'word-lookup',
        createdAt: new Date().toISOString(),
      };
      saveHighlight(hl).catch((e) => console.warn('saveHighlight word-lookup failed:', e));
      setHighlightsVersion((v) => v + 1);
    }
    doTranslate(word, rect.bottom + 8, (rect.left + rect.right) / 2);
  }, [noteMode, clearWordHighlight, doTranslate, currentPage, id]);

  // 点击单词：
  // PDF textLayer —— 用 elementsFromPoint 找点击位置的所有 textLayer span，
  //   遍历每个 span 的每个单词用 Range.getBoundingClientRect 测量视觉位置，
  //   找点击坐标落在哪个单词内（放大后 e.target 可能是 canvas/overlay 而非 span）
  // EPUB —— caretRangeFromPoint + surroundContents（普通流式文本，无 transform，定位准确）
  const handleClickWord = useCallback((e: React.MouseEvent) => {
    if (noteMode) return;
    const existingSel = window.getSelection();
    if (existingSel && existingSel.toString().trim()) return;

    const target = e.target as HTMLElement;
    const isPdfArea = !!target.closest('.pdf-viewer-root');

    // PDF 模式（canvas + textLayer）由 PdfViewer onWordClick 回调处理，这里完全不干预
    if (isPdfArea) return;

    clearWordHighlight();

    // ==== 普通 DOM 文本（EPUB/纯HTML/BookContent）：caretRangeFromPoint + surroundContents ====
    // caretRangeFromPoint 对无 transform 的普通文本100%准确，不需要额外的坐标变换
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let textNode: Node | null = null;
    let offset = 0;
    if (doc.caretRangeFromPoint) {
      const r = doc.caretRangeFromPoint(e.clientX, e.clientY);
      if (r && r.startContainer.nodeType === Node.TEXT_NODE) {
        textNode = r.startContainer;
        offset = r.startOffset;
      }
    } else if (doc.caretPositionFromPoint) {
      const p = doc.caretPositionFromPoint(e.clientX, e.clientY);
      if (p && p.offsetNode && p.offsetNode.nodeType === Node.TEXT_NODE) {
        textNode = p.offsetNode;
        offset = p.offset;
      }
    }
    if (!textNode) {
      setShowToolbar(false);
      setTranslation(null);
      return;
    }
    // 检查点击的文本节点是否在可阅读内容区域内（article.prose、.epub-text 等），避免点击工具栏/按钮时触发
    const textEl = (textNode as Text).parentElement;
    if (!textEl) return;
    const inReadableArea = textEl.closest('article.prose') || textEl.closest('.epub-text') || textEl.closest('.epub-container');
    if (!inReadableArea) return;

    const text = textNode.textContent || '';
    const wordRegex = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
    let word = '';
    let wordStart = -1;
    let wordEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = wordRegex.exec(text)) !== null) {
      if (offset >= m.index && offset <= m.index + m[0].length) {
        word = m[0];
        wordStart = m.index;
        wordEnd = m.index + m[0].length;
        break;
      }
    }
    if (!word) return;

    const wordRange = document.createRange();
    wordRange.setStart(textNode, wordStart);
    wordRange.setEnd(textNode, wordEnd);
    lastClickedEpubRangeRef.current = wordRange.cloneRange();
    lastClickedWordLocatorRef.current = null;

    const isInArticleProse = !!textEl.closest('article.prose');

    if (isInArticleProse && containerRef.current) {
      const wordRect = wordRange.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.className = 'lex-word-highlight-overlay';
      overlay.style.position = 'absolute';
      overlay.style.left = `${wordRect.left - containerRect.left}px`;
      overlay.style.top = `${wordRect.top - containerRect.top}px`;
      overlay.style.width = `${wordRect.width}px`;
      overlay.style.height = `${wordRect.height}px`;
      containerRef.current.appendChild(overlay);
      highlightedSpanRef.current = overlay;
      lastClickedWordLocatorRef.current = null;
    } else {
      const span = document.createElement('span');
      span.className = 'lex-word-highlight';
      try {
        wordRange.surroundContents(span);
        highlightedSpanRef.current = span;
      } catch {
        // cross-node fallback: skip highlight
      }
    }
    const finalRect = highlightedSpanRef.current?.getBoundingClientRect() || wordRange.getBoundingClientRect();
    doTranslate(word, finalRect.bottom + 8, finalRect.left + finalRect.width / 2);

    // D1.2: EPUB 持久化 word-lookup 高亮（确定性 id 去重）
    if (id) {
      try {
        const epubBook = epubBookRef.current;
        const section = epubBook?.spine.get(currentPage - 1);
        if (epubBook && section) {
          const cfiRange = section.cfiFromRange(lastClickedEpubRangeRef.current);
          if (cfiRange) {
            const hl: PersistedHighlight = {
              id: `wl-epub-${id}-${cfiRange}`,
              bookId: id,
              pageNumber: currentPage,
              locator: { type: 'epub-cfi', cfiRange },
              text: word,
              color: 'yellow',
              source: 'word-lookup',
              createdAt: new Date().toISOString(),
            };
            saveHighlight(hl).catch((e) => console.warn('saveHighlight word-lookup failed:', e));
            setHighlightsVersion((v) => v + 1);
          }
        }
      } catch (e) {
        console.warn('EPUB word-lookup highlight failed:', e);
      }
    }
  }, [noteMode, doTranslate, clearWordHighlight, currentPage, id]);

  // 工具栏翻译按钮（手动选中后用）
  const handleTranslate = useCallback(() => {
    if (!selection.text) return;
    clearWordHighlight();
    setAddedToVocab(null);
    doTranslate(selection.text, toolbarPosition.top + 50, toolbarPosition.left + 150);
    setShowToolbar(false);
    window.getSelection()?.removeAllRanges();
  }, [selection, toolbarPosition, doTranslate, clearWordHighlight]);

  // ==== 语法分析（选中句子 → AI） ====
  // source 为 undefined 时表示是 AI 语法分析，与翻译区分
  const handleGrammarAnalyze = useCallback(async () => {
    if (!selection.text) return;
    clearWordHighlight();
    setAddedToVocab(null);

    const text = selection.text;
    const top = toolbarPosition.top + 50;
    const left = toolbarPosition.left + 150;

    setTranslation({ text, result: '', loading: true, error: '', top, left, source: undefined });
    setShowToolbar(false);
    window.getSelection()?.removeAllRanges();

    try {
      const result = await askFromText(text, PROMPTS.grammar);
      setTranslation({ text, result, loading: false, error: '', top, left, source: undefined });
    } catch (e) {
      setTranslation({ text, result: '', loading: false, error: (e as Error).message, top, left, source: undefined });
    }
  }, [selection, toolbarPosition, clearWordHighlight]);

  // 加入生词本
  const handleAddToVocab = useCallback((word: string, definition: string) => {
    const lowerWord = word.toLowerCase().trim();
    if (vocabularyWords.some(w => w.word.toLowerCase() === lowerWord)) {
      setVocabToast('该单词已在生词本中');
      setTimeout(() => setVocabToast(''), 2000);
      return;
    }

    const newWord: VocabularyWord = {
      id: `vocab-${Date.now()}`,
      word: word.trim(),
      definition: definition.trim(),
      examples: [],
      addedDate: new Date(),
      reviewCount: 0,
      nextReviewDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
      })(),
      easeFactor: 2.5,
      mastered: false,
      sourceBook: book?.title,
    };

    addWord(newWord);

    // 同步加入错题本（生词分类）
    if (book) {
      addMistake({
        id: `mistake-word-${Date.now()}`,
        bookId: book.id,
        type: 'word',
        content: word.trim(),
        answer: definition.trim(),
        pageNumber: currentPage,
        createdAt: new Date().toISOString(),
      });
    }

    // D1.2: 同步持久化高亮——复用 word-lookup 的确定性 id，升级为 word-added（绿色）
    // 若用户直接从选区加词（无 word-lookup 历史），则新建 word-added 高亮
    if (book) {
      const locator = lastClickedWordLocatorRef.current;
      // PDF 模式：已有 locator（itemIndex + offsets）
      if (locator && locator.type === 'pdf-text-item' && locator.itemIndex != null && locator.startOffset != null && locator.endOffset != null) {
        const newHighlight: PersistedHighlight = {
          id: `wl-${book.id}-${currentPage}-${locator.itemIndex}-${locator.startOffset}-${locator.endOffset}`,
          bookId: book.id,
          pageNumber: currentPage,
          locator,
          text: word,
          color: 'green',
          source: 'word-added',
          createdAt: new Date().toISOString(),
        };
        saveHighlight(newHighlight).catch((e) => console.warn('saveHighlight failed:', e));
        setHighlightsVersion((v) => v + 1);
      } else {
        // EPUB 模式：用 range 生成 cfi
        const epubRange = lastClickedEpubRangeRef.current;
        const epubBook = epubBookRef.current;
        if (epubRange && epubBook) {
          try {
            const section = epubBook.spine.get(currentPage - 1);
            if (section) {
              const cfiRange = section.cfiFromRange(epubRange);
              if (cfiRange) {
                const newHighlight: PersistedHighlight = {
                  id: `wl-epub-${book.id}-${cfiRange}`,
                  bookId: book.id,
                  pageNumber: currentPage,
                  locator: { type: 'epub-cfi', cfiRange },
                  text: word,
                  color: 'green',
                  source: 'word-added',
                  createdAt: new Date().toISOString(),
                };
                saveHighlight(newHighlight).catch((e) => console.warn('saveHighlight failed:', e));
                setHighlightsVersion((v) => v + 1);
              }
            }
          } catch (e) {
            console.warn('EPUB cfi generation failed:', e);
          }
        }
      }
    }

    setAddedToVocab(lowerWord);
    setVocabToast('已添加到生词本');
    setTimeout(() => {
      setVocabToast('');
    }, 2000);
  }, [addWord, vocabularyWords, book?.title, currentPage]);

  // ==== EPUB book 就绪回调：存到 ref 供 cfi 生成 ====
  const handleEpubBookReady = useCallback((b: ePub.Book) => {
    epubBookRef.current = b;
  }, []);

  // ==== 点击持久化高亮：弹出删除气泡 ====
  // EPUB 持久化高亮点击：epubjs annotation callback 不传 event，用 fallback 位置
  const handleHighlightClick = useCallback((h: PersistedHighlight, event?: MouseEvent) => {
    const top = event ? event.clientY + 8 : window.innerHeight - 140;
    const left = event ? event.clientX : window.innerWidth / 2 - 100;
    setHighlightBubble({ highlightId: h.id, top, left });
  }, []);

  // ==== 删除持久化高亮 ====
  const handleDeleteHighlight = useCallback(async () => {
    if (!book || !highlightBubble) return;
    try {
      await deleteHighlight(book.id, currentPage, highlightBubble.highlightId);
    } catch (e) {
      console.warn('deleteHighlight failed:', e);
    }
    setHighlightBubble(null);
    setHighlightsVersion((v) => v + 1);
  }, [book, currentPage, highlightBubble]);

  // ==== 模式切换 ====
  const handleModeChange = (mode: 'read' | 'note') => {
    setNoteMode(mode === 'note');
    // 切换模式时重置缩放
    setZoom(1);
    // 清除可能残留的文字选中
    window.getSelection()?.removeAllRanges();
    setShowToolbar(false);
    clearWordHighlight();
    setTranslation(null);
    // 退出 AI 选区模式
    setAiSelectionMode('none');
  };

  // ==== AI 按钮：进入框选模式 ====
  const handleAIClick = () => {
    if (chatPopup.visible) {
      closeChatPopup();
      return;
    }
    setShowDocumentPanel(false);
    setShowMistakeBook(false);
    setShowHighlightManager(false);
    setShowNavigator(false);
    setShowAudioPanel(false);
    setAiSelectionMode('rect');
    setSolverError('');
  };

  // ==== 关闭 AI 对话弹窗 ====
  const closeChatPopup = useCallback(() => {
    setChatPopup({ visible: false, x: 0, y: 0 });
    setSolverMessages([]);
    setSolverError('');
    setSolverFollowUp('');
    setSolverLoading(false);
    setPendingChatImage(null);
    aiSelectedImageRef.current = null;
    aiApiHistoryRef.current = [];
    setAiSelectionMode('none');
    setRectSelect(null);
  }, []);

  // ==== 区域截图：截取指定矩形区域 ====
  const captureRegion = useCallback((rect: { x: number; y: number; w: number; h: number }): string | null => {
    const container = containerRef.current;
    if (!container) { console.warn('[AI] captureRegion: container not found'); return null; }

    const canvases = container.querySelectorAll('canvas') as NodeListOf<HTMLCanvasElement>;
    if (canvases.length > 0) {
      let bestCanvas: HTMLCanvasElement | null = null;
      let bestArea = 0;
      let bestCrop = { fx: 0, fy: 0, fw: 0, fh: 0 };

      for (const canvas of Array.from(canvases)) {
        const canvasRect = canvas.getBoundingClientRect();
        const ix = Math.max(rect.x, canvasRect.left);
        const iy = Math.max(rect.y, canvasRect.top);
        const iw = Math.min(rect.x + rect.w, canvasRect.right) - ix;
        const ih = Math.min(rect.y + rect.h, canvasRect.bottom) - iy;
        if (iw <= 0 || ih <= 0) continue;
        const area = iw * ih;
        if (area > bestArea) {
          bestArea = area;
          bestCanvas = canvas;
          const dpr = window.devicePixelRatio || 1;
          const sx = (ix - canvasRect.left) * dpr;
          const sy = (iy - canvasRect.top) * dpr;
          const sw = iw * dpr;
          const sh = ih * dpr;
          bestCrop = {
            fx: Math.max(0, Math.floor(sx)),
            fy: Math.max(0, Math.floor(sy)),
            fw: Math.min(Math.ceil(sw), canvas.width - Math.max(0, Math.floor(sx))),
            fh: Math.min(Math.ceil(sh), canvas.height - Math.max(0, Math.floor(sy))),
          };
        }
      }

      if (bestCanvas && bestCrop.fw > 0 && bestCrop.fh > 0) {
        try {
          // 压缩截图：限制最长边不超过 1280px，使用 JPEG 减少体积和 token 消耗
          const MAX_EDGE = 1280;
          let outW = bestCrop.fw;
          let outH = bestCrop.fh;
          if (outW > MAX_EDGE || outH > MAX_EDGE) {
            const scale = Math.min(MAX_EDGE / outW, MAX_EDGE / outH);
            outW = Math.round(outW * scale);
            outH = Math.round(outH * scale);
          }
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = outW;
          tempCanvas.height = outH;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(bestCanvas, bestCrop.fx, bestCrop.fy, bestCrop.fw, bestCrop.fh, 0, 0, outW, outH);
            const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.82);
            console.log('[AI] captureRegion: captured', { origW: bestCrop.fw, origH: bestCrop.fh, outW, outH, size: Math.round(dataUrl.length / 1024) + 'KB' });
            return dataUrl;
          }
        } catch (e) {
          console.warn('[AI] captureRegion: canvas crop failed', e);
        }
      }

      const firstCanvas = canvases[0];
      try {
        const fullShot = firstCanvas.toDataURL('image/png');
        console.warn('[AI] captureRegion: no intersecting canvas, falling back to first canvas');
        return fullShot;
      } catch (e) {
        console.warn('[AI] captureRegion: fallback also failed', e);
        return null;
      }
    }

    console.log('[AI] captureRegion: no canvas found (EPUB/TXT mode), will use text fallback');
    return null;
  }, []);

  // ==== 打开 AI 对话弹窗（不自动发送，等待用户输入问题）====
  const openAIChatWithRegion = useCallback((rect: { x: number; y: number; w: number; h: number }) => {
    const image = captureRegion(rect);
    aiSelectedImageRef.current = image;
    console.log('[AI] openAIChatWithRegion:', { rect, hasImage: !!image, imageSize: image ? Math.round(image.length / 1024) + 'KB' : 'none' });

    const POPUP_W = 380;
    let popupX: number;
    if (rect.x + rect.w + POPUP_W + 16 <= window.innerWidth) {
      popupX = rect.x + rect.w + 12;
    } else if (rect.x - POPUP_W - 16 >= 0) {
      popupX = rect.x - POPUP_W - 12;
    } else {
      popupX = Math.max(10, (window.innerWidth - POPUP_W) / 2);
    }
    const popupY = Math.max(70, Math.min(rect.y - 10, window.innerHeight - 400));

    setChatPopup({ visible: true, x: popupX, y: popupY });
    setSolverError('');
    setAiSelectionMode('none');
    setRectSelect(null);
    setSolverMessages([]);
    setSolverLoading(false);
    setSolverFollowUp('');
    setPendingChatImage(image);
    aiApiHistoryRef.current = [];
  }, [captureRegion]);

  // ==== AI 对话弹窗：发送消息核心逻辑 ====
  const sendChatMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || solverLoading) return;
    setSolverError('');

    const trimmedPrompt = prompt.trim();
    const isFirstMessage = solverMessagesRef.current.length === 0;
    setSolverFollowUp('');
    setSolverLoading(true);
    setPendingChatImage(null);

    const image = aiSelectedImageRef.current;
    const userMsg: ChatMessage = { role: 'user', content: trimmedPrompt, image: isFirstMessage && image ? image : undefined };
    const prevDisplay = solverMessagesRef.current;
    const prevApi = aiApiHistoryRef.current;
    const newDisplayMsgs = [...prevDisplay, userMsg];
    setSolverMessages(newDisplayMsgs);

    const timeoutMs = 90000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('请求超时（90秒），请检查网络连接后重试')), timeoutMs)
    );

    try {
      let result: string;
      if (isFirstMessage && image) {
        result = await Promise.race([solveFromImage(image, trimmedPrompt, prevApi), timeoutPromise]);
        aiSelectedImageRef.current = null;
      } else if (isFirstMessage) {
        const pageText = containerRef.current?.innerText?.slice(0, 2000) || '';
        result = await Promise.race([askFromText(pageText, trimmedPrompt, prevApi), timeoutPromise]);
      } else {
        result = await Promise.race([askFromText('', trimmedPrompt, prevApi), timeoutPromise]);
      }
      const assistantMsg: ChatMessage = { role: 'assistant', content: result };
      setSolverMessages([...newDisplayMsgs, assistantMsg]);
      aiApiHistoryRef.current = [...prevApi, { role: 'user', content: trimmedPrompt }, assistantMsg];
    } catch (e) {
      console.error('[AI] send error:', e);
      setSolverError((e as Error).message);
      setSolverMessages(prevDisplay);
    } finally {
      setSolverLoading(false);
    }
  }, [solverLoading]);

  const handleChatFollowUp = useCallback(() => {
    sendChatMessage(solverFollowUp);
  }, [sendChatMessage, solverFollowUp]);

  const handleQuickAction = useCallback((prompt: string) => {
    sendChatMessage(prompt);
  }, [sendChatMessage]);

  // ==== 阅读模式矩形框选：mousedown/mousemove/mouseup ====
  const handleRectMouseDown = useCallback((e: React.MouseEvent) => {
    if (aiSelectionMode !== 'rect' || noteMode) return;
    if ((e.target as HTMLElement).closest('header, [class*="z-50"], button')) return;
    e.preventDefault();
    setRectSelect({
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });
  }, [aiSelectionMode, noteMode]);

  useEffect(() => {
    if (aiSelectionMode !== 'rect' || noteMode || !rectSelect?.active) return;
    const handleMove = (e: MouseEvent) => {
      setRectSelect(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
    };
    const handleUp = () => {
      setRectSelect(prev => {
        if (!prev) return null;
        const x = Math.min(prev.startX, prev.currentX);
        const y = Math.min(prev.startY, prev.currentY);
        const w = Math.abs(prev.currentX - prev.startX);
        const h = Math.abs(prev.currentY - prev.startY);
        if (w > 10 && h > 10) {
          setTimeout(() => openAIChatWithRegion({ x, y, w, h }), 50);
        } else {
          setAiSelectionMode('none');
        }
        return null;
      });
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [aiSelectionMode, noteMode, rectSelect?.active, openAIChatWithRegion]);

  // ==== ESC 关闭 AI 弹窗/取消框选 ====
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (chatPopup.visible) {
          closeChatPopup();
        } else if (aiSelectionMode !== 'none') {
          setAiSelectionMode('none');
          setRectSelect(null);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [chatPopup.visible, aiSelectionMode, closeChatPopup]);

  // ==== AI 文字选区：用户主动选中文本后弹出翻译/问AI菜单 ====
  useEffect(() => {
    if (aiSelectionMode !== 'text') return;
    const handler = async () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (text.length < 1) return;
      setAiSelectionMode('none');
      setShowSolverPanel(true);
      setSolverError('');
      const userMsg: ChatMessage = { role: 'user', content: text };
      setSolverMessages([userMsg]);
      setSolverLoading(true);
      try {
        const result = await askFromText(text, '请解释以下内容：', []);
        setSolverMessages([{ role: 'user', content: text }, { role: 'assistant', content: result }]);
      } catch (e) {
        setSolverError((e as Error).message);
      } finally {
        setSolverLoading(false);
      }
      sel?.removeAllRanges();
    };
    document.addEventListener('mouseup', handler);
    return () => document.removeEventListener('mouseup', handler);
  }, [aiSelectionMode]);

  // ==== 便签：创建新便签 ====
  const handleCreateStickyNote = () => {
    if (!book) return;
    const id = `sticky-${Date.now()}`;
    // 在视口中央偏右位置创建
    const x = window.innerWidth / 2 - 120;
    const y = 120;
    const newNote: StickyNoteData = {
      id,
      bookId: book.id,
      pageNumber: currentPage,
      x,
      y,
      width: 240,
      height: 240,
      color: 'yellow',
      minimized: false,
      minimizedX: x,
      minimizedY: y,
      tldrawSnapshot: null,
      createdAt: new Date().toISOString(),
    };
    setStickyNotes((prev) => [...prev, newNote]);
    saveStickyNote(newNote).catch((e) => console.warn('[Reader] save sticky note failed:', e));
  };

  // ==== 便签更新（拖拽/颜色/缩小后同步 state + 存储） ====
  const handleStickyNoteUpdate = useCallback((updated: StickyNoteData) => {
    setStickyNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }, []);

  // ==== 便签删除 ====
  const handleStickyNoteDelete = useCallback((id: string) => {
    setStickyNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // ==== 图片插入 ====
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tldrawEditorRef.current) return;
    // 笔记模式：通过 tldraw editor 插入画布
    const ed = tldrawEditorRef.current;
    (async () => {
      try {
        const asset = await ed.getAssetForExternalContent({ type: 'file', file });
        if (asset) {
          const center = ed.getViewportPageBounds().center;
          await (await import('tldraw')).createShapesForAssets(ed, [asset], center);
        }
      } catch (err) {
        console.warn('insert image failed:', err);
      }
    })();
    e.target.value = '';
  };

  // ==== 缩放控制 ====
  const zoomIn = () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)));
  const zoomReset = () => setZoom(1);

  // ==== 双指 pinch 缩放（平板用） ====
  // 两指距离变化比 × 当前 zoom → 新 zoom（限制 1~3）
  // 双指 touchmove 时 preventDefault 阻止浏览器默认缩放/滚动
  const pinchStateRef = useRef<{ initialDist: number; initialZoom: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const getDist = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStateRef.current = {
          initialDist: getDist(e.touches[0], e.touches[1]),
          initialZoom: zoomRef.current,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchStateRef.current) return;
      // 阻止浏览器默认双指缩放/滚动
      e.preventDefault();
      const curDist = getDist(e.touches[0], e.touches[1]);
      const { initialDist, initialZoom } = pinchStateRef.current;
      if (initialDist < 1) return;
      const ratio = curDist / initialDist;
      const newZoom = Math.min(3, Math.max(1, +(initialZoom * ratio).toFixed(2)));
      setZoom(newZoom);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStateRef.current = null;
    };

    // passive: false 才能 preventDefault
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==== 电脑端：ctrl/cmd + 滚轮 缩放（Mac 触控板双指捏合会触发 ctrl+wheel） ====
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Mac 触控板双指捏合/张开会带 ctrlKey；Windows/Linux 也可用 ctrl/cmd+滚轮
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // deltaY < 0 向上滚→放大；> 0 向下滚→缩小
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom((z) => Math.min(3, Math.max(1, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==== AI 解题：截取当前页面为图片 ====
  const captureCurrentPage = useCallback((): string | null => {
    if (!containerRef.current) return null;

    // 优先找 PDF 的 canvas
    const pdfCanvas = containerRef.current.querySelector('canvas');
    if (pdfCanvas) {
      return pdfCanvas.toDataURL('image/png');
    }

    // 如果是文本内容，用 html2canvas 思路：创建一个临时 canvas 绘制文本
    // 简化方案：直接返回 null，用文本模式
    return null;
  }, []);

  // ==== AI 框选解题：笔记模式 tldraw 框选 → 截图选区 → 浮动弹窗对话 ====
  const handleTldrawAISelect = useCallback(async (rect: { x: number; y: number; w: number; h: number }) => {
    setAiSelectionMode('none');

    const container = containerRef.current;
    const containerRect = container?.getBoundingClientRect();
    const pl = pageLayout;
    if (!containerRect || !pl) return;

    const screenRect = {
      x: containerRect.left + rect.x,
      y: containerRect.top + pl.top + rect.y,
      w: rect.w,
      h: rect.h,
    };

    console.log('[AI] handleTldrawAISelect: tldraw rect=', rect, 'screenRect=', screenRect);

    const POPUP_W = 380;
    let popupX: number;
    if (screenRect.x + screenRect.w + POPUP_W + 16 <= window.innerWidth) {
      popupX = screenRect.x + screenRect.w + 12;
    } else if (screenRect.x - POPUP_W - 16 >= 0) {
      popupX = screenRect.x - POPUP_W - 12;
    } else {
      popupX = Math.max(10, (window.innerWidth - POPUP_W) / 2);
    }
    const popupY = Math.max(70, Math.min(screenRect.y - 10, window.innerHeight - 400));

    const pageImage = captureRegion(screenRect);
    aiSelectedImageRef.current = pageImage;

    setChatPopup({ visible: true, x: popupX, y: popupY });
    setSolverError('');
    setRectSelect(null);
    setSolverMessages([]);
    setSolverLoading(false);
    setSolverFollowUp('');
    setPendingChatImage(pageImage);
    aiApiHistoryRef.current = [];
  }, [captureRegion, pageLayout]);

  // ==== 提取全书文本（PDF/EPUB/TXT 三种格式） ====
  // 用于 AI 文档助手；首次打开 AI 文档面板时懒加载，缓存到 documentTextRef
  const extractFullText = useCallback(async (): Promise<string> => {
    if (documentTextRef.current) return documentTextRef.current;

    // TXT 直接返回
    if (textContent) {
      documentTextRef.current = textContent;
      return textContent;
    }

    // EPUB：遍历 spine 各章
    if (epubBlob && epubBookRef.current) {
      const bk = epubBookRef.current;
      const items: any[] = [];
      // Spine 类型未暴露 spineItems，用 each 遍历收集
      bk.spine.each((section: any) => {
        items.push(section);
      });
      const parts: string[] = [];
      for (const item of items) {
        try {
          await item.load(bk.load.bind(bk));
          const text = item.document?.body?.innerText || '';
          parts.push(text);
          // unload 释放内存（部分版本可能没有该方法）
          if (typeof item.unload === 'function') {
            item.unload();
          }
        } catch (e) {
          console.warn('[Reader] epub spine load failed:', e);
        }
      }
      const full = parts.join('\n\n');
      documentTextRef.current = full;
      return full;
    }

    // PDF：加载独立 pdfDoc 遍历每页文本
    if (pdfBlob) {
      const arrayBuf = await pdfBlob.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuf });
      const pdf = await loadingTask.promise;
      const parts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((it: any) => it.str || '').join(' ');
        parts.push(text);
      }
      await loadingTask.destroy();
      const full = parts.join('\n\n');
      documentTextRef.current = full;
      return full;
    }

    return '';
  }, [textContent, epubBlob, pdfBlob]);

  // ==== 打开 AI 文档侧栏（与解题侧栏互斥 + 懒加载全文） ====
  const handleOpenDocumentPanel = useCallback(async () => {
    // 互斥：关解题
    setShowSolverPanel(false);
    // 已打开则关闭
    if (showDocumentPanel) {
      setShowDocumentPanel(false);
      return;
    }
    setShowDocumentPanel(true);

    // 懒加载全文（已缓存则直接同步赋值）
    if (!documentTextRef.current) {
      setDocumentTextLoading(true);
      try {
        const text = await extractFullText();
        setDocumentText(text);
      } catch (e) {
        console.warn('[Reader] extract full text failed:', e);
        setDocumentText('[提取失败，请重试]');
      } finally {
        setDocumentTextLoading(false);
      }
    } else {
      setDocumentText(documentTextRef.current);
    }
  }, [showDocumentPanel, extractFullText]);

  // ==== AI 解题：发送当前页面给 AI ====
  const handleSolverAsk = useCallback(async (promptText: string) => {
    setShowSolverPanel(true);
    setSolverError('');
    setSolverFollowUp('');
    setSolverLoading(true);

    const userMsg: ChatMessage = { role: 'user', content: promptText };
    const prevMessages = solverMessagesRef.current;
    const newMessages = [...prevMessages, userMsg];
    setSolverMessages(newMessages);

    try {
      let result: string;

      const pageImage = captureCurrentPage();

      if (pageImage) {
        result = await solveFromImage(pageImage, promptText, prevMessages);
      } else {
        const pageText = containerRef.current?.innerText || '';
        result = await askFromText(pageText.slice(0, 2000), promptText, prevMessages);
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: result };
      setSolverMessages([...newMessages, assistantMsg]);
    } catch (e) {
      setSolverError((e as Error).message);
      setSolverMessages(prevMessages);
    } finally {
      setSolverLoading(false);
    }
  }, [captureCurrentPage]);

  // ==== AI 解题：追加提问 ====
  const handleSolverFollowUp = useCallback(async () => {
    if (!solverFollowUp.trim() || solverLoading) return;

    setSolverLoading(true);
    setSolverError('');

    const userMsg: ChatMessage = { role: 'user', content: solverFollowUp };
    const prevMessages = solverMessagesRef.current;
    const newMessages = [...prevMessages, userMsg];
    setSolverMessages(newMessages);
    setSolverFollowUp('');

    try {
      let result: string;
      const pageImage = captureCurrentPage();

      if (pageImage) {
        result = await solveFromImage(pageImage, solverFollowUp, prevMessages);
      } else {
        const pageText = containerRef.current?.innerText || '';
        result = await askFromText(pageText.slice(0, 2000), solverFollowUp, prevMessages);
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: result };
      setSolverMessages([...newMessages, assistantMsg]);
    } catch (e) {
      setSolverError((e as Error).message);
      setSolverMessages(prevMessages);
    } finally {
      setSolverLoading(false);
    }
  }, [solverFollowUp, solverLoading, captureCurrentPage]);

  // ==== HTML/DOM 文本模式（article.prose）持久化高亮渲染 ====
  // 在文本内容挂载/切页/高亮版本变化后，用文本锚点查找 range 并用 overlay 渲染高亮
  useEffect(() => {
    if (!book) return;
    if (book.storageType === 'pdf-blob' || book.storageType === 'epub-blob') return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const article = container.querySelector('article.prose') as HTMLElement | null;
      if (!article || !article.textContent || article.textContent.trim().length === 0) return;
      try {
        const highlights = await getHighlightsByPage(book.id, currentPage);
        if (cancelled) return;
        renderDomTextHighlights(container, highlights, (h, event) => {
          handleHighlightClick(h, event);
        });
      } catch (e) {
        console.warn('Render DOM highlights failed:', e);
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      const oldLayer = container.querySelector('.lex-dom-highlight-layer');
      if (oldLayer) oldLayer.remove();
    };
  }, [book, currentPage, textContent, highlightsVersion, handleHighlightClick]);

  if (!book) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <p className="text-[#6B5E54]">书籍不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* 单词点击高亮样式 */}
      <style>{`
        .lex-word-highlight {
          background-color: rgba(212, 165, 116, 0.38);
          color: #B8860B;
          border-radius: 3px;
          box-shadow: 0 0 0 1px rgba(212, 165, 116, 0.35);
          padding: 0 1px;
          transition: background-color 0.15s;
        }
        /* PDF textLayer 用的独立高亮层：绝对定位 div 叠在单词上，不破坏 textLayer DOM */
        .lex-word-highlight-overlay {
          background-color: rgba(212, 165, 116, 0.35);
          border-radius: 3px;
          box-shadow: 0 0 0 1px rgba(212, 165, 116, 0.4);
          pointer-events: none;
          z-index: 5;
        }
      `}</style>
      {/* 顶部工具栏 - iOS 26 透明玻璃风格 */}
      <header
        className="sticky top-0 z-40 border-b border-white/30"
        style={{ backgroundColor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}
      >
        <div className="container mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
          {/* 左侧：返回 + 模式切换 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-full hover:bg-black/10 transition-colors text-[#4A3F35]"
              title="返回"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {!isOnline && (
              <span className="flex items-center gap-1 text-xs text-[#6B5E54] bg-black/5 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9B8E84]" />
                离线
              </span>
            )}

            {/* 阅读/笔记 模式切换胶囊（iOS 26 风格） */}
            <div className="flex items-center bg-black/5 rounded-full p-1">
              <button
                onClick={() => handleModeChange('read')}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  !noteMode
                    ? 'bg-white text-[#4A3F35] shadow-sm'
                    : 'text-[#6B5E54] hover:text-[#4A3F35]'
                )}
              >
                <BookOpen className="w-4 h-4" />
                阅读
              </button>
              <button
                onClick={() => handleModeChange('note')}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  noteMode
                    ? 'bg-white text-[#4A3F35] shadow-sm'
                    : 'text-[#6B5E54] hover:text-[#4A3F35]'
                )}
              >
                <PenTool className="w-4 h-4" />
                笔记
              </button>
            </div>
          </div>

          {/* 中间：书名 */}
          <h1 className="text-sm font-medium text-[#4A3F35] truncate max-w-[300px] text-center">
            {book.title}
          </h1>

          {/* 右侧：功能按钮组（玻璃胶囊） */}
          <div className="flex items-center gap-1.5">
            {/* 主功能组：AI → 错题本 → 便签 → 图片 → 录音 */}
            <div className="flex items-center gap-0.5 bg-black/5 rounded-full p-1">
              <button
                onClick={handleAIClick}
                title="AI 助手"
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                  (chatPopup.visible || aiSelectionMode !== 'none')
                    ? 'bg-[#D4A574] text-white shadow-sm'
                    : 'text-[#4A3F35] hover:bg-black/10'
                )}
              >
                <Sparkles className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowMistakeBook(true)}
                title="错题本"
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all text-[#4A3F35] hover:bg-black/10"
              >
                <BookMarked className="w-5 h-5" />
              </button>
              <button
                onClick={handleCreateStickyNote}
                title="便签"
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all text-[#4A3F35] hover:bg-black/10"
              >
                <StickyNoteIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => imageInputRef.current?.click()}
                title="插入图片"
                disabled={!noteMode}
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                  noteMode ? 'text-[#4A3F35] hover:bg-black/10' : 'text-[#9B8E84] opacity-50 cursor-not-allowed'
                )}
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowAudioPanel((v) => !v)}
                title="录音"
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                  showAudioPanel || isRecording
                    ? 'bg-[#D4A574] text-white shadow-sm'
                    : 'text-[#4A3F35] hover:bg-black/10'
                )}
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>

            {/* 辅助功能组：缩略图 / 手写搜索 / 文档导航 / 高亮管理 / 书签 / AI文档 */}
            <button
              onClick={() => {
                setShowThumbnails((v) => !v);
                setShowHandwritingSearch(false);
              }}
              title="页面缩略图"
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                showThumbnails
                  ? 'bg-[#D4A574] text-white shadow-sm'
                  : 'text-[#6B5E54] hover:bg-black/10'
              )}
            >
              <PanelRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setShowHandwritingSearch((v) => !v);
                setShowThumbnails(false);
              }}
              title="手写搜索"
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                showHandwritingSearch
                  ? 'bg-[#D4A574] text-white shadow-sm'
                  : 'text-[#6B5E54] hover:bg-black/10'
              )}
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowNavigator((v) => !v)}
              title="文档导航"
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                showNavigator
                  ? 'bg-[#D4A574] text-white shadow-sm'
                  : 'text-[#6B5E54] hover:bg-black/10'
              )}
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowHighlightManager((v) => !v)}
              title="高亮管理"
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                showHighlightManager
                  ? 'bg-[#D4A574] text-white shadow-sm'
                  : 'text-[#6B5E54] hover:bg-black/10'
              )}
            >
              <Highlighter className="w-5 h-5" />
            </button>
            <button
              onClick={handleOpenDocumentPanel}
              title="AI 文档助手"
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                showDocumentPanel
                  ? 'bg-[#D4A574] text-white shadow-sm'
                  : 'text-[#6B5E54] hover:bg-black/10'
              )}
            >
              <FileText className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                if (!book) return;
                const exists = useBookStore.getState().bookmarks.some(
                  (b) => b.bookId === book.id && b.pageNumber === currentPage,
                );
                if (exists) {
                  setVocabToast('当前页已有书签');
                  setTimeout(() => setVocabToast(''), 2000);
                  return;
                }
                addBookmark({
                  id: `bm-${Date.now()}`,
                  bookId: book.id,
                  pageNumber: currentPage,
                  title: `第 ${currentPage} 页书签`,
                  createdAt: new Date(),
                });
                setVocabToast('已添加书签');
                setTimeout(() => setVocabToast(''), 2000);
              }}
              title="添加当前页书签"
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all text-[#6B5E54] hover:bg-black/10"
            >
              <Bookmark className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI 选区模式提示条 */}
        {aiSelectionMode !== 'none' && (
          <div className="bg-[#D4A574] text-white text-center text-xs py-1.5 flex items-center justify-center gap-3">
            <span>
              {aiSelectionMode === 'text'
                ? '请在内容上选择文字，松开后自动问 AI'
                : noteMode
                  ? '请在笔记上框选区域后问 AI'
                  : '请在页面上拖拽框选要问 AI 的区域'}
            </span>
            <button
              onClick={() => { setAiSelectionMode('none'); setRectSelect(null); }}
              className="px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              取消
            </button>
          </div>
        )}

        {/* 隐藏的图片选择 input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* 笔记模式工具行：笔工具栏通过 Portal 渲染到这里 */}
        {noteMode && (
          <div className="border-t border-white/30 px-6 py-1.5 bg-gradient-to-b from-white/40 to-white/10">
            <div
              ref={setToolbarPortalEl}
              className="w-full min-h-[36px] flex items-center"
            />
          </div>
        )}
      </header>

      {/* 多页缩略图侧栏（仅 PDF 书，点击页跳转） */}
      {showThumbnails && pdfBlob && book && book.totalPages > 0 && (
        <PageThumbnailSidebar
          bookId={book.id}
          totalPages={book.totalPages}
          currentPage={currentPage}
          pdfBlob={pdfBlob}
          onJumpToPage={handleJumpToPage}
          onClose={() => setShowThumbnails(false)}
        />
      )}

      {/* 手写搜索侧栏（左侧，与缩略图互斥） */}
      {showHandwritingSearch && book && book.totalPages && book.totalPages > 0 && (
        <HandwritingSearchPanel
          bookId={book.id}
          totalPages={book.totalPages}
          onJumpToPage={handleJumpToPage}
          onClose={() => setShowHandwritingSearch(false)}
        />
      )}

      {/* ⭐ 阅读内容区 + tldraw 笔记层叠加（靠 body 滚动，PDF 连续浏览） */}
      <main
        ref={contentRef}
        className={cn('relative', noteMode ? '' : 'cursor-text', aiSelectionMode === 'rect' && !noteMode ? 'cursor-crosshair' : '')}
        onMouseDown={(e) => { handleMouseDown(e); handleRectMouseDown(e); }}
        onClick={handleClickWord}
      >
        <div
          ref={containerRef}
          className="container mx-auto px-6 py-8 max-w-3xl relative"
        >
          {/* 书籍内容 - 根据 storageType 切换渲染器 */}
          {contentLoading && (
            <div className="flex items-center justify-center py-20">
              <p className="text-[#9B8E84] animate-pulse">正在加载内容...</p>
            </div>
          )}

          {pdfBlob && !contentLoading && (
            <PdfViewer
              blob={pdfBlob}
              initialPage={currentPage}
              scale={zoom}
              onPageRendered={handleContentRendered}
              onTotalPages={handleTotalPages}
              onVisiblePageChange={handleVisiblePageChange}
              onWordClick={handlePdfWordClick}
              highlightsForPage={async (pageNum) => book ? getHighlightsByPage(book.id, pageNum) : []}
              onHighlightClick={handleHighlightClick}
              highlightsVersion={highlightsVersion}
              jumpToPageSignal={jumpToPageSignal}
              noteMode={noteMode}
            />
          )}

          {/* pdf-blob 类型但 blob 加载失败：显示错误提示 */}
          {book.storageType === 'pdf-blob' && !pdfBlob && !contentLoading && (
            <div className="text-center py-20 text-[#9B8E84]">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-[#4A3F35] font-medium">无法加载 PDF 文件</p>
              <p className="text-sm mt-2">文件可能未正确保存或已损坏，请尝试重新导入</p>
            </div>
          )}

          {epubBlob && !contentLoading && (
            <div ref={epubContentRef}>
              <EpubViewer
                blob={epubBlob}
                chapter={currentPage - 1}
                onRendered={handleContentRendered}
                onBookReady={handleEpubBookReady}
                getHighlights={async () => book ? getHighlightsByPage(book.id, currentPage) : []}
                onHighlightClick={handleHighlightClick}
                noteMode={noteMode}
              />
            </div>
          )}

          {/* epub-blob 类型但 blob 加载失败：显示错误提示 */}
          {book.storageType === 'epub-blob' && !epubBlob && !contentLoading && (
            <div className="text-center py-20 text-[#9B8E84]">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-[#4A3F35] font-medium">无法加载 EPUB 文件</p>
              <p className="text-sm mt-2">文件可能未正确保存或已损坏，请尝试重新导入</p>
            </div>
          )}

          {book.storageType !== 'pdf-blob' && book.storageType !== 'epub-blob' && !contentLoading && (
            <article ref={articleRef} className="prose prose-lg text-[#4A3F35] leading-relaxed select-text">
              {textContent ? (
                <BookContent content={textContent} page={currentPage} />
              ) : (
                <div className="text-center py-20 text-[#9B8E84]">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>无法加载本书内容</p>
                </div>
              )}
            </article>
          )}

          {/* ⭐ tldraw 笔记层 - 始终渲染；阅读模式只读叠加，笔记模式可编辑 */}
          {book && (pageLayout || noteMode) && (
            <Suspense
              fallback={
                <div
                  className="absolute z-20 left-0 flex items-center justify-center text-[#9B8E84] text-sm bg-[#FAF8F5]/60 backdrop-blur-sm"
                  style={{
                    top: pageLayout?.top ?? 0,
                    width: '100%',
                    height: pageLayout?.height ?? '100%',
                  }}
                >
                  加载笔记工具...
                </div>
              }
            >
              <div
                className="absolute z-20"
                style={{
                  left: 0,
                  top: pageLayout?.top ?? 0,
                  width: '100%',
                  height: pageLayout?.height ?? containerRef.current?.clientHeight ?? '100%',
                  // 阅读模式：pointer-events: none，让点击穿透到 PDF/EPUB 内容
                  // 笔记模式：pointer-events: auto，tldraw 画布接收书写输入
                  pointerEvents: noteMode ? 'auto' : 'none',
                }}
              >
                <TldrawEditor
                  key={`${book.id}-${currentPage}`}
                  bookId={book.id}
                  pageNumber={currentPage}
                  pageWidth={containerRef.current?.clientWidth ?? 800}
                  pageHeight={pageLayout?.height ?? containerRef.current?.clientHeight ?? 600}
                  pageLayout={pageLayout ?? { top: 0, height: containerRef.current?.clientHeight ?? 600 }}
                  onAISelect={handleTldrawAISelect}
                  aiSelectionMode={aiSelectionMode}
                  onEditorReady={(ed) => { tldrawEditorRef.current = ed; }}
                  recorderRef={audioRecorderRef}
                  readOnly={!noteMode}
                  toolbarPortalEl={toolbarPortalEl}
                />
              </div>
            </Suspense>
          )}
        </div>
      </main>

      {/* 持久化高亮删除气泡（点击高亮后弹出） */}
      {highlightBubble && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-[#E8E0D5] p-2 flex items-center gap-2"
          style={{ top: highlightBubble.top, left: highlightBubble.left }}
        >
          <Button
            size="sm"
            variant="secondary"
            className="!text-[#E85D75] hover:!bg-[#FCE8EC]"
            onClick={handleDeleteHighlight}
          >
            <Trash2 className="w-4 h-4" /> 删除高亮
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setHighlightBubble(null)}>取消</Button>
        </div>
      )}

      {/* 选中工具栏（仅阅读模式） */}
      {showToolbar && !noteMode && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-lg border border-[#E8E4DE] p-2 flex items-center gap-2"
          style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
        >
          <div className="flex items-center gap-1 mr-2">
            {(['yellow', 'green', 'blue', 'pink'] as const).map((color) => (
              <button
                key={color}
                onClick={() => setHighlightColor(color)}
                className={cn(
                  'w-6 h-6 rounded-full border-2 transition-all',
                  highlightColor === color ? 'border-[#4A3F35] scale-110' : 'border-transparent',
                  color === 'yellow' && 'bg-[#FFEB99]',
                  color === 'green' && 'bg-[#C8E6C9]',
                  color === 'blue' && 'bg-[#BBDEFB]',
                  color === 'pink' && 'bg-[#F8BBD9]'
                )}
              />
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={handleHighlight}>
            高亮
          </Button>
          <Button variant="secondary" size="sm" onClick={handleTranslate}>
            翻译
          </Button>
          <Button variant="secondary" size="sm" onClick={handleGrammarAnalyze}>
            语法分析
          </Button>
          <Button variant="secondary" size="sm" onClick={handleAIAsk}>
            <MessageCircle className="w-4 h-4 mr-1" />
            AI问答
          </Button>
        </div>
      )}

      {/* 翻译气泡 */}
      {translation && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-[#D4A574]/30 w-72 overflow-hidden"
          style={{ top: translation.top, left: Math.max(8, Math.min(translation.left - 144, window.innerWidth - 280)) }}
        >
          {/* 气泡小三角 */}
          <div className="absolute -top-2 w-4 h-4 bg-white border-l border-t border-[#D4A574]/30 rotate-45"
               style={{ left: '50%', marginLeft: '-8px' }} />
          {/* 原文 */}
          <div className="px-4 pt-3 pb-2 border-b border-[#E8E4DE] flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-[#4A3F35] line-clamp-2">{translation.text}</p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!translation.source && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">语法</span>
              )}
              <button
                onClick={() => setTranslation(null)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#9B8E84] hover:bg-[#E8E4DE] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* 译文 */}
          <div className="px-4 py-3">
            {translation.loading ? (
              <p className="text-sm text-[#6B5E54] animate-pulse">{translation.source ? '翻译中...' : '分析中...'}</p>
            ) : translation.error ? (
              <p className="text-sm text-[#E85D75]">{translation.error}</p>
            ) : (
              <>
                <p className={cn(
                  'text-[#4A3F35] font-medium whitespace-pre-wrap',
                  translation.source ? 'text-base' : 'text-sm max-h-60 overflow-y-auto'
                )}>{translation.result}</p>
                {/* 翻译来源标签 */}
                {translation.source && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full',
                      translation.source === 'dict' && 'bg-[#D4A574]/20 text-[#8B6F47]',
                      translation.source === 'online' && 'bg-blue-100 text-blue-600',
                      translation.source === 'wasm' && 'bg-green-100 text-green-600',
                      translation.source === 'offline-fallback' && 'bg-gray-100 text-gray-500',
                    )}>
                      {translation.source === 'dict' && '本地词典'}
                      {translation.source === 'online' && '在线翻译'}
                      {translation.source === 'wasm' && '离线AI'}
                      {translation.source === 'offline-fallback' && '离线逐词'}
                    </span>
                  </div>
                )}
                {/* 加入生词本按钮 */}
                {!/\s/.test(translation.text.trim()) && translation.text.length < 50 && (
                  <button
                    onClick={() => handleAddToVocab(translation.text, translation.result)}
                    disabled={addedToVocab === translation.text.toLowerCase().trim()}
                    className={cn(
                      'mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      addedToVocab === translation.text.toLowerCase().trim()
                        ? 'bg-[#C8E6C9] text-[#2E7D32]'
                        : 'bg-[#D4A574]/10 text-[#8B6F47] hover:bg-[#D4A574]/20'
                    )}
                  >
                    {addedToVocab === translation.text.toLowerCase().trim() ? (
                      <>
                        <Check className="w-4 h-4" />
                        已添加
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        加入生词本
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 添加生词本Toast */}
      {vocabToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#4A3F35] text-white px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-[#C8E6C9]" />
          {vocabToast}
        </div>
      )}

      {/* 翻页/页码控制：PDF 连续滚动用浮动页码气泡 + 缩放控件，EPUB/文本保留翻页栏 */}
      {pdfBlob ? (
        <>
          <div className="fixed bottom-4 right-4 z-30 bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-[#E8E4DE] px-3 py-1.5 text-xs text-[#6B5E54] pointer-events-none">
            {noteMode ? '✎ 笔记' : '📖 阅读'} · 第 {currentPage} 页
            {book.totalPages ? ` / ${book.totalPages}` : ''}
          </div>
          {/* 阅读模式浮动缩放控件（笔记模式有独立工具栏） */}
          {!noteMode && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-[#E8E4DE] px-2 py-1 flex items-center gap-1">
              <button
                onClick={zoomOut}
                disabled={zoom <= 1}
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center transition-all',
                  zoom <= 1 ? 'text-[#9B8E84] cursor-not-allowed' : 'text-[#4A3F35] hover:bg-[#E8E4DE]'
                )}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={zoomReset}
                className="px-2 h-7 rounded-full text-xs font-medium text-[#6B5E54] hover:bg-[#E8E4DE] transition-all min-w-[48px]"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={zoomIn}
                disabled={zoom >= 3}
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center transition-all',
                  zoom >= 3 ? 'text-[#9B8E84] cursor-not-allowed' : 'text-[#4A3F35] hover:bg-[#E8E4DE]'
                )}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      ) : (
        <footer className="sticky bottom-0 bg-[#FAF8F5]/95 backdrop-blur-sm border-t border-[#E8E4DE]">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between max-w-3xl">
            <Button
              variant="ghost"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-5 h-5" />
              上一页
            </Button>
            <span className="text-[#6B5E54] text-sm">
              {noteMode ? '✎ 笔记模式' : '📖 阅读模式'} · {' '}
              {book.storageType === 'epub-blob' ? `第 ${currentPage} 章` : `第 ${currentPage} 页`}
              {book.totalPages ? ` / ${book.totalPages}` : ''}
            </span>
            <Button
              variant="ghost"
              onClick={() => setCurrentPage((p) => (book.totalPages ? Math.min(book.totalPages, p + 1) : p + 1))}
              disabled={currentPage === book.totalPages}
            >
              下一页
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </footer>
      )}

      {/* AI问答弹窗（E1.1 接入真实 AI + 全文上下文） */}
      <AIModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        selectedText={selection.text}
        documentText={documentText}
      />

      {/* 阅读模式矩形框选层（z-40，在内容上方、弹窗下方） */}
      {aiSelectionMode === 'rect' && !noteMode && rectSelect && (
        <div className="fixed inset-0 z-40 cursor-crosshair pointer-events-none">
          <div
            className="absolute border-2 border-[#D4A574] bg-[#D4A574]/10 pointer-events-none"
            style={{
              left: Math.min(rectSelect.startX, rectSelect.currentX),
              top: Math.min(rectSelect.startY, rectSelect.currentY),
              width: Math.abs(rectSelect.currentX - rectSelect.startX),
              height: Math.abs(rectSelect.currentY - rectSelect.startY),
            }}
          />
        </div>
      )}

      {/* AI 浮动对话弹窗 */}
      {chatPopup.visible && (
        <AIChatPopup
          x={chatPopup.x}
          y={chatPopup.y}
          messages={solverMessages}
          loading={solverLoading}
          error={solverError}
          followUp={solverFollowUp}
          pendingImage={pendingChatImage}
          onFollowUpChange={setSolverFollowUp}
          onSend={handleChatFollowUp}
          onQuickAction={handleQuickAction}
          onClose={closeChatPopup}
          onAddToMistake={book ? (answer) => {
            const userMsg = solverMessagesRef.current[solverMessagesRef.current.length - 2];
            addMistake({
              id: `mistake-${Date.now()}`,
              bookId: book.id,
              type: noteMode ? 'math' : 'sentence',
              content: userMsg?.content || '',
              answer,
              pageNumber: currentPage,
              createdAt: new Date().toISOString(),
            });
            setVocabToast('已加入错题本');
            setTimeout(() => setVocabToast(''), 2000);
          } : undefined}
        />
      )}

      {/* AI 文档助手侧栏（与解题侧栏互斥） */}
      {showDocumentPanel && book && (
        <AIDocumentPanel
          documentText={documentText}
          bookTitle={book.title}
          loading={documentTextLoading}
          onClose={() => setShowDocumentPanel(false)}
        />
      )}

      {/* D1.4 高亮管理侧栏 */}
      {showHighlightManager && book && (
        <HighlightManagerPanel
          bookId={book.id}
          currentPage={currentPage}
          highlightsVersion={highlightsVersion}
          onJumpToPage={handleJumpToPage}
          onClose={() => setShowHighlightManager(false)}
        />
      )}
      {/* D3.4 文档导航侧栏 */}
      {showNavigator && book && (
        <DocumentNavigator
          bookId={book.id}
          totalPages={book.totalPages || 1}
          currentPage={currentPage}
          pdfBlob={pdfBlob}
          epubBook={epubBookRef.current}
          onClose={() => setShowNavigator(false)}
          onJumpToPage={handleJumpToPage}
        />
      )}
      {/* 录音笔记侧栏（从 TldrawEditor 迁移到 Reader，阅读/笔记模式均可用） */}
      {showAudioPanel && book && tldrawEditorRef.current && (
        <AudioNotePanel
          bookId={book.id}
          pageNumber={currentPage}
          editor={tldrawEditorRef.current}
          onClose={() => setShowAudioPanel(false)}
          onRecordingChange={setIsRecording}
          onRecorderReady={(r) => { audioRecorderRef.current = r; }}
        />
      )}

      {/* 错题本弹窗 */}
      {book && (
        <MistakeBookPanel
          bookId={book.id}
          bookTitle={book.title}
          isOpen={showMistakeBook}
          onClose={() => setShowMistakeBook(false)}
          onLocate={handleLocateMistake}
        />
      )}

      {/* 便签（阅读/笔记模式均可显示） */}
      {stickyNotes.map((note) => (
        <StickyNoteCard
          key={note.id}
          note={note}
          onUpdate={handleStickyNoteUpdate}
          onDelete={handleStickyNoteDelete}
        />
      ))}
    </div>
  );
}

// 渲染导入书籍的实际内容（按段落分页）
function BookContent({ content, page }: { content: string; page: number }) {
  // 按空行分段
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());
  const parasPerPage = 8; // 每页约 8 段
  const startIdx = (page - 1) * parasPerPage;
  const pageParas = paragraphs.slice(startIdx, startIdx + parasPerPage);

  if (pageParas.length === 0) {
    return <p className="text-[#9B8E84]">没有更多内容了</p>;
  }

  return (
    <>
      {pageParas.map((para, i) => {
        const trimmed = para.trim();
        // 检测标题行（以 # 开头或短行）
        if (trimmed.startsWith('#')) {
          return (
            <h2 key={i} className="text-2xl font-bold mb-6 text-[#4A3F35]">
              {trimmed.replace(/^#+\s*/, '')}
            </h2>
          );
        }
        if (trimmed.startsWith('>')) {
          return (
            <blockquote key={i} className="border-l-4 border-[#D4A574] pl-4 italic text-[#6B5E54] my-6">
              {trimmed.replace(/^>\s*/, '')}
            </blockquote>
          );
        }
        return (
          <p key={i} className="mb-4 whitespace-pre-line">{trimmed}</p>
        );
      })}
    </>
  );
}

function getHighlightClass(color: string): string {
  const classes = {
    yellow: 'bg-[#FFEB99]/50 px-1 rounded',
    green: 'bg-[#C8E6C9]/50 px-1 rounded',
    blue: 'bg-[#BBDEFB]/50 px-1 rounded',
    pink: 'bg-[#F8BBD9]/50 px-1 rounded',
  };
  return classes[color as keyof typeof classes] || classes.yellow;
}

function AIModal({
  isOpen,
  onClose,
  selectedText,
  documentText,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  documentText?: string;
}) {
  // E1.1 接入真实 AI（多轮对话）
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');

  const handleClose = () => {
    setMessages([]);
    setInput('');
    setLoading(false);
    onClose();
  };

  const sendQuestion = async (prompt: string) => {
    if (loading || !prompt.trim()) return;
    // 结合选中文字 + 全文上下文（节选 8000 字符防 token 超限）
    const context = documentText
      ? `${prompt}\n\n选中文字：${selectedText}\n\n文档全文（节选）：${documentText.slice(0, 8000)}`
      : `${prompt}\n\n选中文字：${selectedText}`;
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const answer = await askFromText(context, '你是一个学习助手，请用中文回答', messages);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `错误：${(e as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const presets = [
    { label: '理解这段话', prompt: '请帮我理解下面这段话的含义，用中文解释' },
    { label: '扩展知识点', prompt: '请围绕下面这段话扩展相关知识点' },
    { label: '帮我记忆', prompt: '请帮我把下面这段话整理成易记忆的要点' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="AI 问答" className="max-w-lg">
      <div className="mb-4">
        <p className="text-sm text-[#6B5E54] mb-2">选中的文字：</p>
        <div className="bg-[#E8E4DE] rounded-lg p-3 text-[#4A3F35] max-h-32 overflow-y-auto text-sm">
          "{selectedText}"
        </div>
      </div>
      {/* 预设按钮 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {presets.map((p) => (
          <Button key={p.label} variant="secondary" size="sm" onClick={() => sendQuestion(p.prompt)} disabled={loading}>
            {p.label}
          </Button>
        ))}
      </div>
      {/* 对话历史 */}
      {messages.length > 0 && (
        <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg p-3 text-sm whitespace-pre-line',
                m.role === 'user'
                  ? 'bg-[#E8E4DE] text-[#4A3F35]'
                  : 'bg-[#D4A574]/10 border border-[#D4A574]/30 text-[#4A3F35]',
              )}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="bg-[#D4A574]/10 rounded-lg p-3 animate-pulse">
              <p className="text-[#6B5E54] text-sm">AI 正在思考...</p>
            </div>
          )}
        </div>
      )}
      {/* 自由输入 */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              sendQuestion(input.trim());
              setInput('');
            }
          }}
          placeholder="输入你的问题..."
          className="flex-1 px-3 py-2 rounded-lg border border-[#E8E4DE] text-sm focus:outline-none focus:border-[#D4A574]"
        />
        <Button
          size="sm"
          onClick={() => {
            if (input.trim()) {
              sendQuestion(input.trim());
              setInput('');
            }
          }}
          disabled={loading || !input.trim()}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </Modal>
  );
}
