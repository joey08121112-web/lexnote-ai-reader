import type { PersistedHighlight, HighlightColor } from './storage';

/**
 * PDF 持久化高亮渲染器（纯函数，不依赖 React）
 *
 * 已知 locator (itemIndex + startOffset + endOffset) + viewport + items
 * 用与 PdfViewer.handleTextClick 一致的几何方法计算矩形，创建绝对定位的 div 叠在 pageDiv 上
 *
 * 支持跨多 item 选区：当 endItemIndex 设置时，渲染从 itemIndex 到 endItemIndex 之间所有 item 的高亮。
 */

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface Viewport {
  convertToViewportPoint: (x: number, y: number) => number[];
}

const COLOR_MAP: Record<HighlightColor, string> = {
  yellow: 'rgba(255, 235, 153, 0.55)',
  green: 'rgba(200, 230, 201, 0.55)',
  blue: 'rgba(187, 222, 251, 0.55)',
  pink: 'rgba(248, 187, 217, 0.55)',
};

const CONTAINER_CLASS = 'lex-persistent-highlight-layer';
const HIGHLIGHT_CLASS = 'lex-persistent-highlight';

function findSpanForItem(pageDiv: HTMLElement, itemIdx: number): HTMLElement | null {
  let span = pageDiv.querySelector(
    `.textLayer > span[data-item-index="${itemIdx}"]`,
  ) as HTMLElement | null;
  if (!span) {
    span = pageDiv.querySelector(
      `.textLayer .markedContent > span[data-item-index="${itemIdx}"]`,
    ) as HTMLElement | null;
  }
  return span;
}

function getTextNodes(el: HTMLElement): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    textNodes.push(n as Text);
  }
  return textNodes;
}

function measureRangeRect(
  span: HTMLElement,
  startOff: number,
  endOff: number,
  pageRect: DOMRect,
): { hx: number; hy: number; hw: number; hh: number } | null {
  const textNodes = getTextNodes(span);
  let acc = 0;
  let startNode: Text | null = null;
  let startNodeOff = 0;
  let endNode: Text | null = null;
  let endNodeOff = 0;
  for (const tn of textNodes) {
    const tLen = tn.length;
    if (!startNode && startOff < acc + tLen) {
      startNode = tn;
      startNodeOff = startOff - acc;
    }
    if (!endNode && endOff <= acc + tLen) {
      endNode = tn;
      endNodeOff = endOff - acc;
      break;
    }
    acc += tLen;
  }
  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, Math.max(0, Math.min(startNodeOff, startNode.length)));
    range.setEnd(endNode, Math.max(0, Math.min(endNodeOff, endNode.length)));
    const domRect = range.getBoundingClientRect();
    if (domRect.width > 0 && domRect.height > 0) {
      return {
        hx: domRect.left - pageRect.left,
        hw: domRect.width,
        hy: domRect.top - pageRect.top,
        hh: domRect.height,
      };
    }
  }
  return null;
}

function measureItemRectByMath(
  item: TextItem,
  startOff: number,
  endOff: number,
  viewport: Viewport,
  pageRect: DOMRect,
): { hx: number; hy: number; hw: number; hh: number } | null {
  const [, b, c, d, tx, ty] = item.transform;
  if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) return null;
  const fontSize = Math.abs(d);
  if (fontSize < 0.5) return null;

  const [vLeft, vBaseY] = viewport.convertToViewportPoint(tx, ty) as [number, number];
  const [vRight] = viewport.convertToViewportPoint(tx + item.width, ty) as [number, number];
  const [, vAscentY] = viewport.convertToViewportPoint(tx, ty + fontSize) as [number, number];
  const [, vDescentY] = viewport.convertToViewportPoint(tx, ty - fontSize * 0.25) as [number, number];

  const itemWidth = vRight - vLeft;
  const iyMin = Math.min(vAscentY, vBaseY, vDescentY);
  const iyMax = Math.max(vAscentY, vBaseY, vDescentY);
  const strLen = Math.max(1, item.str.length);
  const hx = vLeft + (startOff / strLen) * itemWidth;
  const hw = Math.max(2, ((endOff - startOff) / strLen) * itemWidth);
  return { hx, hy: iyMin, hw, hh: iyMax - iyMin };
}

