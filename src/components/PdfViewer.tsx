import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { renderPageHighlights } from '@/lib/pdfHighlightRenderer';
import type { PersistedHighlight } from '@/lib/storage';

interface PdfViewerProps {
  blob: Blob;
  initialPage?: number;
  /** 缩放倍数（1=原始大小），阅读/笔记模式都可用 */
  scale?: number;
  onPageRendered: () => void;
  onTotalPages?: (total: number) => void;
  /** 当前可见页变化时通知父组件（用于笔记 canvas 定位 + 页码显示） */
  onVisiblePageChange?: (
    page: number,
    rect: { top: number; height: number },
  ) => void;
  /** 点击单词回调（基于textContent数学计算，100%准确），返回词文本、client坐标矩形、定位器 */
  onWordClick?: (
    word: string,
    rect: { left: number; top: number; right: number; bottom: number },
    locator: { itemIndex: number; startOffset: number; endOffset: number } | null,
  ) => void;
  /** 获取某页的持久化高亮（textLayer 渲染完后调用） */
  highlightsForPage?: (pageNum: number) => Promise<PersistedHighlight[]> | PersistedHighlight[];
  /** 点击持久化高亮 */
  onHighlightClick?: (h: PersistedHighlight, event: MouseEvent) => void;
  /** 高亮版本号：外部加/删高亮后递增，触发已渲染页重新拉取高亮 */
  highlightsVersion?: number;
  /** 跳页信号：外部改变该值时，组件滚动到对应页 */
  jumpToPageSignal?: number;
  /** 笔记模式：true 时禁用 textLayer pointer events，让 tldraw 画布接收书写输入 */
  noteMode?: boolean;
}

