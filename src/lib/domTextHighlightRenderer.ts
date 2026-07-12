import type { PersistedHighlight, HighlightColor } from './storage';

const COLOR_MAP: Record<HighlightColor, string> = {
  yellow: 'rgba(255, 235, 153, 0.55)',
  green: 'rgba(200, 230, 201, 0.55)',
  blue: 'rgba(187, 222, 251, 0.55)',
  pink: 'rgba(248, 187, 217, 0.55)',
};

const OVERLAY_LAYER_CLASS = 'lex-dom-highlight-layer';
const OVERLAY_CLASS = 'lex-dom-highlight';
const ANCHOR_LEN = 40;

function getTextNodesInContainer(container: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}

function getContainerFullText(container: HTMLElement): { text: string; nodes: Text[]; offsets: number[] } {
  const nodes = getTextNodesInContainer(container);
  const offsets: number[] = [];
  let text = '';
  for (const n of nodes) {
    offsets.push(text.length);
    text += n.textContent || '';
  }
  return { text, nodes, offsets };
}

function findRangeFromAnchor(
  container: HTMLElement,
  hlText: string,
  prefix: string,
  suffix: string,
): Range | null {
  const { text, nodes, offsets } = getContainerFullText(container);
  const probe = prefix + hlText + suffix;
  const idx = text.indexOf(probe);
  if (idx === -1) {
    const idx2 = text.indexOf(hlText);
    if (idx2 === -1) return null;
    return buildRange(nodes, offsets, idx2, idx2 + hlText.length);
  }
  const start = idx + prefix.length;
  const end = start + hlText.length;
  return buildRange(nodes, offsets, start, end);
}

function buildRange(nodes: Text[], offsets: number[], start: number, end: number): Range | null {
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const nStart = offsets[i];
    const nEnd = nStart + n.length;
    if (!startNode && start >= nStart && start <= nEnd) {
      startNode = n;
      startOff = start - nStart;
    }
    if (!endNode && end >= nStart && end <= nEnd) {
      endNode = n;
      endOff = end - nStart;
    }
    if (startNode && endNode) break;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, Math.max(0, Math.min(startOff, startNode.length)));
  range.setEnd(endNode, Math.max(0, Math.min(endOff, endNode.length)));
  return range;
}

function createHighlightDivs(
  layer: HTMLElement,
  containerRect: DOMRect,
  range: Range,
  h: PersistedHighlight,
  onClick?: (h: PersistedHighlight, event: MouseEvent) => void,
): void {
  const clientRects = range.getClientRects();
  const bg = COLOR_MAP[h.color];
  for (let i = 0; i < clientRects.length; i++) {
    const r = clientRects[i];
    if (r.width < 2 || r.height < 2) continue;
    const div = document.createElement('div');
    div.className = OVERLAY_CLASS;
    div.dataset.highlightId = h.id;
    div.style.cssText = `position:absolute;left:${r.left - containerRect.left}px;top:${r.top - containerRect.top}px;width:${r.width}px;height:${r.height}px;background:${bg};border-radius:2px;mix-blend-mode:multiply;pointer-events:auto;cursor:pointer;`;
    if (onClick) {
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick(h, e);
      });
    }
    layer.appendChild(div);
  }
}

export function renderDomTextHighlights(
  container: HTMLElement,
  highlights: PersistedHighlight[],
  onClick?: (h: PersistedHighlight, event: MouseEvent) => void,
): void {
  const oldLayer = container.querySelector('.' + OVERLAY_LAYER_CLASS);
  if (oldLayer) oldLayer.remove();

  const domHls = highlights.filter((h) => h.locator.type === 'dom-text-anchor');
  if (domHls.length === 0) return;

  const layer = document.createElement('div');
  layer.className = OVERLAY_LAYER_CLASS;
  layer.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:5;';
  container.appendChild(layer);

  requestAnimationFrame(() => {
    if (!container.contains(layer)) return;
    const containerRect = container.getBoundingClientRect();
    for (const h of domHls) {
      const range = findRangeFromAnchor(container, h.text, h.locator.prefix || '', h.locator.suffix || '');
      if (!range) continue;
      createHighlightDivs(layer, containerRect, range, h, onClick);
    }
  });
}

export function buildDomAnchorFromRange(range: Range, container: HTMLElement): { prefix: string; suffix: string } {
  const { text } = getContainerFullText(container);
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const pre = preRange.toString();
  const hlText = range.toString();
  const startInFull = pre.length;
  const endInFull = startInFull + hlText.length;
  const prefix = pre.slice(-ANCHOR_LEN);
  const suffix = text.slice(endInFull, endInFull + ANCHOR_LEN);
  return { prefix, suffix };
}

export function createTempDomHighlight(
  container: HTMLElement,
  range: Range,
  color: HighlightColor,
): void {
  const containerRect = container.getBoundingClientRect();
  const bg = COLOR_MAP[color];
  const layer = document.createElement('div');
  layer.className = OVERLAY_LAYER_CLASS + ' lex-temp-dom-hl';
  layer.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:6;';
  const clientRects = range.getClientRects();
  for (let i = 0; i < clientRects.length; i++) {
    const r = clientRects[i];
    if (r.width < 2 || r.height < 2) continue;
    const div = document.createElement('div');
    div.style.cssText = `position:absolute;left:${r.left - containerRect.left}px;top:${r.top - containerRect.top}px;width:${r.width}px;height:${r.height}px;background:${bg};border-radius:2px;mix-blend-mode:multiply;`;
    layer.appendChild(div);
  }
  container.appendChild(layer);
  setTimeout(() => layer.remove(), 1500);
}
