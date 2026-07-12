import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tldraw, Editor, createTLStore, createShapesForAssets } from 'tldraw';
import type { TLDrawShape } from '@tldraw/tlschema';
import { Type, Sigma, Loader2, X, Copy, Check } from 'lucide-react';
import 'tldraw/tldraw.css';
import {
  loadTldrawSnapshot,
  saveTldrawSnapshot,
  migrateOldStrokes,
} from '@/lib/tldrawStorage';
import { recognizeShape, type RecognizedShape } from '@/lib/shapeRecognition';
import { exportCurrentPageToPdf } from '@/lib/exportPdf';
import { invalidateOcrCache } from '@/lib/handwritingSearch';
import { recognizeHandwriting, recognizeMathFormula } from '@/lib/handwritingToText';
import { type AudioRecorder } from '@/lib/audioNotes';
import { cn } from '@/lib/utils';
import TldrawToolbar, { type PaperType } from './TldrawToolbar';

interface TldrawEditorProps {
  bookId: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  pageLayout: { top: number; height: number };
  /** Phase C 预留：tldraw 选区变化回调（B1 打桩，不实现） */
  onAISelect?: (rect: { x: number; y: number; w: number; h: number }) => void;
  /** AI 选区模式：'rect' 时切换到 select 工具，用户框选后触发 onAISelect */
  aiSelectionMode?: 'none' | 'text' | 'rect';
  /** editor 就绪后回调（让父组件持有 editor 引用，用于录音面板回放高亮） */
  onEditorReady?: (editor: Editor | null) => void;
  /** 共享 AudioRecorder 引用（Reader.tsx 创建，AudioNotePanel 设置，TldrawEditor 读取用于笔画时间戳） */
  recorderRef?: React.MutableRefObject<AudioRecorder | null>;
  /** 只读模式：阅读模式下显示笔记叠加层但不可编辑，pointer-events 透传 */
  readOnly?: boolean;
  /** 工具栏渲染目标容器元素（Portal 到 header 区域，避免遮挡书写区域） */
  toolbarPortalEl?: HTMLElement | null;
}

// 旧 hex 颜色 → tldraw draw shape 命名色
function mapHexToTldrawColor(hex: string): 'black' | 'blue' | 'green' | 'grey' | 'light-blue' | 'light-green' | 'light-red' | 'light-violet' | 'orange' | 'red' | 'violet' | 'yellow' {
  const h = hex.toLowerCase();
  if (h.includes('1a1a1a') || h.includes('4a3f35') || h.includes('000') || h.includes('333')) return 'black';
  if (h.includes('e85d75')) return 'light-red';
  if (h.includes('c0392b') || h.includes('e74c3c')) return 'red';
  if (h.includes('e67e22') || h.includes('d4a574') || h.includes('f39c12')) return 'orange';
  if (h.includes('f1c40f') || h.includes('ffeb99')) return 'yellow';
  if (h.includes('27ae60') || h.includes('2ecc71')) return 'light-green';
  if (h.includes('2980b9') || h.includes('3498db')) return 'light-blue';
  if (h.includes('8e44ad') || h.includes('9b59b6')) return 'light-violet';
  return 'black';
}

// 旧粗细数值 → tldraw size 档
function mapSizeToTldrawSize(size: number): 's' | 'm' | 'l' | 'xl' {
  if (size <= 2.5) return 's';
  if (size <= 4) return 'm';
  if (size <= 6) return 'l';
  return 'xl';
}