function renderHighlightForItemRange(
  layer: HTMLElement,
  pageDiv: HTMLElement,
  pageRect: DOMRect,
  items: TextItem[],
  viewport: Viewport,
  h: PersistedHighlight,
  itemIdx: number,
  startOff: number,
  endOff: number,
  onClick?: (h: PersistedHighlight, event: MouseEvent) => void,
) {
  const item = items[itemIdx];
  if (!item || !item.str || !item.transform || item.transform.length < 6) return;

  // 优先 DOM Range 测量，失败则用数学计算
  let rect: { hx: number; hy: number; hw: number; hh: number } | null = null;
  const span = findSpanForItem(pageDiv, itemIdx);
  if (span) {
    rect = measureRangeRect(span, startOff, endOff, pageRect);
  }
  if (!rect) {
    rect = measureItemRectByMath(item, startOff, endOff, viewport, pageRect);
  }
  if (!rect || rect.hw < 2) return;

  const { hx, hy, hw, hh } = rect;
  const div = document.createElement('div');
  div.className = HIGHLIGHT_CLASS;
  div.dataset.highlightId = h.id;
  div.style.cssText = `position:absolute;left:${hx}px;top:${hy}px;width:${hw}px;height:${hh}px;background:${COLOR_MAP[h.color]};pointer-events:auto;cursor:pointer;border-radius:1px;mix-blend-mode:multiply;`;

  if (onClick) {
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(h, e);
    });
  }

  layer.appendChild(div);
}

/**
 * 渲染某页的所有持久化高亮
 * 在 textLayer 渲染完成后调用
 */
export function renderPageHighlights(
  pageDiv: HTMLElement,
  highlights: PersistedHighlight[],
  items: TextItem[],
  viewport: Viewport,
  onClick?: (h: PersistedHighlight, event: MouseEvent) => void,
): void {
  const oldLayer = pageDiv.querySelector('.' + CONTAINER_CLASS);
  if (oldLayer) oldLayer.remove();

  const pdfHighlights = highlights.filter(
    (h) => h.locator.type === 'pdf-text-item' && h.locator.itemIndex != null,
  );
  if (pdfHighlights.length === 0) return;

  const layer = document.createElement('div');
  layer.className = CONTAINER_CLASS;
  layer.style.cssText =
    'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:5;';

  pageDiv.appendChild(layer);

  requestAnimationFrame(() => {
    if (!pageDiv.contains(layer)) return;
    const pageRect = pageDiv.getBoundingClientRect();

    for (const h of pdfHighlights) {
      const loc = h.locator;
      const firstItem = loc.itemIndex!;
      const lastItem = loc.endItemIndex ?? firstItem;
      const firstStart = loc.startOffset ?? 0;
      const lastEnd = loc.endItemEndOffset ?? loc.endOffset ?? (items[lastItem]?.str?.length ?? 0);

      for (let ii = firstItem; ii <= lastItem; ii++) {
        const item = items[ii];
        if (!item) continue;
        const sOff = ii === firstItem ? firstStart : 0;
        const eOff = ii === lastItem ? lastEnd : item.str.length;
        if (sOff >= eOff) continue;
        renderHighlightForItemRange(
          layer, pageDiv, pageRect, items, viewport, h, ii, sOff, eOff, onClick,
        );
      }
    }
  });
}

/**
 * 清除某页的持久化高亮层
 */
export function clearPageHighlights(pageDiv: HTMLElement): void {
  const layer = pageDiv.querySelector('.' + CONTAINER_CLASS);
  if (layer) layer.remove();
}
