import { get, set, del, createStore } from 'idb-keyval';
import type { TLEditorSnapshot } from 'tldraw';

// tldraw 笔记数据独立 store（独立 dbName，避免 idb-keyval 共享 db 时 schema 锁死）
const tldrawStore = createStore('lexnote-tldraw', 'kv');

// 旧 localStorage 笔记 key（用于一次性迁移）
const oldNotesKey = (bookId: string, page: number) => `lexnote-notes-${bookId}-${page}`;

// 旧 Stroke 数据结构（与 Reader.tsx 中的 Stroke 一致）
interface OldStroke {
  points: { x: number; y: number; pressure?: number }[];
  color: string;
  size: number;
  type: 'fountain' | 'ballpoint' | 'highlighter' | 'marker' | 'eraser' | 'select';
}

/**
 * 迁移后的笔迹纯数据（不含 tldraw 类型耦合，TldrawEditor 负责构造 draw shape）
 * - originX/originY：shape 原点（所有点的最小 x/y）
 * - points：相对原点的坐标 [[x, y, pressure?], ...]
 * - color：旧 hex 颜色（TldrawEditor 映射到 tldraw 命名色）
 * - size：旧粗细数值（TldrawEditor 映射到 tldraw size 档）
 * - isHighlighter：是否荧光笔（影响 dash 属性）
 */
export interface MigratedStroke {
  originX: number;
  originY: number;
  points: number[][];
  color: string;
  size: number;
  isHighlighter: boolean;
}

function pageKey(bookId: string, page: number): string {
  return `${bookId}:${page}`;
}

/** 保存 tldraw snapshot 到 IndexedDB */
export async function saveTldrawSnapshot(
  bookId: string,
  page: number,
  snapshot: TLEditorSnapshot,
): Promise<void> {
  try {
    await set(pageKey(bookId, page), snapshot, tldrawStore);
  } catch (e) {
    console.error('[tldrawStorage] saveTldrawSnapshot failed:', e);
  }
}

/** 加载 tldraw snapshot（供 editor.loadSnapshot 用） */
export async function loadTldrawSnapshot(
  bookId: string,
  page: number,
): Promise<TLEditorSnapshot | null> {
  try {
    const v = await get<TLEditorSnapshot>(pageKey(bookId, page), tldrawStore);
    return v ?? null;
  } catch (e) {
    console.error('[tldrawStorage] loadTldrawSnapshot failed:', e);
    return null;
  }
}

/** 清空指定页的 tldraw 笔记 */
export async function clearTldrawPage(bookId: string, page: number): Promise<void> {
  try {
    await del(pageKey(bookId, page), tldrawStore);
  } catch (e) {
    console.error('[tldrawStorage] clearTldrawPage failed:', e);
  }
}

/**
 * 一次性迁移：旧 localStorage Stroke[] → MigratedStroke[]
 * - 迁移成功后删除旧 localStorage key（避免重复迁移）
 * - 失败时保留旧数据 + 控制台 warn，不阻断流程
 * - 仅迁移 fountain/ballpoint/marker/highlighter（跳过 eraser/select）
 * - points 用 perfect-freehand 格式，与 tldraw draw shape 同源，零转换
 */
export async function migrateOldStrokes(
  bookId: string,
  page: number,
): Promise<MigratedStroke[] | null> {
  try {
    const raw = localStorage.getItem(oldNotesKey(bookId, page));
    if (!raw) return null;
    const strokes: OldStroke[] = JSON.parse(raw);
    if (!Array.isArray(strokes) || strokes.length === 0) {
      // 空数组也算迁移成功，删除旧 key
      localStorage.removeItem(oldNotesKey(bookId, page));
      return null;
    }

    const migrated: MigratedStroke[] = [];
    for (const s of strokes) {
      // 跳过橡皮擦和框选工具（不产生可见笔迹）
      if (s.type === 'eraser' || s.type === 'select') continue;
      if (!s.points || s.points.length === 0) continue;

      // 计算原点（所有点的最小 x/y）
      let minX = Infinity;
      let minY = Infinity;
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
      }
      if (!isFinite(minX) || !isFinite(minY)) {
        minX = 0;
        minY = 0;
      }

      // 转换为相对原点的坐标 [[x, y, pressure?]]
      const points: number[][] = s.points.map((p) => {
        const arr = [p.x - minX, p.y - minY];
        if (typeof p.pressure === 'number') arr.push(p.pressure);
        return arr;
      });

      migrated.push({
        originX: minX,
        originY: minY,
        points,
        color: s.color,
        size: s.size,
        isHighlighter: s.type === 'highlighter',
      });
    }

    // 迁移成功，删除旧 key 避免重复迁移
    localStorage.removeItem(oldNotesKey(bookId, page));
    console.info(
      `[tldrawStorage] migrated ${migrated.length} strokes for ${bookId}:${page}`,
    );
    return migrated;
  } catch (e) {
    console.warn('[tldrawStorage] migrateOldStrokes failed, keep old data:', e);
    return null;
  }
}
