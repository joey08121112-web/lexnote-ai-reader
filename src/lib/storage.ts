import { createStore, get, set, del, keys } from 'idb-keyval';

// IndexedDB store：每个 store 独立 dbName，避免 idb-keyval 共享 db 时 schema 锁死
const blobStore = createStore('lexnote-file-blobs', 'kv');
const textStore = createStore('lexnote-text-content', 'kv');
const highlightsStore = createStore('lexnote-highlights', 'kv');

/** 存储原始文件二进制（PDF/EPUB） */
export async function saveFileBlob(bookId: string, blob: Blob): Promise<void> {
  await set(bookId, blob, blobStore);
}

/** 读取原始文件二进制 */
export async function getFileBlob(bookId: string): Promise<Blob | undefined> {
  return get<Blob>(bookId, blobStore);
}

/** 存储提取的文本内容（TXT/Word） */
export async function saveBookContent(bookId: string, content: string): Promise<void> {
  await set(bookId, content, textStore);
}

/** 读取提取的文本内容 */
export async function getBookContent(bookId: string): Promise<string | undefined> {
  return get<string>(bookId, textStore);
}

/** 删除书籍的所有存储数据 */
export async function deleteBookData(bookId: string): Promise<void> {
  await del(bookId, blobStore);
  await del(bookId, textStore);
  // D1: 删除该书所有页的持久化高亮
  await deleteHighlightsByBook(bookId);
}

// ==== 持久化高亮 ====

/**
 * 持久化高亮定位器
 * - PDF：基于 textContent item 的 pageIndex + itemIndex + 字符 offset（数学坐标，跨缩放稳定）
 * - EPUB：基于 epubjs 的 cfiRange（跨排版稳定）
 */
export interface HighlightLocator {
  type: 'pdf-text-item' | 'epub-cfi' | 'dom-text-anchor';
  // PDF 用
  pageIndex?: number;
  itemIndex?: number;
  startOffset?: number;
  endOffset?: number;
  // PDF 跨多 item 选区：末个 item 的 index 和 endOffset
  endItemIndex?: number;
  endItemEndOffset?: number;
  // EPUB 用
  cfiRange?: string;
  // HTML/DOM 文本用：通过文本锚点重新定位
  // prefix: 选中文本前的文本（最多40字符），suffix: 选中文本后的文本（最多40字符）
  prefix?: string;
  suffix?: string;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';
/** D1 扩展：word-lookup = 点词查翻译时自动创建的持久高亮 */
export type HighlightSource = 'manual-select' | 'word-added' | 'word-lookup';

export interface PersistedHighlight {
  id: string;
  bookId: string;
  pageNumber: number; // PDF 页码；EPUB 用 1
  locator: HighlightLocator;
  text: string;
  color: HighlightColor;
  source: HighlightSource;
  createdAt: string; // ISO string，便于 JSON 序列化
}

/** 复合 key：bookId:pageNumber */
function highlightKey(bookId: string, pageNumber: number): string {
  return `${bookId}:${pageNumber}`;
}

/** 保存单条高亮（read-modify-write） */
export async function saveHighlight(h: PersistedHighlight): Promise<void> {
  const key = highlightKey(h.bookId, h.pageNumber);
  const existing = (await get<PersistedHighlight[]>(key, highlightsStore)) || [];
  // 同 id 替换，否则追加
  const idx = existing.findIndex((x) => x.id === h.id);
  if (idx >= 0) {
    existing[idx] = h;
  } else {
    existing.push(h);
  }
  await set(key, existing, highlightsStore);
}

/** 获取某本书某页的所有高亮 */
export async function getHighlightsByPage(
  bookId: string,
  pageNumber: number,
): Promise<PersistedHighlight[]> {
  const key = highlightKey(bookId, pageNumber);
  return (await get<PersistedHighlight[]>(key, highlightsStore)) || [];
}

/** 删除单条高亮 */
export async function deleteHighlight(
  bookId: string,
  pageNumber: number,
  highlightId: string,
): Promise<void> {
  const key = highlightKey(bookId, pageNumber);
  const existing = (await get<PersistedHighlight[]>(key, highlightsStore)) || [];
  const filtered = existing.filter((x) => x.id !== highlightId);
  await set(key, filtered, highlightsStore);
}

/** 删除某本书某页的所有高亮（清空） */
export async function clearHighlightsByPage(
  bookId: string,
  pageNumber: number,
): Promise<void> {
  await del(highlightKey(bookId, pageNumber), highlightsStore);
}

// ==== D1 新增：按书维度的高亮管理 ====

/** 获取某本书所有页的所有高亮（用于高亮管理面板） */
export async function getHighlightsByBook(bookId: string): Promise<PersistedHighlight[]> {
  const prefix = `${bookId}:`;
  const allKeys = await keys(highlightsStore);
  const bookKeys = allKeys.filter((k) => String(k).startsWith(prefix));
  const result: PersistedHighlight[] = [];
  for (const k of bookKeys) {
    const pageHighlights = (await get<PersistedHighlight[]>(k, highlightsStore)) || [];
    result.push(...pageHighlights);
  }
  // 按页码 + 创建时间排序
  return result.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** 删除某本书的所有高亮（删书时清理） */
export async function deleteHighlightsByBook(bookId: string): Promise<void> {
  const prefix = `${bookId}:`;
  const allKeys = await keys(highlightsStore);
  const bookKeys = allKeys.filter((k) => String(k).startsWith(prefix));
  await Promise.all(bookKeys.map((k) => del(k, highlightsStore)));
}

// ==== 便签（Sticky Notes） ====

const stickyStore = createStore('lexnote-sticky-notes', 'kv');

export interface StickyNoteData {
  id: string;
  bookId: string;
  pageNumber: number;
  x: number; // 展开时位置（相对 viewport）
  y: number;
  width: number;
  height: number;
  color: string; // yellow / orange / pink / blue / green
  minimized: boolean;
  minimizedX: number; // 缩小后位置（创建时点击处）
  minimizedY: number;
  tldrawSnapshot: unknown; // tldraw 序列化数据
  createdAt: string;
}

/** 保存便签（新增或更新） */
export async function saveStickyNote(s: StickyNoteData): Promise<void> {
  await set(s.id, s, stickyStore);
}

/** 获取某本书的所有便签 */
export async function getStickyNotesByBook(bookId: string): Promise<StickyNoteData[]> {
  const allKeys = await keys(stickyStore);
  const result: StickyNoteData[] = [];
  for (const k of allKeys) {
    const note = await get<StickyNoteData>(k, stickyStore);
    if (note && note.bookId === bookId) result.push(note);
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 删除单条便签 */
export async function deleteStickyNote(id: string): Promise<void> {
  await del(id, stickyStore);
}

/** 删除某本书的所有便签（删书时清理） */
export async function deleteStickyNotesByBook(bookId: string): Promise<void> {
  const allKeys = await keys(stickyStore);
  for (const k of allKeys) {
    const note = await get<StickyNoteData>(k, stickyStore);
    if (note && note.bookId === bookId) await del(k, stickyStore);
  }
}

