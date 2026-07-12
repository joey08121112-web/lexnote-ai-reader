import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  PenTool,
  Pencil,
  Highlighter,
  Eraser,
  MousePointer2,
  Type,
  StickyNote,
  Square,
  Circle,
  Minus,
  Undo2,
  Redo2,
  Trash2,
  Grid3X3,
  Image as ImageIcon,
  Wand2,
  Download,
  ChevronDown,
  Plus,
  Sticker,
  Zap,
  MoreHorizontal,
} from 'lucide-react';
import type { Editor } from 'tldraw';
import { DefaultColorStyle, DefaultSizeStyle, DefaultDashStyle } from '@tldraw/tlschema';
import { cn } from '@/lib/utils';
import {
  BUILTIN_PRESETS,
  loadCustomPresets,
  saveCustomPreset,
  deleteCustomPreset,
  getActivePresetId,
  setActivePresetId,
  genPresetId,
  type PenPreset,
} from '@/lib/penPresets';
import StickerLibrary from '@/components/StickerLibrary';

// tldraw 命名色 → 显示用 hex（预设色块）
const PRESET_COLORS: { value: string; hex: string; label: string }[] = [
  { value: 'black', hex: '#1A1A1A', label: '黑' },
  { value: 'grey', hex: '#888888', label: '灰' },
  { value: 'light-red', hex: '#FF6B6B', label: '浅红' },
  { value: 'red', hex: '#C0392B', label: '红' },
  { value: 'orange', hex: '#E67E22', label: '橙' },
  { value: 'yellow', hex: '#F1C40F', label: '黄' },
  { value: 'light-green', hex: '#2ECC71', label: '浅绿' },
  { value: 'green', hex: '#27AE60', label: '绿' },
  { value: 'light-blue', hex: '#5DADE2', label: '浅蓝' },
  { value: 'blue', hex: '#2980B9', label: '蓝' },
  { value: 'light-violet', hex: '#AF7AC5', label: '浅紫' },
  { value: 'violet', hex: '#8E44AD', label: '紫' },
];

const SIZES: { value: 's' | 'm' | 'l' | 'xl'; label: string; dot: number }[] = [
  { value: 's', label: '细', dot: 4 },
  { value: 'm', label: '中', dot: 7 },
  { value: 'l', label: '粗', dot: 10 },
  { value: 'xl', label: '特粗', dot: 14 },
];

// D4.5 便利贴配色快捷行（tldraw note shape 支持的命名色子集）
const NOTE_COLORS: { value: string; hex: string; label: string }[] = [
  { value: 'yellow', hex: '#F1C40F', label: '黄' },
  { value: 'orange', hex: '#E67E22', label: '橙' },
  { value: 'red', hex: '#C0392B', label: '红' },
  { value: 'light-green', hex: '#2ECC71', label: '浅绿' },
  { value: 'light-blue', hex: '#5DADE2', label: '浅蓝' },
  { value: 'light-violet', hex: '#AF7AC5', label: '浅紫' },
];

type PaperType = 'transparent' | 'grid' | 'lines' | 'dot' | 'staff' | 'cornell';

interface TldrawToolbarProps {
  editor: Editor;
  /** 纸张类型变化回调（由 TldrawEditor 提供以控制背景叠加层） */
  onPaperChange?: (paper: PaperType) => void;
  /** 插入图片（触发隐藏 file input） */
  onInsertImage?: () => void;
  /** 形状识别开关（开启后 freehand 笔画自动转规则形状） */
  shapeRecognitionEnabled?: boolean;
  onToggleShapeRecognition?: () => void;
  /** 导出当前页为 PDF */
  onExportPdf?: () => void;
  /** E3.2 激光指针开关 */
  laserOn?: boolean;
  onToggleLaser?: () => void;
  /** 布局变体：'floating'=画布内浮动（默认），'inline'=header 紧凑水平栏 */
  variant?: 'floating' | 'inline';
}

