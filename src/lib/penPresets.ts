/**
 * D2 高级笔触效果：笔触预设系统
 *
 * tldraw draw shape 的压力变宽由 perfect-freehand 原生处理（points 含 pressure），
 * Apple Pencil 输入时压感自动生效，鼠标无压感时为均匀线。
 * 本文件只定义预设的 size/color/dash 组合 + UI 说明，不配置实际压力参数
 * （tldraw 不暴露按笔型调节压力灵敏度的 API）。
 */

export interface PenPreset {
  id: string;
  name: string;
  /** tldraw 工具：draw=自由手写, highlight=荧光笔 */
  tool: 'draw' | 'highlight';
  /** tldraw DefaultSizeStyle: s/m/l/xl */
  size: 's' | 'm' | 'l' | 'xl';
  /** tldraw DefaultDashStyle: draw=手绘风, solid=实线 */
  dash: 'draw' | 'solid';
  /** tldraw 命名色（black/yellow/...） */
  color: string;
  /** 荧光笔用，0-1 */
  opacity?: number;
  /** UI 提示文字（说明压感行为） */
  pressureNote: string;
  /** 是否内置预设（内置不可删除） */
  builtin: boolean;
}

/** 内置 4 种笔型（对应 GoodNotes 钢笔/圆珠笔/毛笔/荧光笔） */
export const BUILTIN_PRESETS: PenPreset[] = [
  {
    id: 'fountain',
    name: '钢笔',
    tool: 'draw',
    size: 'm',
    dash: 'draw',
    color: 'black',
    pressureNote: 'Apple Pencil 压感自动启用，重压变宽',
    builtin: true,
  },
  {
    id: 'ball',
    name: '圆珠笔',
    tool: 'draw',
    size: 's',
    dash: 'draw',
    color: 'black',
    pressureNote: '细线均匀（鼠标无压感时为均匀线）',
    builtin: true,
  },
  {
    id: 'brush',
    name: '毛笔',
    tool: 'draw',
    size: 'l',
    dash: 'draw',
    color: 'black',
    pressureNote: '重压大幅变宽，模拟毛笔',
    builtin: true,
  },
  {
    id: 'highlighter',
    name: '荧光笔',
    tool: 'highlight',
    size: 'l',
    dash: 'solid',
    color: 'yellow',
    opacity: 0.4,
    pressureNote: '半透明，不遮挡文字',
    builtin: true,
  },
];

const STORAGE_KEY = 'lexnote-pen-presets';
const ACTIVE_KEY = 'lexnote-pen-preset-active';

/** 加载自定义预设 */
export function loadCustomPresets(): PenPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PenPreset[];
    return parsed.filter((p) => p && p.id && p.name);
  } catch {
    return [];
  }
}

/** 保存自定义预设（覆盖同 id） */
export function saveCustomPreset(preset: PenPreset): PenPreset[] {
  const custom = loadCustomPresets();
  const idx = custom.findIndex((p) => p.id === preset.id);
  if (idx >= 0) custom[idx] = preset;
  else custom.push(preset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  return custom;
}

/** 删除自定义预设 */
export function deleteCustomPreset(id: string): PenPreset[] {
  const custom = loadCustomPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  return custom;
}

/** 获取全部预设（内置 + 自定义） */
export function getAllPresets(): PenPreset[] {
  return [...BUILTIN_PRESETS, ...loadCustomPresets()];
}

/** 记住当前激活的预设 id */
export function getActivePresetId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActivePresetId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

/** 根据 id 查预设 */
export function findPresetById(id: string): PenPreset | undefined {
  return getAllPresets().find((p) => p.id === id);
}

/** 生成自定义预设 id */
export function genPresetId(): string {
  return `custom-${Date.now()}`;
}