/** 把识别到的形状替换原 draw shape（删除旧 + 创建新 geo/draw shape） */
function replaceWithShape(
  ed: Editor,
  oldShapeId: TLDrawShape['id'],
  recognized: NonNullable<RecognizedShape>,
  color: TLDrawShape['props']['color'],
  size: TLDrawShape['props']['size'],
) {
  if (recognized.type === 'line') {
    // 直线：用 draw shape 2 点（保留 freehand 渲染但直线化）
    const minX = Math.min(recognized.x1, recognized.x2);
    const minY = Math.min(recognized.y1, recognized.y2);
    ed.createShape({
      type: 'draw',
      x: minX,
      y: minY,
      props: {
        segments: [{ type: 'free', points: [[0, 0], [recognized.x2 - minX, recognized.y2 - minY]] }],
        color,
        size,
        dash: 'draw',
        isComplete: true,
        isClosed: false,
      },
    } as never);
  } else {
    // 圆/矩形：用 geo shape（geo: 'ellipse' | 'rectangle'）
    const isCircle = recognized.type === 'circle';
    ed.createShape({
      type: 'geo',
      x: isCircle ? recognized.cx - recognized.r : recognized.x,
      y: isCircle ? recognized.cy - recognized.r : recognized.y,
      props: {
        geo: isCircle ? 'ellipse' : 'rectangle',
        w: isCircle ? recognized.r * 2 : recognized.w,
        h: isCircle ? recognized.r * 2 : recognized.h,
        color,
        size,
        dash: 'draw',
        fill: 'none',
        url: '',
      },
    } as never);
  }
  ed.deleteShapes([oldShapeId]);
}