/** 工具按钮（分组容器） */
function ToolGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center bg-white rounded-xl border border-[#E8E4DE] p-1 shadow-sm">
      {children}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center transition-all',
        active
          ? 'text-white shadow-sm'
          : 'text-[#6B5E54] hover:bg-[#E8E4DE]',
      )}
      style={active ? { backgroundColor: activeColor ?? '#4A3F35' } : undefined}
    >
      {children}
    </button>
  );
}

/** D2.2 笔触预设行（下拉面板内每条） */
function PresetRow({
  preset,
  active,
  onSelect,
  onDelete,
}: {
  preset: PenPreset;
  active: boolean;
  onSelect: (p: PenPreset) => void;
  onDelete?: () => void;
}) {
  return (
    <div
      onClick={() => onSelect(preset)}
      title={preset.pressureNote}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm',
        active ? 'bg-[#D4A574]/10 text-[#D4A574] font-medium' : 'text-[#4A3F35] hover:bg-[#FAF8F5]',
      )}
    >
      {preset.id === 'highlighter' ? (
        <Highlighter className="w-4 h-4 flex-shrink-0" />
      ) : preset.id === 'brush' ? (
        <PenTool className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} />
      ) : preset.id === 'ball' ? (
        <Pencil className="w-4 h-4 flex-shrink-0" />
      ) : (
        <PenTool className="w-4 h-4 flex-shrink-0" />
      )}
      <span className="flex-1 truncate">{preset.name}</span>
      {!preset.builtin && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#E8E4DE] text-[#9B8E84] hover:text-[#E85D75]"
          title="删除此预设"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default function TldrawToolbar({ editor, onPaperChange, onInsertImage, shapeRecognitionEnabled, onToggleShapeRecognition, onExportPdf, laserOn, onToggleLaser, variant = 'floating' }: TldrawToolbarProps) {
  const [tool, setTool] = useState<string>('draw');
  const [color, setColor] = useState<string>('black');
  const [size, setSize] = useState<'s' | 'm' | 'l' | 'xl'>('m');
  const [paper, setPaper] = useState<PaperType>('transparent');

  // D2.2 笔触预设系统状态
  const [activePresetId, setActivePresetIdState] = useState<string | null>(getActivePresetId());
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const [customPresets, setCustomPresets] = useState<PenPreset[]>(loadCustomPresets());
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const presetDropdownRef = useRef<HTMLDivElement | null>(null);
  // D4.4 贴纸库开关
  const [showStickerLibrary, setShowStickerLibrary] = useState(false);
  // E3.1 当前选中的 shape 数（>0 时显示选中操作菜单）
  const [selectedCount, setSelectedCount] = useState(0);
  // inline 模式：更多工具下拉
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const moreDropdownRef = useRef<HTMLDivElement | null>(null);

  const selectTool = (id: string) => {
    editor.setCurrentTool(id);
    setTool(id);
  };

  const selectColor = (value: string) => {
    try {
      editor.setStyleForNextShapes(DefaultColorStyle, value as never);
    } catch (e) {
      console.warn('[TldrawToolbar] setStyleForNextShapes color failed:', e);
    }
    setColor(value);
  };

  const selectSize = (s: 's' | 'm' | 'l' | 'xl') => {
    try {
      editor.setStyleForNextShapes(DefaultSizeStyle, s);
    } catch (e) {
      console.warn('[TldrawToolbar] setStyleForNextShapes size failed:', e);
    }
    setSize(s);
  };

  // D2.2 应用笔触预设：一次性设置 tool/color/size/dash
  const applyPreset = (preset: PenPreset) => {
    selectTool(preset.tool);
    selectColor(preset.color);
    selectSize(preset.size);
    try {
      editor.setStyleForNextShapes(DefaultDashStyle, preset.dash);
    } catch (e) {
      console.warn('[TldrawToolbar] setStyleForNextShapes dash failed:', e);
    }
    setActivePresetIdState(preset.id);
    setActivePresetId(preset.id);
    setPresetDropdownOpen(false);
  };

  // D2.2 保存当前 tool/color/size 为自定义预设（dash 按 tool 推断）
  const handleSavePreset = () => {
    const name = presetNameInput.trim();
    if (!name) return;
    const newPreset: PenPreset = {
      id: genPresetId(),
      name,
      tool: (tool === 'highlight' ? 'highlight' : 'draw') as 'draw' | 'highlight',
      size,
      dash: tool === 'highlight' ? 'solid' : 'draw',
      color,
      pressureNote: '自定义预设',
      builtin: false,
    };
    saveCustomPreset(newPreset);
    setCustomPresets(loadCustomPresets());
    setActivePresetIdState(newPreset.id);
    setActivePresetId(newPreset.id);
    setSavingPreset(false);
    setPresetNameInput('');
    setPresetDropdownOpen(false);
  };

  // D2.2 删除自定义预设
  const handleDeletePreset = (id: string) => {
    deleteCustomPreset(id);
    setCustomPresets(loadCustomPresets());
    if (activePresetId === id) {
      setActivePresetIdState(null);
      setActivePresetId('');
    }
  };

  // D2.2 点击外部关闭下拉
  useEffect(() => {
    if (!presetDropdownOpen && !moreDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (presetDropdownOpen && presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setPresetDropdownOpen(false);
        setSavingPreset(false);
        setPresetNameInput('');
      }
      if (moreDropdownOpen && moreDropdownRef.current && !moreDropdownRef.current.contains(e.target as Node)) {
        setMoreDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [presetDropdownOpen, moreDropdownOpen]);

  // E3.1 监听选区变化，更新 selectedCount
  useEffect(() => {
    const update = () => setSelectedCount(editor.getSelectedShapes().length);
    update();
    const cleanup = editor.sideEffects.registerAfterChangeHandler('shape', update);
    const off1 = editor.store.listen(update, { source: 'user', scope: 'session' });
    return () => {
      cleanup();
      off1();
    };
  }, [editor]);

  // E3.1 修改选中 shape 的样式（color/size/dash）
  const updateSelectedStyle = (type: 'color' | 'size' | 'dash', value: string) => {
    const selected = editor.getSelectedShapes();
    if (selected.length === 0) return;
    editor.updateShapes(
      selected.map((s) => ({
        id: s.id,
        type: s.type,
        props: { [type]: value },
      })),
    );
    // 同步本地状态（color/size）
    if (type === 'color') setColor(value);
    if (type === 'size') setSize(value as 's' | 'm' | 'l' | 'xl');
  };

  const deleteSelected = () => {
    const selected = editor.getSelectedShapes();
    if (selected.length > 0) {
      editor.deleteShapes(selected.map((s) => s.id));
    }
  };

  const changePaper = (p: PaperType) => {
    setPaper(p);
    onPaperChange?.(p);
  };

  const isActive = (id: string) => tool === id;

  // D2.2 当前激活的预设对象（用于按钮显示）
  const activePreset = [...BUILTIN_PRESETS, ...customPresets].find((p) => p.id === activePresetId) || null;

  // ==== inline 模式：header 紧凑水平栏 ====
  if (variant === 'inline') {
    return (
      <div className="relative flex items-center gap-1.5 w-full flex-nowrap">
        {/* 笔触预设 + 橡皮擦 */}
        <div className="relative flex items-center bg-white/80 rounded-full border border-white/40 p-0.5 shadow-sm flex-shrink-0" ref={presetDropdownRef}>
          <button
            onClick={() => setPresetDropdownOpen((v) => !v)}
            title={activePreset ? activePreset.pressureNote : '笔触'}
            className={cn(
              'h-8 px-2.5 rounded-full flex items-center gap-1 transition-all text-sm',
              presetDropdownOpen || activePresetId
                ? 'text-white bg-[#4A3F35] shadow-sm'
                : 'text-[#4A3F35] hover:bg-black/5',
            )}
          >
            {activePreset?.id === 'highlighter' ? (
              <Highlighter className="w-3.5 h-3.5" />
            ) : activePreset?.id === 'brush' ? (
              <PenTool className="w-3.5 h-3.5" strokeWidth={2.5} />
            ) : activePreset?.id === 'ball' ? (
              <Pencil className="w-3.5 h-3.5" />
            ) : (
              <PenTool className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => selectTool('eraser')}
            title="橡皮擦"
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center transition-all ml-0.5',
              isActive('eraser') ? 'text-white bg-[#4A3F35] shadow-sm' : 'text-[#4A3F35] hover:bg-black/5',
            )}
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
          {presetDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl border border-[#E8E4DE] shadow-lg z-50 p-2 max-h-[60vh] overflow-y-auto">
              {BUILTIN_PRESETS.map((p) => (
                <PresetRow key={p.id} preset={p} active={activePresetId === p.id} onSelect={applyPreset} />
              ))}
              {customPresets.length > 0 && (
                <>
                  <div className="border-t border-[#E8E4DE] my-1" />
                  {customPresets.map((p) => (
                    <PresetRow key={p.id} preset={p} active={activePresetId === p.id} onSelect={applyPreset} onDelete={() => handleDeletePreset(p.id)} />
                  ))}
                </>
              )}
              <div className="border-t border-[#E8E4DE] mt-1 pt-2">
                {savingPreset ? (
                  <div className="flex gap-1">
                    <input
                      value={presetNameInput}
                      onChange={(e) => setPresetNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSavePreset();
                        if (e.key === 'Escape') { setSavingPreset(false); setPresetNameInput(''); }
                      }}
                      placeholder="预设名称"
                      autoFocus
                      className="flex-1 text-xs px-2 py-1 rounded-lg border border-[#E8E4DE] focus:outline-none focus:border-[#D4A574] text-[#4A3F35]"
                    />
                    <button onClick={handleSavePreset} className="text-xs px-2 py-1 rounded-lg bg-[#D4A574] text-white hover:bg-[#C4956A]">保存</button>
                    <button onClick={() => { setSavingPreset(false); setPresetNameInput(''); }} className="text-xs px-2 py-1 rounded-lg text-[#6B5E54] hover:bg-[#E8E4DE]">取消</button>
                  </div>
                ) : (
                  <button onClick={() => setSavingPreset(true)} className="flex items-center gap-1 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-[#6B5E54] hover:bg-[#FAF8F5]">
                    <Plus className="w-3 h-3" /> 保存当前为预设
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 颜色选择（紧凑圆点） */}
        <div className="flex items-center gap-0.5 bg-white/80 rounded-full p-1 border border-white/40 shadow-sm flex-shrink-0">
          {PRESET_COLORS.slice(0, 8).map((c) => (
            <button
              key={c.value}
              onClick={() => selectColor(c.value)}
              title={c.label}
              className={cn(
                'w-6 h-6 rounded-full transition-all flex items-center justify-center',
                color === c.value ? 'scale-110' : 'hover:scale-110',
              )}
            >
              <span
                className={cn(
                  'rounded-full border transition-all',
                  color === c.value ? 'w-5 h-5 ring-2 ring-offset-1 ring-[#4A3F35]' : 'w-4 h-4 border-[#E8E4DE]/50',
                )}
                style={{ backgroundColor: c.hex }}
              />
            </button>
          ))}
        </div>

        {/* 粗细选择 */}
        <div className="flex items-center gap-0.5 bg-white/80 rounded-full p-1 border border-white/40 shadow-sm flex-shrink-0">
          {SIZES.map((s) => (
            <button
              key={s.value}
              onClick={() => selectSize(s.value)}
              title={s.label}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition-all',
                size === s.value ? 'bg-[#4A3F35]' : 'hover:bg-black/5',
              )}
            >
              <span
                className="rounded-full"
                style={{
                  width: Math.min(s.dot * 0.7, 10),
                  height: Math.min(s.dot * 0.7, 10),
                  backgroundColor: size === s.value ? 'white' : '#6B5E54',
                }}
              />
            </button>
          ))}
        </div>

        {/* 撤销/重做/删除 */}
        <div className="flex items-center gap-0.5 bg-white/80 rounded-full p-0.5 border border-white/40 shadow-sm flex-shrink-0">
          <button onClick={() => editor.undo()} title="撤销" className="w-8 h-8 rounded-full flex items-center justify-center text-[#4A3F35] hover:bg-black/5 transition-all">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => editor.redo()} title="重做" className="w-8 h-8 rounded-full flex items-center justify-center text-[#4A3F35] hover:bg-black/5 transition-all">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={deleteSelected} title="删除" className="w-8 h-8 rounded-full flex items-center justify-center text-[#4A3F35] hover:bg-black/5 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 更多工具 */}
        <div className="relative flex-shrink-0" ref={moreDropdownRef}>
          <button
            onClick={() => setMoreDropdownOpen((v) => !v)}
            title="更多工具"
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center transition-all bg-white/80 border border-white/40 shadow-sm',
              moreDropdownOpen ? 'text-white bg-[#4A3F35]' : 'text-[#4A3F35] hover:bg-black/5',
            )}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {moreDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-xl border border-[#E8E4DE] shadow-lg z-50 p-2 max-h-[60vh] overflow-y-auto">
              <button onClick={() => { selectTool('text'); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <Type className="w-4 h-4" /> 文本框
              </button>
              <button onClick={() => { selectTool('note'); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <StickyNote className="w-4 h-4" /> 便利贴
              </button>
              <button onClick={() => { selectTool('select'); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <MousePointer2 className="w-4 h-4" /> 选择工具
              </button>
              <div className="border-t border-[#E8E4DE] my-1" />
              <button onClick={() => { selectTool('rectangle'); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <Square className="w-4 h-4" /> 矩形
              </button>
              <button onClick={() => { selectTool('ellipse'); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <Circle className="w-4 h-4" /> 圆形
              </button>
              <button onClick={() => { selectTool('line'); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <Minus className="w-4 h-4" /> 直线
              </button>
              <div className="border-t border-[#E8E4DE] my-1" />
              <button onClick={() => { setShowStickerLibrary(true); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <Sticker className="w-4 h-4" /> 贴纸库
              </button>
              <button onClick={() => { onInsertImage?.(); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <ImageIcon className="w-4 h-4" /> 插入图片
              </button>
              <div className="border-t border-[#E8E4DE] my-1" />
              <button onClick={() => { onToggleShapeRecognition?.(); setMoreDropdownOpen(false); }} className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm hover:bg-[#FAF8F5]',
                shapeRecognitionEnabled ? 'text-[#D4A574] font-medium' : 'text-[#4A3F35]',
              )}>
                <Wand2 className="w-4 h-4" /> 形状识别 {shapeRecognitionEnabled ? '✓' : ''}
              </button>
              {onToggleLaser && (
                <button onClick={() => { onToggleLaser(); setMoreDropdownOpen(false); }} className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm hover:bg-[#FAF8F5]',
                  laserOn ? 'text-[#E85D75] font-medium' : 'text-[#4A3F35]',
                )}>
                  <Zap className="w-4 h-4" /> 激光指针 {laserOn ? '✓' : ''}
                </button>
              )}
              <button onClick={() => { onExportPdf?.(); setMoreDropdownOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
                <Download className="w-4 h-4" /> 导出PDF
              </button>
              <div className="border-t border-[#E8E4DE] my-1" />
              <div className="px-2 py-1 text-[10px] text-[#9B8E84] font-medium uppercase tracking-wider">纸张背景</div>
              {([
                { key: 'transparent', label: '透明', icon: <span className="w-4 h-4 text-[10px] font-bold flex items-center justify-center">透</span> },
                { key: 'grid', label: '方格纸', icon: <Grid3X3 className="w-4 h-4" /> },
                { key: 'lines', label: '横线纸', icon: <span className="w-4 h-4 text-[10px] font-bold flex items-center justify-center">线</span> },
                { key: 'dot', label: '点阵纸', icon: <span className="w-4 h-4 text-[10px] font-bold flex items-center justify-center">点</span> },
                { key: 'staff', label: '五线谱', icon: <span className="w-4 h-4 text-[10px] font-bold flex items-center justify-center">谱</span> },
                { key: 'cornell', label: '康奈尔', icon: <span className="w-4 h-4 text-[10px] font-bold flex items-center justify-center">康</span> },
              ] as const).map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => { changePaper(key); /* more dropdown stays open for paper preview */ }}
                  className={cn(
                    'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm hover:bg-[#FAF8F5]',
                    paper === key ? 'text-[#D4A574] font-medium' : 'text-[#4A3F35]',
                  )}
                >
                  {icon} {label} {paper === key && '✓'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* D4.4 贴纸库面板 */}
        {showStickerLibrary && (
          <StickerLibrary editor={editor} onClose={() => setShowStickerLibrary(false)} />
        )}
      </div>
    );
  }

  // ==== floating 模式：画布内浮动（原有布局） ====
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 flex-wrap justify-center px-2 py-1.5 bg-[#FAF8F5]/95 backdrop-blur rounded-b-xl border border-t-0 border-[#E8E4DE] shadow-sm max-w-[95%]">
      {/* D2.2 笔触预设选择器（下拉按钮 + 展开面板） + 橡皮擦 */}
      <div className="relative flex items-center bg-white rounded-xl border border-[#E8E4DE] p-1 shadow-sm" ref={presetDropdownRef}>
        <button
          onClick={() => setPresetDropdownOpen((v) => !v)}
          title={activePreset ? activePreset.pressureNote : '选择笔触预设'}
          className={cn(
            'h-9 px-2 rounded-lg flex items-center gap-1.5 transition-all',
            presetDropdownOpen || activePresetId
              ? 'text-white shadow-sm bg-[#4A3F35]'
              : 'text-[#6B5E54] hover:bg-[#E8E4DE]',
          )}
        >
          {activePreset?.id === 'highlighter' ? (
            <Highlighter className="w-4 h-4" />
          ) : activePreset?.id === 'brush' ? (
            <PenTool className="w-4 h-4" strokeWidth={2.5} />
          ) : activePreset?.id === 'ball' ? (
            <Pencil className="w-4 h-4" />
          ) : (
            <PenTool className="w-4 h-4" />
          )}
          <span className="text-xs font-medium">{activePreset?.name || '笔触'}</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        {/* 橡皮擦（独立按钮，不进预设系统） */}
        <button
          onClick={() => selectTool('eraser')}
          title="橡皮擦"
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center transition-all ml-1',
            isActive('eraser') ? 'text-white shadow-sm bg-[#4A3F35]' : 'text-[#6B5E54] hover:bg-[#E8E4DE]',
          )}
        >
          <Eraser className="w-4 h-4" />
        </button>

        {/* 下拉面板 */}
        {presetDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl border border-[#E8E4DE] shadow-lg z-50 p-2 max-h-[60vh] overflow-y-auto">
            {/* 内置预设 */}
            {BUILTIN_PRESETS.map((p) => (
              <PresetRow
                key={p.id}
                preset={p}
                active={activePresetId === p.id}
                onSelect={applyPreset}
              />
            ))}

            {/* 自定义预设 */}
            {customPresets.length > 0 && (
              <>
                <div className="border-t border-[#E8E4DE] my-1" />
                {customPresets.map((p) => (
                  <PresetRow
                    key={p.id}
                    preset={p}
                    active={activePresetId === p.id}
                    onSelect={applyPreset}
                    onDelete={() => handleDeletePreset(p.id)}
                  />
                ))}
              </>
            )}

            {/* 保存当前为预设 */}
            <div className="border-t border-[#E8E4DE] mt-1 pt-2">
              {savingPreset ? (
                <div className="flex gap-1">
                  <input
                    value={presetNameInput}
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSavePreset();
                      if (e.key === 'Escape') { setSavingPreset(false); setPresetNameInput(''); }
                    }}
                    placeholder="预设名称"
                    autoFocus
                    className="flex-1 text-xs px-2 py-1 rounded-lg border border-[#E8E4DE] focus:outline-none focus:border-[#D4A574] text-[#4A3F35]"
                  />
                  <button
                    onClick={handleSavePreset}
                    className="text-xs px-2 py-1 rounded-lg bg-[#D4A574] text-white hover:bg-[#C4956A]"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => { setSavingPreset(false); setPresetNameInput(''); }}
                    className="text-xs px-2 py-1 rounded-lg text-[#6B5E54] hover:bg-[#E8E4DE]"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSavingPreset(true)}
                  className="flex items-center gap-1 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-[#6B5E54] hover:bg-[#FAF8F5]"
                >
                  <Plus className="w-3 h-3" />
                  保存当前为预设
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 选择工具 */}
      <ToolGroup>
        <ToolButton
          active={isActive('select')}
          onClick={() => selectTool('select')}
          title="选择（框选/移动）"
          activeColor="#D4A574"
        >
          <MousePointer2 className="w-4 h-4" />
        </ToolButton>
      </ToolGroup>

      {/* 内容工具组 */}
      <ToolGroup>
        <ToolButton
          active={isActive('text')}
          onClick={() => selectTool('text')}
          title="文本框"
        >
          <Type className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={isActive('note')}
          onClick={() => selectTool('note')}
          title="便利贴"
        >
          <StickyNote className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={showStickerLibrary}
          onClick={() => setShowStickerLibrary(!showStickerLibrary)}
          title="贴纸库"
        >
          <Sticker className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={isActive('rectangle')}
          onClick={() => selectTool('rectangle')}
          title="矩形"
        >
          <Square className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={isActive('ellipse')}
          onClick={() => selectTool('ellipse')}
          title="圆形"
        >
          <Circle className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={isActive('line')}
          onClick={() => selectTool('line')}
          title="直线"
        >
          <Minus className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={() => onInsertImage?.()}
          title="插入图片"
        >
          <ImageIcon className="w-4 h-4" />
        </ToolButton>
      </ToolGroup>

      {/* 颜色选择 */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-[#E8E4DE] p-1.5 shadow-sm">
        {PRESET_COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => selectColor(c.value)}
            title={c.label}
            className={cn(
              'w-5 h-5 rounded-full border transition-all',
              color === c.value
                ? 'ring-2 ring-offset-1 ring-[#4A3F35] scale-110'
                : 'hover:scale-110 border-[#E8E4DE]',
            )}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>

      {/* 粗细选择 */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-[#E8E4DE] p-1.5 shadow-sm">
        {SIZES.map((s) => (
          <button
            key={s.value}
            onClick={() => selectSize(s.value)}
            title={s.label}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
              size === s.value
                ? 'bg-[#4A3F35]'
                : 'hover:bg-[#E8E4DE]',
            )}
          >
            <span
              className="rounded-full"
              style={{
                width: s.dot,
                height: s.dot,
                backgroundColor: size === s.value ? 'white' : '#6B5E54',
              }}
            />
          </button>
        ))}
      </div>

      {/* 操作组 */}
      <ToolGroup>
        <ToolButton
          active={false}
          onClick={() => editor.undo()}
          title="撤销 (Cmd+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={() => editor.redo()}
          title="重做 (Cmd+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={false}
          onClick={deleteSelected}
          title="删除选中"
        >
          <Trash2 className="w-4 h-4" />
        </ToolButton>
      </ToolGroup>

      {/* 形状识别开关 */}
      <ToolGroup>
        <ToolButton
          active={!!shapeRecognitionEnabled}
          onClick={() => onToggleShapeRecognition?.()}
          title="形状识别（开启后手绘圆/矩形/直线自动转换）"
          activeColor="#E67E22"
        >
          <Wand2 className="w-4 h-4" />
        </ToolButton>
      </ToolGroup>

      {/* E3.2 激光指针（演示用，临时高亮） */}
      {onToggleLaser && (
        <ToolGroup>
          <ToolButton
            active={!!laserOn}
            onClick={() => onToggleLaser()}
            title="激光指针（演示用，跟随鼠标显示红色光点）"
            activeColor="#E85D75"
          >
            <Zap className="w-4 h-4" />
          </ToolButton>
        </ToolGroup>
      )}

      {/* 导出 PDF */}
      <ToolGroup>
        <ToolButton
          active={false}
          onClick={() => onExportPdf?.()}
          title="导出当前页为 PDF"
        >
          <Download className="w-4 h-4" />
        </ToolButton>
      </ToolGroup>

      {/* 纸张组 */}
      <ToolGroup>
        <ToolButton
          active={paper === 'transparent'}
          onClick={() => changePaper('transparent')}
          title="透明背景"
        >
          <span className="text-[10px] font-medium">透</span>
        </ToolButton>
        <ToolButton
          active={paper === 'grid'}
          onClick={() => changePaper('grid')}
          title="方格纸"
        >
          <Grid3X3 className="w-4 h-4" />
        </ToolButton>
        <ToolButton
          active={paper === 'lines'}
          onClick={() => changePaper('lines')}
          title="横线纸"
        >
          <span className="text-[10px] font-medium">线</span>
        </ToolButton>
        <ToolButton
          active={paper === 'dot'}
          onClick={() => changePaper('dot')}
          title="点阵纸"
        >
          <span className="text-[10px] font-medium">点</span>
        </ToolButton>
        <ToolButton
          active={paper === 'staff'}
          onClick={() => changePaper('staff')}
          title="五线谱纸"
        >
          <span className="text-[10px] font-medium">谱</span>
        </ToolButton>
        <ToolButton
          active={paper === 'cornell'}
          onClick={() => changePaper('cornell')}
          title="康奈尔笔记纸"
        >
          <span className="text-[10px] font-medium">康</span>
        </ToolButton>
      </ToolGroup>

      {/* D4.4 贴纸库面板 */}
      {showStickerLibrary && (
        <StickerLibrary editor={editor} onClose={() => setShowStickerLibrary(false)} />
      )}

      {/* D4.5 便利贴配色快捷行（仅 note 工具激活时显示） */}
      {tool === 'note' && (
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[#E8E4DE]">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => selectColor(c.value)}
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                color === c.value ? 'border-[#4A3F35] ring-2 ring-[#D4A574]/40' : 'border-transparent',
              )}
              style={{ backgroundColor: c.hex }}
              title={c.label}
            />
          ))}
        </div>
      )}

      {/* E3.1 选中操作菜单（有 shape 选中时显示）：改颜色/粗细/虚线 */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[#E8E4DE]">
          {/* 改颜色（6 色精简版） */}
          {NOTE_COLORS.concat(PRESET_COLORS.slice(0, 6)).slice(0, 8).map((c) => (
            <button
              key={`sel-color-${c.value}`}
              onClick={() => updateSelectedStyle('color', c.value)}
              className={cn(
                'w-5 h-5 rounded-full border transition-transform hover:scale-110',
                color === c.value ? 'border-[#4A3F35] ring-2 ring-[#D4A574]/40' : 'border-[#E8E4DE]',
              )}
              style={{ backgroundColor: c.hex }}
              title={`颜色：${c.label}`}
            />
          ))}
          {/* 改粗细 */}
          <div className="flex items-center gap-1 ml-1 pl-1 border-l border-[#E8E4DE]">
            {SIZES.map((s) => (
              <button
                key={`sel-size-${s.value}`}
                onClick={() => updateSelectedStyle('size', s.value)}
                className={cn(
                  'w-6 h-6 rounded flex items-center justify-center transition-colors',
                  size === s.value ? 'bg-[#D4A574]/10' : 'hover:bg-[#E8E4DE]',
                )}
                title={`粗细：${s.label}`}
              >
                <span
                  className="rounded-full bg-[#4A3F35]"
                  style={{ width: s.dot, height: s.dot }}
                />
              </button>
            ))}
          </div>
          {/* 实线/虚线切换 */}
          <button
            onClick={() => updateSelectedStyle('dash', 'draw')}
            className="px-2 h-6 text-xs rounded hover:bg-[#E8E4DE] text-[#6B5E54]"
            title="实线"
          >
            实
          </button>
          <button
            onClick={() => updateSelectedStyle('dash', 'dashed')}
            className="px-2 h-6 text-xs rounded hover:bg-[#E8E4DE] text-[#6B5E54]"
            title="虚线"
          >
            虚
          </button>
        </div>
      )}
    </div>
  );
}

export type { PaperType };