export default function PdfViewer({
  blob,
  initialPage,
  scale = 1,
  onPageRendered,
  onTotalPages,
  onVisiblePageChange,
  onWordClick,
  highlightsForPage,
  onHighlightClick,
  highlightsVersion,
  jumpToPageSignal,
  noteMode = false,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);
  const pageDivsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderedPagesRef = useRef<Set<number>>(new Set());
  // 中断标志：组件卸载/切换文档时设 true，renderPage 检查后提前退出
  const abortedRef = useRef(false);
  // 初始滚动标记：initialPage 仅首次应用一次，避免与滚动→页码更新形成循环
  const hasScrolledRef = useRef(false);
  const onVisiblePageChangeRef = useRef(onVisiblePageChange);
  onVisiblePageChangeRef.current = onVisiblePageChange;
  // onTotalPages/onPageRendered 用 ref 读取，避免它们变化触发加载 effect（频闪根因）
  const onTotalPagesRef = useRef(onTotalPages);
  onTotalPagesRef.current = onTotalPages;
  const onPageRenderedRef = useRef(onPageRendered);
  onPageRenderedRef.current = onPageRendered;
  // scale 用 ref 读取，避免 scale 变化导致 renderPage 重建（renderPage 必须稳定）
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // noteMode 用 ref 读取，renderPage 中同步设置 canvas pointer-events
  const noteModeRef = useRef(noteMode);
  noteModeRef.current = noteMode;
  // 每页 textContent items + viewport，用于精准单词命中（不依赖DOM Range几何）
  const pageTextDataRef = useRef<Map<number, {
    items: Array<{ str: string; transform: number[]; width: number; height: number }>;
    viewport: any;
  }>>(new Map());
  const onWordClickRef = useRef(onWordClick);
  onWordClickRef.current = onWordClick;
  // highlightsForPage / onHighlightClick 用 ref，避免变化触发渲染重建
  const highlightsForPageRef = useRef(highlightsForPage);
  highlightsForPageRef.current = highlightsForPage;
  const onHighlightClickRef = useRef(onHighlightClick);
  onHighlightClickRef.current = onHighlightClick;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [numPages, setNumPages] = useState(0);
  // 每页占位高度（渲染前用第一页比例估算，渲染后更新为真实高度）
  const [pageHeights, setPageHeights] = useState<Map<number, number>>(new Map());

  // 加载 PDF 文档
  useEffect(() => {
    let cancelled = false;
    abortedRef.current = false; // 新文档加载，重置中断标志
    renderedPagesRef.current.clear(); // 清空已渲染记录，切换文档时重新渲染
    hasScrolledRef.current = false; // 重置初始滚动标记，允许新文档滚到 initialPage

    async function loadPdf() {
      setLoading(true);
      setError('');
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        loadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        onTotalPagesRef.current?.(pdf.numPages);

        // 用第 1 页估算所有页占位高度，避免滚动条跳动
        const firstPage = await pdf.getPage(1);
        const containerWidth = containerRef.current?.clientWidth || 800;
        const vp0 = firstPage.getViewport({ scale: 1 });
        const baseScale = containerWidth / vp0.width;
        const estHeight = vp0.height * baseScale * scale;
        const heights = new Map<number, number>();
        for (let i = 1; i <= pdf.numPages; i++) heights.set(i, estHeight);
        setPageHeights(heights);

        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('PDF 加载失败: ' + (e as Error).message);
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      abortedRef.current = true; // 中断所有进行中的渲染
      // loadingTask.destroy() 会取消 worker，正在渲染的页面会被终止
      loadingTaskRef.current?.destroy().catch(() => {});
    };
    // 仅依赖 blob，回调用 ref 读取，避免回调变化导致反复销毁重建 PDF
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  // 渲染单页：视觉层 + 文本层
  const renderPage = useCallback(
    async (pageNum: number) => {
      const pdf = pdfDocRef.current;
      const pageDiv = pageDivsRef.current.get(pageNum);
      if (!pdf || !pageDiv || renderedPagesRef.current.has(pageNum)) return;
      if (abortedRef.current) return; // 文档已切换/卸载，跳过
      renderedPagesRef.current.add(pageNum);

      try {
        const pdfPage = await pdf.getPage(pageNum);
        if (abortedRef.current) return; // await 后再次检查
        const containerWidth = pageDiv.clientWidth || 800;
        const vp0 = pdfPage.getViewport({ scale: 1 });
        const userScale = scaleRef.current;
        const renderScale = (containerWidth / vp0.width) * userScale;
        const scaledViewport = pdfPage.getViewport({ scale: renderScale });

        // 更新真实高度
        setPageHeights((prev) => {
          const n = new Map(prev);
          n.set(pageNum, scaledViewport.height);
          return n;
        });
        pageDiv.style.height = `${scaledViewport.height}px`;

        const canvas = pageDiv.querySelector('canvas') as HTMLCanvasElement | null;
        const textLayerDiv = pageDiv.querySelector('.textLayer') as HTMLDivElement | null;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = scaledViewport.width * dpr;
        canvas.height = scaledViewport.height * dpr;
        canvas.style.width = `${scaledViewport.width}px`;
        canvas.style.height = `${scaledViewport.height}px`;
        canvas.style.display = 'block';
        // 笔记模式下禁用 canvas pointer-events，让 tldraw 画布接收书写输入
        canvas.style.pointerEvents = noteModeRef.current ? 'none' : 'auto';
        ctx.scale(dpr, dpr);

        // ⚠️ pdfjs v6: 传 canvas 会忽略 canvasContext，故传 null 用预先 scale 过的 ctx
        await pdfPage
          .render({
            canvas: null,
            canvasContext: ctx,
            viewport: scaledViewport,
          })
          .promise;

        if (abortedRef.current) return; // 渲染完但已切换文档，跳过文本层

        // 获取文本内容（textLayer渲染+词命中检测都需要）
        const textContent = await pdfPage.getTextContent();
        if (abortedRef.current) return;

        // 文本层（pdfjs v6 TextLayer：使用 CSS 变量 + 百分比定位，需要 --total-scale-factor）
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          // 设置 --total-scale-factor：pdfjs v6 TextLayer 和 CSS 都依赖此变量来计算
          // 容器宽高、span font-size 和 scaleX。值为 viewport.scale（CSS pixel per PDF point）。
          textLayerDiv.style.setProperty('--total-scale-factor', String(scaledViewport.scale));
          try {
            const textLayer = new TextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: scaledViewport,
            });
            await textLayer.render();
            // 给每个文本 span 标记 data-item-index（正确映射到 textContent.items 数组索引）
            // textLayer.textDivs 只包含文本 span（跳过 markedContent 标记），按顺序排列
            const textDivs = textLayer.textDivs;
            let spanIdx = 0;
            for (let itemIdx = 0; itemIdx < textContent.items.length; itemIdx++) {
              const item = textContent.items[itemIdx] as { str?: string };
              if (item.str === undefined) continue;
              const span = textDivs[spanIdx++];
              if (span) {
                span.setAttribute('data-item-index', String(itemIdx));
              }
            }
          } catch (e) {
            console.warn('Text layer skipped:', e);
          }
        }

        // 保存 textContent items 用于精准词命中检测（不依赖DOM Range）
        pageTextDataRef.current.set(pageNum, {
          items: textContent.items as Array<{ str: string; transform: number[]; width: number; height: number }>,
          viewport: scaledViewport,
        });

        // 持久化高亮渲染（textLayer 已就绪，items + viewport 已存）
        try {
          const hl = highlightsForPageRef.current;
          if (hl) {
            const highlights = await hl(pageNum);
            if (highlights && highlights.length > 0) {
              renderPageHighlights(
                pageDiv,
                highlights,
                textContent.items as Array<{ str: string; transform: number[]; width: number; height: number }>,
                scaledViewport,
                onHighlightClickRef.current,
              );
            }
          }
        } catch (e) {
          console.warn('Persistent highlights render failed:', e);
        }

        onPageRenderedRef.current();
      } catch (e) {
        // 中断/销毁导致的渲染取消不算错误，静默处理
        // HMR 或文档切换时 abortedRef 可能被新周期重置，故同时过滤错误特征
        const msg = (e as Error)?.message || '';
        const isAbort =
          abortedRef.current ||
          /destroy|cancel|abort/i.test(msg);
        if (!isAbort) {
          console.error('Render page error:', e);
        }
        renderedPagesRef.current.delete(pageNum);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 用 ref 存最新的 renderPage，让 observer 不随 renderPage 变化重建
  const renderPageRef = useRef(renderPage);
  renderPageRef.current = renderPage;

  const visiblePageNumsRef = useRef<Set<number>>(new Set());
  const lastReportedPageRef = useRef<number>(0);

  // IntersectionObserver：懒渲染可见页 + 报告主可见页
  // 仅依赖 loading/numPages，避免滚动时 renderPage 变化导致 observer 反复重建
  useEffect(() => {
    if (loading || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 触发可见页渲染 + 更新可见页码集合
        entries.forEach((entry) => {
          const pageNum = Number((entry.target as HTMLElement).dataset.pageNum);
          if (entry.isIntersecting) {
            renderPageRef.current(pageNum);
            visiblePageNumsRef.current.add(pageNum);
          } else {
            visiblePageNumsRef.current.delete(pageNum);
          }
        });

        // 从所有可见页中选择最佳页：与视口重叠面积最大的页面
        let bestPage = 0;
        let bestArea = -1;
        const windowH = window.innerHeight;

        visiblePageNumsRef.current.forEach((pageNum) => {
          const div = pageDivsRef.current.get(pageNum);
          if (!div) return;
          const rect = div.getBoundingClientRect();
          const overlapTop = Math.max(rect.top, 0);
          const overlapBottom = Math.min(rect.bottom, windowH);
          const overlapHeight = Math.max(0, overlapBottom - overlapTop);
          if (overlapHeight > bestArea) {
            bestArea = overlapHeight;
            bestPage = pageNum;
          }
        });

        if (bestPage > 0 && bestPage !== lastReportedPageRef.current) {
          lastReportedPageRef.current = bestPage;
          const target = pageDivsRef.current.get(bestPage);
          if (target) {
            const r = target.getBoundingClientRect();
            onVisiblePageChangeRef.current?.(bestPage, {
              top: r.top,
              height: r.height,
            });
          }
        }
      },
      { root: null, rootMargin: '800px 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75] },
    );

    visiblePageNumsRef.current.clear();
    lastReportedPageRef.current = 0;
    pageDivsRef.current.forEach((div) => observer.observe(div));
    return () => observer.disconnect();
  }, [loading, numPages]);

  // scale 变化时：清空已渲染记录 + 清空各页 canvas，然后重新触发可见页渲染
  useEffect(() => {
    if (loading || numPages === 0) return;
    renderedPagesRef.current.clear();
    pageTextDataRef.current.clear();
    pageDivsRef.current.forEach((div) => {
      const canvas = div.querySelector('canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      const tl = div.querySelector('.textLayer');
      if (tl) tl.innerHTML = '';
    });
    // 重新渲染当前可见页（通过 observer 的回调机制触发）
    // 用 requestAnimationFrame 确保占位高度更新后再检测可见性
    requestAnimationFrame(() => {
      pageDivsRef.current.forEach((div) => {
        const rect = div.getBoundingClientRect();
        if (rect.top < window.innerHeight + 800 && rect.bottom > -800) {
          const pageNum = Number(div.dataset.pageNum);
          renderPageRef.current(pageNum);
        }
      });
    });
  }, [scale, loading, numPages]);

  // highlightsVersion 变化时：重新拉取并渲染所有已渲染页的持久化高亮
  // 首次挂载跳过（首次高亮在 renderPage 内已渲染）
  const firstHlVersionRef = useRef(true);
  useEffect(() => {
    if (firstHlVersionRef.current) {
      firstHlVersionRef.current = false;
      return;
    }
    if (loading || numPages === 0) return;
    const hl = highlightsForPageRef.current;
    if (!hl) return;
    let cancelled = false;
    (async () => {
      for (const [pageNum, pageData] of pageTextDataRef.current.entries()) {
        if (cancelled) return;
        const pageDiv = pageDivsRef.current.get(pageNum);
        if (!pageDiv) continue;
        try {
          const highlights = await hl(pageNum);
          if (cancelled) return;
          renderPageHighlights(
            pageDiv,
            highlights,
            pageData.items,
            pageData.viewport,
            onHighlightClickRef.current,
          );
        } catch (e) {
          console.warn('Refresh highlights failed for page', pageNum, e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [highlightsVersion, loading, numPages]);

  // ==== noteMode 变化时：同步所有已渲染 canvas + textLayer 的 pointer-events ====
  // JSX 的 style 只对初始渲染生效，renderPage 中 canvas.style 是逐页设置的；
  // 切换模式时需要遍历所有已渲染页，统一更新 pointer-events，让 tldraw 画布能/不能接收输入。
  useEffect(() => {
    const pe = noteMode ? 'none' : 'auto';
    pageDivsRef.current.forEach((div) => {
      const canvas = div.querySelector('canvas');
      if (canvas) canvas.style.pointerEvents = pe;
      const tl = div.querySelector('.textLayer');
      if (tl) (tl as HTMLElement).style.pointerEvents = pe;
    });
  }, [noteMode]);

  // 初始滚动到 initialPage（仅首次加载完成时执行一次，避免与滚动→页码更新形成循环）
  useEffect(() => {
    if (!loading && !hasScrolledRef.current && initialPage && initialPage > 1) {
      const div = pageDivsRef.current.get(initialPage);
      if (div) {
        div.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }
    if (!loading) hasScrolledRef.current = true;
  }, [loading, initialPage]);

  // 跳页信号：外部改变 jumpToPageSignal 时滚动到对应页（缩略图点击触发）
  useEffect(() => {
    if (jumpToPageSignal == null || jumpToPageSignal < 1) return;
    const div = pageDivsRef.current.get(jumpToPageSignal);
    if (div) {
      div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [jumpToPageSignal]);

  // 点击单词处理：三步命中法
  // Step 1: caretRangeFromPoint 全局获取点击位置
  // Step 2: 单词边界扫描 + Range 精确矩形 + 命中验证 + 邻近词修正
  // Step 3: elementsFromPoint 兜底 + 数学计算最终兜底
  const handleTextClick = useCallback((e: React.MouseEvent) => {
    // 笔记模式下禁用单词点击，避免拦截书写事件
    if (noteModeRef.current) return;
    const onWordClick = onWordClickRef.current;
    if (!onWordClick) return;

    const cx = e.clientX;
    const cy = e.clientY;
    const WORD_CHARS = /[A-Za-z']/;
    const WORD_REGEX = /[A-Za-z]+(?:'[A-Za-z]+)?/g;

    // 通过坐标查找 page div（不依赖 e.target）
    let pageDiv: HTMLElement | null = null;
    const pageDivs = pageDivsRef.current;
    for (const div of pageDivs.values()) {
      const r = div.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        pageDiv = div;
        break;
      }
    }
    if (!pageDiv) return;
    const pageNum = Number(pageDiv.dataset.pageNum);
    const pageData = pageTextDataRef.current.get(pageNum);
    if (!pageData) return;
    const { items, viewport } = pageData;
    const pageRect = pageDiv.getBoundingClientRect();

    interface FoundWord {
      word: string;
      range: Range;
      rect: { left: number; top: number; right: number; bottom: number };
    }

    // 辅助函数：从 span 的指定偏移向左/右扫描 [A-Za-z'] 字符找单词边界，跨 textNode 构建 Range
    const findWordAtOffset = (span: HTMLElement, globalOffset: number): FoundWord | null => {
      const fullText = span.textContent || '';
      if (globalOffset < 0 || globalOffset > fullText.length) return null;

      let start = globalOffset;
      let end = globalOffset;

      while (start > 0 && WORD_CHARS.test(fullText[start - 1])) start--;
      while (end < fullText.length && WORD_CHARS.test(fullText[end])) end++;

      if (start === end) return null;

      const word = fullText.slice(start, end);

      const range = document.createRange();
      let acc = 0;
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let startSet = false;
      let tn: Node | null;
      while ((tn = walker.nextNode())) {
        const tLen = (tn as Text).length;
        if (!startSet && start < acc + tLen) {
          range.setStart(tn, start - acc);
          startSet = true;
        }
        if (startSet && end <= acc + tLen) {
          range.setEnd(tn, end - acc);
          break;
        }
        acc += tLen;
      }

      const domRect = range.getBoundingClientRect();
      if (domRect.width <= 0 || domRect.height <= 0) return null;

      return {
        word,
        range,
        rect: { left: domRect.left, top: domRect.top, right: domRect.right, bottom: domRect.bottom },
      };
    };

    // 辅助函数：在 span 内找距离点击点最近的单词（Y方向必须在行高±8px内）
    const findNearestWordInSpan = (span: HTMLElement, clickX: number, clickY: number): FoundWord | null => {
      const fullText = span.textContent || '';
      let best: FoundWord | null = null;
      let bestDist = Infinity;

      WORD_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WORD_REGEX.exec(fullText))) {
        const found = findWordAtOffset(span, m.index);
        if (!found) continue;
        const { rect } = found;

        const lineCenter = (rect.top + rect.bottom) / 2;
        if (Math.abs(clickY - lineCenter) > 8) continue;

        const wordCx = (rect.left + rect.right) / 2;
        const wordCy = (rect.top + rect.bottom) / 2;
        const dist = Math.hypot(clickX - wordCx, clickY - wordCy);
        if (dist < bestDist) {
          bestDist = dist;
          best = found;
        }
      }
      return best;
    };

    // 辅助函数：从 items 中匹配 itemIndex/startOffset/endOffset
    const setLocator = (
      foundWord: FoundWord,
      span: HTMLElement | null,
      currentBest: { itemIndex: number; startOffset: number; endOffset: number } | null,
    ): { itemIndex: number; startOffset: number; endOffset: number } | null => {
      const { word, rect } = foundWord;
      const rectLeft = rect.left - pageRect.left;
      const rectRight = rect.right - pageRect.left;

      if (span) {
        const spanIdx = span.getAttribute('data-item-index');
        if (spanIdx !== null) {
          const itemIdx = Number(spanIdx);
          const item = items[itemIdx];
          if (item) {
            const wordIdx = item.str.indexOf(word);
            if (wordIdx !== -1) {
              return { itemIndex: itemIdx, startOffset: wordIdx, endOffset: wordIdx + word.length };
            }
          }
        }
      }

      for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        if (!item.str || !item.str.trim()) continue;
        if (!item.transform || item.transform.length < 6) continue;
        const [, b, c, d, tx, ty] = item.transform;
        if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue;
        const itemText = item.str;
        const wordIdxInItem = itemText.indexOf(word);
        if (wordIdxInItem === -1) continue;
        const fontSize = Math.abs(d);
        if (fontSize < 0.5) continue;

        const [vLeft] = viewport.convertToViewportPoint(tx, ty) as number[];
        const [vRight] = viewport.convertToViewportPoint(tx + item.width, ty) as number[];
        const itemW = vRight - vLeft;
        const charW = itemW / itemText.length;
        const wx0 = vLeft + wordIdxInItem * charW;
        const wx1 = vLeft + (wordIdxInItem + word.length) * charW;

        if (wx0 - 30 < rectRight && wx1 + 30 > rectLeft) {
          if (currentBest === null) {
            return { itemIndex: itemIdx, startOffset: wordIdxInItem, endOffset: wordIdxInItem + word.length };
          }
        }
      }
      return currentBest;
    };

    let word = '';
    let bestRect: { left: number; top: number; right: number; bottom: number } | null = null;
    let bestLocator: { itemIndex: number; startOffset: number; endOffset: number } | null = null;

    // Step 1: caretRangeFromPoint 全局获取点击位置
    const doc = (e.target as Node).ownerDocument || document;
    let caretNode: Node | null = null;
    let caretOffset = 0;

    if (doc.caretRangeFromPoint) {
      const caretRange = doc.caretRangeFromPoint(cx, cy);
      if (caretRange) {
        caretNode = caretRange.startContainer;
        caretOffset = caretRange.startOffset;
      }
    } else if ((doc as any).caretPositionFromPoint) {
      const pos = (doc as any).caretPositionFromPoint(cx, cy);
      if (pos) {
        caretNode = pos.offsetNode;
        caretOffset = pos.offset;
      }
    }

    // Step 2: 单词边界扫描 + Range 精确矩形 + 命中验证 + 邻近词修正
    let foundWord: FoundWord | null = null;
    let targetSpan: HTMLElement | null = null;

    if (caretNode && caretNode.nodeType === Node.TEXT_NODE) {
      const span = (caretNode as Text).parentElement;
      // 查找包含 data-item-index 的最近 span（支持直接子 span 和 markedContent 内 span）
      targetSpan = span?.closest('.textLayer span[data-item-index]') as HTMLElement | null;
      if (targetSpan) {
        let globalOffset = caretOffset;
        const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
        let tn: Node | null;
        let found = false;
        while ((tn = walker.nextNode())) {
          if (tn === caretNode) {
            found = true;
            break;
          }
          globalOffset += (tn as Text).length;
        }
        if (found) {
          const candidate = findWordAtOffset(span, globalOffset);
          if (candidate) {
            const { rect } = candidate;
            const hit = cx >= rect.left - 2 && cx <= rect.right + 2 &&
                       cy >= rect.top - 2 && cy <= rect.bottom + 2;
            if (hit) {
              foundWord = candidate;
            } else {
              const nearest = findNearestWordInSpan(span, cx, cy);
              if (nearest) foundWord = nearest;
            }
          } else {
            const nearest = findNearestWordInSpan(span, cx, cy);
            if (nearest) foundWord = nearest;
          }
        }
      }
    }

    // Step 3a: elementsFromPoint 兜底
    if (!foundWord) {
      const elements = doc.elementsFromPoint(cx, cy);
      for (const el of elements) {
        if (el instanceof HTMLElement) {
          // 查找 data-item-index span（支持直接子 span 和 markedContent 内 span）
          const span = el.closest('.textLayer span[data-item-index]') as HTMLElement | null;
          if (span) {
            targetSpan = span;
            const textLayer = span.closest('.textLayer');
            if (textLayer) {
              const allSpans = Array.from(
                textLayer.querySelectorAll('span[data-item-index]')
              ) as HTMLElement[];
              const idx = allSpans.indexOf(span);
              const searchSpans = idx >= 0
                ? [allSpans[idx], allSpans[idx - 1], allSpans[idx + 1]].filter(Boolean) as HTMLElement[]
                : [span];
              for (const s of searchSpans) {
                const nearest = findNearestWordInSpan(s, cx, cy);
                if (nearest) {
                  foundWord = nearest;
                  targetSpan = s;
                  break;
                }
              }
            }
            if (foundWord) break;
          }
        }
      }
    }

    if (foundWord) {
      word = foundWord.word;
      bestRect = foundWord.rect;
      bestLocator = setLocator(foundWord, targetSpan, null);
    }

    // Step 3b: 数学计算最终兜底
    if (!word || !bestRect) {
      const px = cx - pageRect.left;
      const py = cy - pageRect.top;
      let bestDist = Infinity;
      let bestIsDirectHit = false;

      for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        if (!item.str || !item.str.trim()) continue;
        if (!item.transform || item.transform.length < 6) continue;
        const [, b, c, d, tx, ty] = item.transform;
        if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue;
        const fontSize = Math.abs(d);
        if (fontSize < 0.5) continue;

        const [vLeft, vBaseY] = viewport.convertToViewportPoint(tx, ty) as number[];
        const [vRight] = viewport.convertToViewportPoint(tx + item.width, ty) as number[];
        const [, vAscentY] = viewport.convertToViewportPoint(tx, ty + fontSize) as number[];
        const [, vDescentY] = viewport.convertToViewportPoint(tx, ty - fontSize * 0.25) as number[];
        const ixMin = vLeft;
        const ixMax = vRight;
        const iyMin = Math.min(vAscentY, vBaseY, vDescentY);
        const iyMax = Math.max(vAscentY, vBaseY, vDescentY);

        if (px < ixMin - 6 || px > ixMax + 6 || py < iyMin - 6 || py > iyMax + 6) continue;

        const itemText = item.str;
        const itemW = ixMax - ixMin;
        WORD_REGEX.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = WORD_REGEX.exec(itemText))) {
          const ws = m.index;
          const we = m.index + m[0].length;
          const wx0 = ixMin + (ws / itemText.length) * itemW;
          const wx1 = ixMin + (we / itemText.length) * itemW;

          const insideX = px >= wx0 - 3 && px <= wx1 + 3;
          const insideY = py >= iyMin - 3 && py <= iyMax + 3;
          const directHit = insideX && insideY;
          const wordCx = (wx0 + wx1) / 2;
          const wordCy = (iyMin + iyMax) / 2;
          const dist = Math.hypot(px - wordCx, py - wordCy);

          if (directHit && (!bestIsDirectHit || dist < bestDist)) {
            bestIsDirectHit = true;
            bestDist = dist;
            word = m[0];
            bestRect = {
              left: pageRect.left + wx0,
              top: pageRect.top + iyMin,
              right: pageRect.left + wx1,
              bottom: pageRect.top + iyMax,
            };
            bestLocator = { itemIndex: itemIdx, startOffset: ws, endOffset: we };
          } else if (!bestIsDirectHit && dist < bestDist && dist < 22) {
            bestDist = dist;
            word = m[0];
            bestRect = {
              left: pageRect.left + wx0,
              top: pageRect.top + iyMin,
              right: pageRect.left + wx1,
              bottom: pageRect.top + iyMax,
            };
            bestLocator = { itemIndex: itemIdx, startOffset: ws, endOffset: we };
          }
        }
      }
    }

    if (word && bestRect) {
      onWordClick(word, bestRect, bestLocator);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#9B8E84] animate-pulse">正在加载 PDF...</p>
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

  return (
    <div
      ref={containerRef}
      className={`pdf-viewer-root flex flex-col items-center gap-3 ${noteMode ? 'note-mode' : ''}`}
      onClick={handleTextClick}
      style={{ pointerEvents: noteMode ? 'none' : 'auto' }}
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <div
          key={pageNum}
          data-page-num={pageNum}
          ref={(el) => {
            if (el) pageDivsRef.current.set(pageNum, el);
          }}
          className="relative shadow-lg rounded-lg overflow-hidden bg-white"
          style={{ height: pageHeights.get(pageNum) || 1000, width: '100%' }}
        >
          <canvas style={{ pointerEvents: noteMode ? 'none' : 'auto' }} />
          <div
            className="textLayer absolute top-0 left-0"
            style={{ opacity: 1, pointerEvents: noteMode ? 'none' : 'auto' }}
          />
        </div>
      ))}

      <style>{`
        .textLayer {
          position: absolute;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          line-height: 1;
          letter-spacing: normal;
          word-spacing: normal;
          -webkit-text-size-adjust: none;
          -moz-text-size-adjust: none;
          text-size-adjust: none;
          transform-origin: 0 0;
          z-index: 0;
          --scale-round-x: 1px;
          --scale-round-y: 1px;
          --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
          --min-font-size-inv: calc(1 / var(--min-font-size));
        }
        .textLayer :is(span, br) {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
          -webkit-user-select: text;
          -moz-user-select: text;
          user-select: text;
        }
        .textLayer > :not(.markedContent),
        .textLayer .markedContent > span {
          z-index: 1;
          --font-height: 0;
          font-size: calc(var(--text-scale-factor) * var(--font-height));
          --scale-x: 1;
          --rotate: 0deg;
          transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
        }
        .textLayer .markedContent {
          display: contents;
        }
        .textLayer ::selection {
          background: rgba(255, 235, 153, 0.5);
        }
        .textLayer span[role="img"] {
          -webkit-user-select: none;
          -moz-user-select: none;
          user-select: none;
          cursor: default;
        }
        /* 笔记模式下：禁用 PdfViewer 内所有元素的 pointer-events（含高亮层 z-index:5），
           让 tldraw 画布（z-20）独占书写输入。用 !important 覆盖高亮 div 的 inline pointer-events:auto */
        .pdf-viewer-root.note-mode,
        .pdf-viewer-root.note-mode * {
          pointer-events: none !important;
        }
      `}</style>
    </div>
  );
}
