/**
 * 启发式形状识别（基于 freehand 笔画点序列）
 *
 * 检测三种形状：
 * - 直线：所有点到首尾点连线的最大距离 < 阈值（非闭合）
 * - 圆：闭合 + 点到质心距离的变异系数 < 阈值
 * - 矩形：闭合 + >80% 的点落在包围盒边界附近
 *
 * 返回的坐标均为「绝对画布坐标」（即输入 points 的坐标系），
 * 调用方需据此构造 tldraw shape（注意 shape.x/y 是原点，props 用相对坐标）。
 */

export type RecognizedShape =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'rectangle'; x: number; y: number; w: number; h: number }
  | null;

interface Thresholds {
  /** 点到直线最大允许距离（px） */
  lineError: number;
  /** 圆的变异系数阈值（标准差/均值） */
  circleError: number;
  /** 矩形边界吸附距离（px） */
  rectEdge: number;
  /** 闭合判定：起止点距离（px） */
  closeDistance: number;
  /** 矩形最小长宽比（防止过细） */
  rectMinRatio: number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  lineError: 8,
  circleError: 0.2,
  rectEdge: 15,
  closeDistance: 25,
  rectMinRatio: 0.1,
};

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** 点 (px,py) 到直线 (ax,ay)-(bx,by) 的距离 */
function distToLine(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(px, py, ax, ay);
  // 叉积 / len = 点到直线距离
  return Math.abs(dx * (ay - py) - dy * (ax - px)) / len;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[], m?: number): number {
  if (nums.length === 0) return 0;
  const mu = m ?? mean(nums);
  const variance = nums.reduce((a, b) => a + (b - mu) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

/**
 * 识别笔画形状
 * @param points 笔画点序列 [[x, y, pressure?], ...]（绝对画布坐标）
 */
export function recognizeShape(
  points: number[][],
  thresholds?: Partial<Thresholds>,
): RecognizedShape {
  if (points.length < 5) return null;
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const first = points[0];
  const last = points[points.length - 1];
  const isClosed = dist(first[0], first[1], last[0], last[1]) < t.closeDistance;

  // 1. 直线检测（非闭合）：所有点到首尾点连线的最大距离
  if (!isClosed) {
    let maxErr = 0;
    for (const p of points) {
      const d = distToLine(p[0], p[1], first[0], first[1], last[0], last[1]);
      if (d > maxErr) maxErr = d;
    }
    if (maxErr < t.lineError) {
      return { type: 'line', x1: first[0], y1: first[1], x2: last[0], y2: last[1] };
    }
  }

  if (!isClosed) return null; // 圆/矩形要求闭合

  // 2. 圆检测：点到质心距离的变异系数
  const cx = mean(points.map((p) => p[0]));
  const cy = mean(points.map((p) => p[1]));
  const dists = points.map((p) => dist(p[0], p[1], cx, cy));
  const meanDist = mean(dists);
  if (meanDist > 0) {
    const cv = stdDev(dists, meanDist) / meanDist;
    if (cv < t.circleError) {
      return { type: 'circle', cx, cy, r: meanDist };
    }
  }

  // 3. 矩形检测：包围盒 + >80% 点落在边界附近
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return null;
  const ratio = Math.min(w, h) / Math.max(w, h);
  if (ratio < t.rectMinRatio) return null; // 过细，不是矩形

  let onEdge = 0;
  for (const p of points) {
    const dLeft = Math.abs(p[0] - minX);
    const dRight = Math.abs(p[0] - maxX);
    const dTop = Math.abs(p[1] - minY);
    const dBottom = Math.abs(p[1] - maxY);
    const minD = Math.min(dLeft, dRight, dTop, dBottom);
    if (minD < t.rectEdge) onEdge++;
  }
  if (onEdge / points.length > 0.8) {
    return { type: 'rectangle', x: minX, y: minY, w, h };
  }

  return null;
}
