import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { createTLStore, type Editor } from 'tldraw';
import { Minus, X, Move } from 'lucide-react';
import type { StickyNoteData } from '@/lib/storage';
import { saveStickyNote, deleteStickyNote } from '@/lib/storage';
import { cn } from '@/lib/utils';

// 懒加载 tldraw（每个便签独立实例）
const Tldraw = lazy(() => import('tldraw').then((m) => ({ default: m.Tldraw })));

const COLORS: { value: string; bg: string; header: string; label: string }[] = [
  { value: 'yellow', bg: '#FEF9C3', header: '#F1C40F', label: '黄' },
  { value: 'orange', bg: '#FED7AA', header: '#E67E22', label: '橙' },
  { value: 'pink', bg: '#FBCFE8', header: '#EC4899', label: '粉' },
  { value: 'blue', bg: '#BFDBFE', header: '#3B82F6', label: '蓝' },
  { value: 'green', bg: '#BBF7D0', header: '#22C55E', label: '绿' },
];

function getColor(value: string) {
  return COLORS.find((c) => c.value === value) || COLORS[0];
}

interface StickyNoteCardProps {
  note: StickyNoteData;
  onUpdate: (note: StickyNoteData) => void;
  onDelete: (id: string) => void;
}

export default function StickyNoteCard({ note, onUpdate, onDelete }: StickyNoteCardProps) {
  const [pos, setPos] = useState({ x: note.x, y: note.y });
  const [size] = useState({ width: note.width, height: note.height });
  const [color, setColor] = useState(note.color);
  const [minimized, setMinimized] = useState(note.minimized);
  const [minimizedPos, setMinimizedPos] = useState({
    x: note.minimizedX,
    y: note.minimizedY,
  });
  const [showColors, setShowColors] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // 每个便签独立 tldraw store
  const store = useMemo(() => createTLStore({ defaultName: `sticky-${note.id}` }), [note.id]);

  // 监听 store 变化 → debounce 保存
  useEffect(() => {
    if (!editorRef.current) return;
    const unlisten = store.listen(() => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (!editorRef.current) return;
        const snapshot = editorRef.current.getSnapshot();
        const updated: StickyNoteData = {
          ...note,
          x: pos.x,
          y: pos.y,
          color,
          minimized,
          minimizedX: minimizedPos.x,
          minimizedY: minimizedPos.y,
          tldrawSnapshot: snapshot,
        };
        saveStickyNote(updated).catch((e) => console.warn('[StickyNote] save failed:', e));
      }, 500);
    });
    return () => unlisten();
  }, [store, note, pos, color, minimized, minimizedPos]);

  const handleMount = (editor: Editor) => {
    editorRef.current = editor;
    if (note.tldrawSnapshot) {
      try {
        editor.loadSnapshot(note.tldrawSnapshot as never);
      } catch (e) {
        console.warn('[StickyNote] load on mount failed:', e);
      }
    }
    // pen mode（仅触屏）
    try {
      if (navigator.maxTouchPoints > 0) {
        editor.updateInstanceState({ isPenMode: true });
      }
    } catch {
      // ignore
    }
  };

  // 拖拽移动（展开态）
  const handleDragStart = (e: React.PointerEvent) => {
    if (minimized) return;
    draggingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleDragMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - draggingRef.current.startX;
    const dy = e.clientY - draggingRef.current.startY;
    setPos({
      x: draggingRef.current.origX + dx,
      y: draggingRef.current.origY + dy,
    });
  };
  const handleDragEnd = () => {
    draggingRef.current = null;
    persistState();
  };

  const persistState = () => {
    const updated: StickyNoteData = {
      ...note,
      x: pos.x,
      y: pos.y,
      color,
      minimized,
      minimizedX: minimizedPos.x,
      minimizedY: minimizedPos.y,
    };
    onUpdate(updated);
    saveStickyNote(updated).catch((e) => console.warn('[StickyNote] persist failed:', e));
  };

  const handleMinimize = () => {
    setMinimized(true);
    // 缩小到当前展开位置（或保持原 minimizedPos）
    setMinimizedPos({ x: pos.x, y: pos.y });
    const updated: StickyNoteData = {
      ...note,
      x: pos.x,
      y: pos.y,
      minimized: true,
      minimizedX: pos.x,
      minimizedY: pos.y,
    };
    onUpdate(updated);
    saveStickyNote(updated).catch(() => undefined);
  };

  const handleExpand = () => {
    setMinimized(false);
    const updated: StickyNoteData = { ...note, minimized: false };
    onUpdate(updated);
    saveStickyNote(updated).catch(() => undefined);
  };

  const handleColorChange = (c: string) => {
    setColor(c);
    setShowColors(false);
    const updated: StickyNoteData = { ...note, x: pos.x, y: pos.y, color: c };
    onUpdate(updated);
    saveStickyNote(updated).catch(() => undefined);
  };

  const handleDelete = () => {
    deleteStickyNote(note.id).catch(() => undefined);
    onDelete(note.id);
  };

  const c = getColor(color);

  // 缩小态：小图标
  if (minimized) {
    return (
      <button
        onClick={handleExpand}
        title="点击展开便签"
        className="fixed z-30 w-10 h-10 rounded-lg shadow-md flex items-center justify-center transition-transform hover:scale-110"
        style={{
          left: minimizedPos.x,
          top: minimizedPos.y,
          backgroundColor: c.header,
        }}
      >
        <span className="text-white text-xs font-bold">便</span>
      </button>
    );
  }

  // 展开态：完整便签
  return (
    <div
      className="fixed z-30 rounded-xl shadow-lg flex flex-col overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        backgroundColor: c.bg,
      }}
    >
      {/* 顶部栏：拖拽手柄 + 颜色 + 缩小 + 删除 */}
      <div
        className="flex items-center justify-between px-2 py-1.5 cursor-move"
        style={{ backgroundColor: c.header }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <div className="flex items-center gap-1">
          <Move className="w-3 h-3 text-white/80" />
          <button
            onClick={() => setShowColors((v) => !v)}
            className="w-5 h-5 rounded-full border-2 border-white/60"
            style={{ backgroundColor: c.bg }}
            title="切换颜色"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleMinimize}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title="缩小"
          >
            <Minus className="w-3.5 h-3.5 text-white" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title="删除"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* 颜色选择行 */}
      {showColors && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-black/5">
          {COLORS.map((cc) => (
            <button
              key={cc.value}
              onClick={() => handleColorChange(cc.value)}
              className={cn(
                'w-5 h-5 rounded-full border-2 transition-transform',
                color === cc.value ? 'border-[#4A3F35] scale-110' : 'border-white/60',
              )}
              style={{ backgroundColor: cc.header }}
              title={cc.label}
            />
          ))}
        </div>
      )}

      {/* tldraw 手写区域 */}
      <div className="flex-1 relative">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-xs text-[#9B8E84]">
              加载手写工具...
            </div>
          }
        >
          <Tldraw
            store={store}
            onMount={handleMount}
            hideUi={false}
            className="!w-full !h-full"
          />
        </Suspense>
      </div>
    </div>
  );
}
