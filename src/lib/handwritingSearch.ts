import Tesseract from 'tesseract.js';
import type { Editor } from 'tldraw';
import { get, set, del, createStore } from 'idb-keyval';
import { loadTldrawSnapshot } from './tldrawStorage';

export interface SearchResult {
  page: number;
  text: string;
  snippet: string;
}

// OCR 结果缓存到 IndexedDB（独立 dbName，避免 idb-keyval 共享 db 时 schema 锁死）
const ocrStore = createStore('lexnote-ocr-cache', 'kv');

// 单例 worker（避免重复加载 WASM + 训练数据，首次约 30 秒从 CDN 下载）
let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng+chi_sim');
  }
  return workerPromise;
}

/**
 * OCR 识别单页笔记文本
 * @param editor 已加载该页 snapshot 的临时 editor 实例
 */
async function recognizePageText(editor: Editor): Promise<string> {
  const shapes = editor.getCurrentPageShapesSorted();
  if (shapes.length === 0) return '';
  const { blob } = await editor.toImage(shapes, {
    format: 'png',
    scale: 2,
    pixelRatio: 1,
    background: true,
  });
  const worker = await getWorker();
  const { data } = await worker.recognize(blob);
  return data.text.trim();
}

async function getCachedOcr(bookId: string, page: number): Promise<string | null> {
  return (await get<string>(`${bookId}:${page}`, ocrStore)) ?? null;
}

async function setCachedOcr(bookId: string, page: number, text: string): Promise<void> {
  await set(`${bookId}:${page}`, text, ocrStore);
}

/**
 * 当某页 snapshot 更新时调用，删除该页 OCR 缓存
 * 下次搜索会自动重新识别该页
 */
export async function invalidateOcrCache(bookId: string, page: number): Promise<void> {
  await del(`${bookId}:${page}`, ocrStore);
}

/**
 * 全书手写搜索
 * @param tempEditor 临时 editor 实例（外部传入，复用避免反复挂载 Tldraw 组件）
 * @param bookId 书 ID
 * @param totalPages 总页数
 * @param query 搜索词
 * @param onProgress 进度回调 (0-1)
 */
export async function searchHandwrittenText(
  tempEditor: Editor,
  bookId: string,
  totalPages: number,
  query: string,
  onProgress?: (p: number) => void,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  for (let page = 1; page <= totalPages; page++) {
    let text = await getCachedOcr(bookId, page);
    if (text === null) {
      // 缓存未命中：加载 snapshot → 临时 editor → OCR → 缓存
      const snap = await loadTldrawSnapshot(bookId, page);
      if (snap) {
        tempEditor.loadSnapshot(snap);
        text = await recognizePageText(tempEditor);
      } else {
        text = '';
      }
      await setCachedOcr(bookId, page, text);
    }
    const lower = text.toLowerCase();
    const idx = lower.indexOf(lowerQuery);
    if (idx >= 0) {
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + query.length + 20);
      results.push({ page, text, snippet: text.slice(start, end) });
    }
    onProgress?.(page / totalPages);
  }
  return results;
}