export default function TldrawEditor({
  bookId,
  pageNumber,
  pageWidth,
  pageHeight,
  onAISelect,
  aiSelectionMode,
  onEditorReady,
  recorderRef: externalRecorderRef,
  readOnly = false,
  toolbarPortalEl,
}: TldrawEditorProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [paper, setPaper] = useState<PaperType>('transparent');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [shapeRecognitionEnabled, setShapeRecognitionEnabled] = useState(false);
  const shapeRecognitionRef = useRef(false);
  shapeRecognitionRef.current = shapeRecognitionEnabled;

  // E3.2 激光指针
  const [laserOn, setLaserOn] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ==== C1 手写转文字/公式识别：选区浮动菜单 ====
  // 选中的 shape id 列表 + 选区在屏幕上的位置
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  // 结果弹窗
  const [resultModal, setResultModal] = useState<{
    title: string;
    content: string;
    type: 'text' | 'latex';
    shapeIds: string[];
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<'text' | 'latex' | null>(null);
  const [copied, setCopied] = useState(false);

  // ==== C2 录音同步笔记 ====
  // 优先使用外部传入的 recorderRef（由 Reader.tsx 创建，AudioNotePanel 设置）
  const internalRecorderRef = useRef<AudioRecorder | null>(null);
  const audioRecorderRef = externalRecorderRef || internalRecorderRef;
  // 监听 stroke 创建/完成（在录音时记录时间戳）
  const recordingShapeStartRef = useRef<Map<string, number>>(new Map());

  // 通知父组件 editor 就绪
  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor]);

  // ==== readOnly 变化时同步 editor 状态（避免切换模式后 editor 仍处于只读） ====
  useEffect(() => {
    if (!editor) return;
    try {
      editor.updateInstanceState({ isReadonly: readOnly });
      if (!readOnly) {
        editor.setCameraOptions({
          constraints: {
            bounds: { x: 0, y: 0, w: pageWidth, h: pageHeight },
            padding: { x: 0, y: 0 },
            origin: { x: 0, y: 0 },
            initialZoom: 'default',
            baseZoom: 'default',
            behavior: 'fixed',
          },
          zoomSteps: [1],
          isLocked: true,
          wheelBehavior: 'none',
        });
        editor.setCamera({ x: 0, y: 0, z: 1 });
        editor.setCurrentTool('draw');
        if (navigator.maxTouchPoints > 0) {
          editor.updateInstanceState({ isPenMode: true });
        }
      }
    } catch (e) {
      console.warn('[TldrawEditor] updateReadOnly failed:', e);
    }
  }, [editor, readOnly, pageWidth, pageHeight]);

  // ==== AI 框选模式：切换到 select 工具，监听选区变化触发 onAISelect ====
  useEffect(() => {
    if (!editor || aiSelectionMode !== 'rect') return;
    // 切换到选择工具
    editor.setCurrentTool('select');
    // 清空已有选区
    editor.setSelectedShapes([]);
    let fired = false;
    const tick = () => {
      if (fired || !editor) return;
      const ids = editor.getSelectedShapeIds();
      if (ids.length === 0) {
        // 用户可能用框选拖拽（未产生 shape，但有选区 bounds）
        const bounds = editor.getSelectionRotatedPageBounds();
        if (bounds && bounds.width > 5 && bounds.height > 5) {
          fired = true;
          onAISelect?.({
            x: bounds.minX,
            y: bounds.minY,
            w: bounds.width,
            h: bounds.height,
          });
          editor.setSelectedShapes([]);
        }
      } else {
        // 选中了 shape
        const bounds = editor.getSelectionRotatedPageBounds();
        if (bounds && bounds.width > 0 && bounds.height > 0) {
          fired = true;
          onAISelect?.({
            x: bounds.minX,
            y: bounds.minY,
            w: bounds.width,
            h: bounds.height,
          });
          editor.setSelectedShapes([]);
        }
      }
    };
    const interval = setInterval(tick, 150);
    return () => clearInterval(interval);
  }, [editor, aiSelectionMode, onAISelect]);

  // 监听选区变化，更新浮动菜单位置
  // tldraw Editor 没暴露 selectionchange 监听 API，用 100ms 轮询 selectedShapeIds
  // （稳定可靠；selection 是 editor 内存状态，不在 store 中，无法用 store.listen 监听）
  // E3.2 激光指针：监听鼠标移动，更新红点位置
  useEffect(() => {
    if (!laserOn) {
      setLaserPos(null);
      return;
    }
    const handler = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setLaserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    window.addEventListener('pointermove', handler);
    return () => window.removeEventListener('pointermove', handler);
  }, [laserOn]);

  useEffect(() => {
    if (!editor) return;
    let lastIdsKey = '';
    const tick = () => {
      const ids = editor.getSelectedShapeIds();
      const key = ids.join(',');
      if (key !== lastIdsKey) {
        lastIdsKey = key;
        setSelectedIds(ids);
        if (ids.length === 0) {
          setMenuPos(null);
          return;
        }
        try {
          const bounds = editor.getSelectionRotatedPageBounds();
          if (!bounds) {
            setMenuPos(null);
            return;
          }
          const screen = editor.pageToScreen({ x: bounds.midX, y: bounds.minY });
          setMenuPos({ x: screen.x, y: screen.y - 50 });
        } catch {
          setMenuPos(null);
        }
      }
    };
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [editor]);

  // 转文字
  const handleRecognizeText = async () => {
    if (!editor || selectedIds.length === 0) return;
    setActionLoading('text');
    const ids = [...selectedIds];
    try {
      const text = await recognizeHandwriting(editor, ids);
      setResultModal({
        title: '识别结果（OCR）',
        content: text || '（未识别到文字）',
        type: 'text',
        shapeIds: ids,
      });
    } catch (e) {
      setResultModal({
        title: '识别失败',
        content: (e as Error).message,
        type: 'text',
        shapeIds: [],
      });
    } finally {
      setActionLoading(null);
    }
  };

  // 识别公式
  const handleRecognizeFormula = async () => {
    if (!editor || selectedIds.length === 0) return;
    setActionLoading('latex');
    const ids = [...selectedIds];
    try {
      const latex = await recognizeMathFormula(editor, ids);
      setResultModal({
        title: 'LaTeX 识别结果（AI）',
        content: latex,
        type: 'latex',
        shapeIds: [],
      });
    } catch (e) {
      setResultModal({
        title: '识别失败',
        content: (e as Error).message,
        type: 'latex',
        shapeIds: [],
      });
    } finally {
      setActionLoading(null);
    }
  };

  // 替换为 text shape（仅转文字场景）
  const handleReplaceWithText = () => {
    if (!editor || !resultModal) return;
    const ids = resultModal.shapeIds;
    if (ids.length === 0) return;
    // 计算原 shapes 的边界中心，作为 text shape 的位置
    try {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of ids) {
        const shape = editor.getShape(id as never);
        if (!shape) continue;
        const geo = editor.getShapeGeometry(shape.id);
        const bounds = geo.bounds;
        minX = Math.min(minX, shape.x + bounds.minX);
        minY = Math.min(minY, shape.y + bounds.minY);
        maxX = Math.max(maxX, shape.x + bounds.maxX);
        maxY = Math.max(maxY, shape.y + bounds.maxY);
      }
      if (minX === Infinity) return;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      editor.deleteShapes(ids as never);
      editor.createShape({
        type: 'text',
        x: cx - 60,
        y: cy - 12,
        props: {
          text: resultModal.content,
          size: 'm',
          color: 'black',
          font: 'draw',
          align: 'middle',
          w: 120,
          autoSize: true,
          scale: 1,
        },
      } as never);
      setResultModal(null);
    } catch (e) {
      console.warn('[TldrawEditor] replace with text failed:', e);
    }
  };

  const handleCopyResult = async () => {
    if (!resultModal) return;
    try {
      await navigator.clipboard.writeText(resultModal.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn('clipboard failed:', e);
    }
  };

  // 插入图片：选文件 → getAssetForExternalContent → createShapesForAssets 放到视口中心
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    try {
      const asset = await editor.getAssetForExternalContent({ type: 'file', file });
      if (asset) {
        const center = editor.getViewportPageBounds().center;
        await createShapesForAssets(editor, [asset], center);
      }
    } catch (err) {
      console.warn('[TldrawEditor] insert image failed:', err);
    }
    e.target.value = ''; // 允许重复选同一文件
  };

  // 导出当前页为 PDF
  const handleExportPdf = async () => {
    if (!editor) return;
    try {
      await exportCurrentPageToPdf(editor, `${bookId}-page${pageNumber}.pdf`);
    } catch (e) {
      console.warn('[TldrawEditor] export pdf failed:', e);
      alert('导出 PDF 失败：' + (e as Error).message);
    }
  };

  // 每本书每页独立 store（key 重建时 useMemo 自动创建新 store）
  const store = useMemo(
    () => createTLStore({ defaultName: `lexnote-${bookId}-${pageNumber}` }),
    [bookId, pageNumber],
  );

  // [诊断] 渲染时打印关键 props，帮助定位 PDF 模式下笔不显示的问题
  console.log('[TldrawEditor] render', {
    bookId,
    pageNumber,
    pageWidth,
    pageHeight,
    readOnly,
    editorReady: !!editor,
  });

  const handleMount = (ed: Editor) => {
    console.log('[TldrawEditor] handleMount called, readOnly=', readOnly);
    setEditor(ed);

    // 1. 锁定 camera 到当前页范围（禁止平移/缩放，笔迹固定在页面上）
    try {
      ed.setCameraOptions({
        constraints: {
          bounds: { x: 0, y: 0, w: pageWidth, h: pageHeight },
          padding: { x: 0, y: 0 },
          origin: { x: 0, y: 0 },
          initialZoom: 'default',
          baseZoom: 'default',
          behavior: 'fixed',
        },
        zoomSteps: [1],
        isLocked: true,
        wheelBehavior: 'none',
      });
      ed.setCamera({ x: 0, y: 0, z: 1 });
    } catch (e) {
      console.warn('[TldrawEditor] camera lock failed:', e);
    }

    // D2.3 pen mode：仅触屏设备启用（Apple Pencil=书写，手指=滚动）
    // 桌面鼠标不启用，避免影响正常书写
    try {
      if (navigator.maxTouchPoints > 0 && !readOnly) {
        ed.updateInstanceState({ isPenMode: true });
      }
    } catch (e) {
      console.warn('[TldrawEditor] setPenMode failed:', e);
    }

    // 只读模式：禁用编辑
    if (readOnly) {
      try {
        ed.updateInstanceState({ isReadonly: true });
      } catch (e) {
        console.warn('[TldrawEditor] setReadOnly failed:', e);
      }
    }

    // 2. 加载数据：先 loadSnapshot，若空则迁移旧 localStorage 笔记
    (async () => {
      try {
        const snapshot = await loadTldrawSnapshot(bookId, pageNumber);
        if (snapshot) {
          ed.loadSnapshot(snapshot);
          return;
        }
        const migrated = await migrateOldStrokes(bookId, pageNumber);
        if (migrated && migrated.length > 0) {
          const shapes = migrated.map((s, i) => ({
            id: `shape:migrated-${Date.now()}-${i}`,
            type: 'draw' as const,
            x: s.originX,
            y: s.originY,
            props: {
              segments: [{ points: s.points, type: 'free' as const }],
              color: mapHexToTldrawColor(s.color),
              size: mapSizeToTldrawSize(s.size),
              dash: 'draw' as const,
              isComplete: true,
              isClosed: false,
              rotation: 0,
            },
          }));
          ed.createShapes(shapes as never);
        }
      } catch (e) {
        console.warn('[TldrawEditor] load/migrate data failed:', e);
      }
    })();

    // 3. 监听 store 变化 → debounce 500ms → 持久化到 IndexedDB + 失效 OCR 缓存
    const unlisten = store.listen(() => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await saveTldrawSnapshot(bookId, pageNumber, ed.getSnapshot());
          // 笔记更新 → 该页 OCR 缓存失效，下次手写搜索重新识别
          await invalidateOcrCache(bookId, pageNumber);
        } catch (e) {
          console.warn('[TldrawEditor] save snapshot failed:', e);
        }
      }, 500);
    });

    // 4. 形状识别：draw shape 完成时自动转换为规则形状（圆/矩形/直线）
    const unlistenShapeFx = ed.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
      // ==== C2 录音时间戳：draw shape 创建/完成时通知 AudioRecorder ====
      if (next.type === 'draw' && audioRecorderRef.current?.isRecording) {
        const drawNext = next as TLDrawShape;
        const drawPrev = prev as TLDrawShape | undefined;
        // shape 首次出现（prev 为空）→ stroke 开始
        if (!drawPrev) {
          audioRecorderRef.current.recordStrokeStart(drawNext.id);
        }
        // shape 完成（prev.isComplete=false → next.isComplete=true）→ stroke 结束
        if (drawPrev && !drawPrev.props.isComplete && drawNext.props.isComplete) {
          audioRecorderRef.current.recordStrokeEnd(drawNext.id);
        }
      }

      // ==== 形状识别：draw shape 完成时自动转换为规则形状（圆/矩形/直线） ====
      if (!shapeRecognitionRef.current) return;
      if (next.type !== 'draw') return;
      const drawShape = next as TLDrawShape;
      if (!drawShape.props.isComplete) return;
      // 仅在刚完成时识别（prev 不存在或 prev.isComplete 为 false）
      const prevDraw = prev as TLDrawShape | undefined;
      if (prevDraw && prevDraw.props.isComplete) return;
      // 用 geometry 顶点做形状识别（segments.path 是 base64 编码，不便直接解码）
      const geometry = ed.getShapeGeometry(drawShape.id);
      const vertices = geometry.getVertices({});
      if (vertices.length < 5) return;
      const absPoints: number[][] = vertices.map((v) => [v.x + drawShape.x, v.y + drawShape.y]);
      const recognized = recognizeShape(absPoints);
      if (recognized) {
        replaceWithShape(ed, drawShape.id, recognized, drawShape.props.color, drawShape.props.size);
      }
    });

    // cleanup（组件卸载或 key 重建时触发）
    return () => {
      unlisten();
      unlistenShapeFx();
      // 录音清理（避免组件卸载时仍在录音导致状态泄漏）
      if (audioRecorderRef.current?.isRecording) {
        audioRecorderRef.current.cancel();
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // 卸载前立即保存最新状态
        try {
          saveTldrawSnapshot(bookId, pageNumber, ed.getSnapshot());
        } catch {
          /* ignore */
        }
      }
    };
  };

  return (
    <div
      ref={containerRef}
      className={cn('lexnote-tldraw absolute inset-0', readOnly ? 'readonly-mode' : '')}
      style={{ pointerEvents: readOnly ? 'none' : 'auto' }}
    >
      {/* E3.2 激光指针红点（跟随鼠标，pointer-events: none 不拦截事件） */}
      {laserOn && laserPos && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: laserPos.x,
            top: laserPos.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="rounded-full"
            style={{
              width: 24,
              height: 24,
              background: 'radial-gradient(circle, rgba(232,93,117,0.95) 0%, rgba(232,93,117,0.5) 50%, transparent 80%)',
              boxShadow: '0 0 20px rgba(232,93,117,0.6)',
            }}
          />
        </div>
      )}
      {/* 纸张背景叠加层（透明/方格/横线/点阵/五线谱/康奈尔），位于 tldraw 画布下方、PDF 之上 */}
      {paper !== 'transparent' && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={getPaperStyle(paper)}
        />
      )}
      <Tldraw
        store={store}
        onMount={handleMount}
      />
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
      {editor && !readOnly && (
        toolbarPortalEl !== undefined ? (
          toolbarPortalEl ? createPortal(
            <TldrawToolbar
              editor={editor}
              onPaperChange={setPaper}
              onInsertImage={() => fileInputRef.current?.click()}
              shapeRecognitionEnabled={shapeRecognitionEnabled}
              onToggleShapeRecognition={() => setShapeRecognitionEnabled((v) => !v)}
              onExportPdf={handleExportPdf}
              laserOn={laserOn}
              onToggleLaser={() => setLaserOn((v) => !v)}
              variant="inline"
            />,
            toolbarPortalEl
          ) : null
        ) : (
          <TldrawToolbar
            editor={editor}
            onPaperChange={setPaper}
            onInsertImage={() => fileInputRef.current?.click()}
            shapeRecognitionEnabled={shapeRecognitionEnabled}
            onToggleShapeRecognition={() => setShapeRecognitionEnabled((v) => !v)}
            onExportPdf={handleExportPdf}
            laserOn={laserOn}
            onToggleLaser={() => setLaserOn((v) => !v)}
          />
        )
      )}
      {/* 隐藏 tldraw 默认 UI（菜单/工具栏/页面菜单/辅助按钮/水印），保留画布、选区手柄与文字编辑 */}
      <style>{`
        /* 阅读模式（只读）：完全穿透事件，不干扰下方PDF/EPUB的文本选择 */
        .lexnote-tldraw.readonly-mode,
        .lexnote-tldraw.readonly-mode * {
          pointer-events: none !important;
          user-select: none !important;
          -webkit-user-select: none !important;
          touch-action: auto !important;
        }
        .lexnote-tldraw.readonly-mode canvas {
          touch-action: auto !important;
        }
        /* Skip link ("将焦点移至画布") */
        .lexnote-tldraw .tl-skip-to-main-content {
          display: none !important;
        }
        /* 顶部菜单区域（主菜单、页面菜单） */
        .lexnote-tldraw .tlui-menu-zone {
          display: none !important;
        }
        /* 辅助按钮（帮助按钮等） */
        .lexnote-tldraw .tlui-helper-buttons {
          display: none !important;
        }
        /* 底部主工具栏（所有默认工具按钮：选择/画笔/橡皮/文本/形状等） */
        .lexnote-tldraw .tlui-main-toolbar {
          display: none !important;
        }
        /* 页面菜单按钮 */
        .lexnote-tldraw .tlui-page-menu__trigger {
          display: none !important;
        }
        /* 水印 */
        .lexnote-tldraw .tl-watermark_SEE-LICENSE {
          display: none !important;
        }
        /* 背景透明 */
        .lexnote-tldraw .tl-container {
          background: transparent !important;
        }
        .lexnote-tldraw .tl-background {
          background: transparent !important;
        }
      `}</style>

      {/* C1: 选区浮动菜单（套索选中后显示在选区上方） */}
      {menuPos && selectedIds.length > 0 && !resultModal && (
        <div
          className="fixed z-[60] flex items-center gap-1 bg-white rounded-xl border border-[#E8E4DE] shadow-lg p-1"
          style={{
            left: menuPos.x,
            top: Math.max(8, menuPos.y),
            transform: 'translateX(-50%)',
          }}
        >
          <button
            onClick={handleRecognizeText}
            disabled={actionLoading !== null}
            title="把手写笔画识别为文字"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#4A3F35] hover:bg-[#FAF8F5] disabled:opacity-50"
          >
            {actionLoading === 'text' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Type className="w-3.5 h-3.5" />
            )}
            转文字
          </button>
          <div className="w-px h-4 bg-[#E8E4DE]" />
          <button
            onClick={handleRecognizeFormula}
            disabled={actionLoading !== null}
            title="把手写数学公式识别为 LaTeX"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#4A3F35] hover:bg-[#FAF8F5] disabled:opacity-50"
          >
            {actionLoading === 'latex' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sigma className="w-3.5 h-3.5" />
            )}
            识别公式
          </button>
        </div>
      )}

      {/* C1: 结果弹窗 */}
      {resultModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30"
          onClick={() => setResultModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DE]">
              <h3 className="font-semibold text-[#4A3F35] text-sm">{resultModal.title}</h3>
              <button
                onClick={() => setResultModal(null)}
                className="p-1 rounded-lg hover:bg-[#FAF8F5]"
              >
                <X className="w-4 h-4 text-[#6B5E54]" />
              </button>
            </div>

            {/* 内容 */}
            <div className="flex-1 overflow-y-auto p-4">
              {resultModal.type === 'latex' ? (
                <pre className="text-sm text-[#4A3F35] font-mono whitespace-pre-wrap break-all bg-[#FAF8F5] p-3 rounded-lg">
                  {resultModal.content}
                </pre>
              ) : (
                <textarea
                  className="w-full text-sm text-[#4A3F35] bg-[#FAF8F5] p-3 rounded-lg resize-none border border-transparent focus:border-[#D4A574] focus:outline-none"
                  rows={6}
                  value={resultModal.content}
                  onChange={(e) =>
                    setResultModal({ ...resultModal, content: e.target.value })
                  }
                />
              )}
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#E8E4DE]">
              <button
                onClick={handleCopyResult}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[#4A3F35] hover:bg-[#FAF8F5]"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-[#27AE60]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? '已复制' : '复制'}
              </button>
              {resultModal.type === 'text' && resultModal.shapeIds.length > 0 && (
                <button
                  onClick={handleReplaceWithText}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[#D4A574] text-white hover:bg-[#C4956A]"
                >
                  <Type className="w-4 h-4" />
                  替换为文本
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// E3.3 纸张背景样式：根据 paper 类型返回 CSS 背景
function getPaperStyle(paper: PaperType): React.CSSProperties {
  const color = '#D4C5B0';
  const opacity = 0.4;
  switch (paper) {
    case 'grid':
      return {
        backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        opacity,
      };
    case 'lines':
      return {
        backgroundImage: `linear-gradient(${color} 1px, transparent 1px)`,
        backgroundSize: '100% 32px',
        opacity,
      };
    case 'dot':
      return {
        backgroundImage: `radial-gradient(circle, ${color} 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
        opacity,
      };
    case 'staff':
      // 五线谱：5 条等距横线一组，循环
      return {
        backgroundImage: `repeating-linear-gradient(${color}, ${color} 1px, transparent 1px, transparent 8px, ${color} 8px, ${color} 9px, transparent 9px, transparent 16px, ${color} 16px, ${color} 17px, transparent 17px, transparent 24px, ${color} 24px, ${color} 25px, transparent 25px, transparent 40px)`,
        opacity,
      };
    case 'cornell':
      // 康奈尔：左侧线索栏（竖线）+ 底部总结栏（横线）
      return {
        backgroundImage: `linear-gradient(90deg, transparent 30%, ${color} 30%, ${color} 30.5%, transparent 30.5%), linear-gradient(${color}, ${color} 1px, transparent 1px)`,
        backgroundSize: '100% 100%, 100% 32px',
        backgroundPosition: '0 0, 0 0',
        backgroundRepeat: 'no-repeat, repeat',
        opacity,
      };
    default:
      return {};
  }
}
