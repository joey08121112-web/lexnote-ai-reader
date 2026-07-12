import type { Editor } from 'tldraw';
import type { TLShape } from '@tldraw/tlschema';
import Tesseract from 'tesseract.js';
import { solveFromImage } from './aiService';

// 独立 worker 单例，避免污染 handwritingSearch 的缓存逻辑
// （手写搜索会缓存每页 OCR 结果，转文字不需要缓存）
let ocrWorkerPromise: Promise<Tesseract.Worker> | null = null;

async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker('eng+chi_sim');
  }
  return ocrWorkerPromise;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * 套选手写 strokes → 纯文字（OCR 引擎：英文 + 中文）
 * @param editor tldraw editor 实例
 * @param shapeIds 选中的 shape id 列表
 * @returns 识别的文字（已 trim）；空字符串表示无内容或识别失败
 */
export async function recognizeHandwriting(
  editor: Editor,
  shapeIds: string[],
): Promise<string> {
  if (shapeIds.length === 0) return '';

  const shapes: TLShape[] = [];
  for (const id of shapeIds) {
    const s = editor.getShape(id as never);
    if (s) shapes.push(s);
  }
  if (shapes.length === 0) return '';

  const { blob } = await editor.toImage(shapes, {
    format: 'png',
    scale: 2,
    pixelRatio: 1,
    background: true,
  });

  const worker = await getOcrWorker();
  const { data } = await worker.recognize(blob);
  return data.text.trim();
}

/**
 * 套选数学公式 → LaTeX 源码
 * 走 AI 多模态（tesseract 对 LaTeX 公式效果差）
 *
 * @param editor tldraw editor 实例
 * @param shapeIds 选中的 shape id 列表
 * @returns LaTeX 字符串（含 \(...\) 包裹）；如未识别到公式，返回错误提示
 */
export async function recognizeMathFormula(
  editor: Editor,
  shapeIds: string[],
): Promise<string> {
  if (shapeIds.length === 0) return '未识别到公式';

  const shapes: TLShape[] = [];
  for (const id of shapeIds) {
    const s = editor.getShape(id as never);
    if (s) shapes.push(s);
  }
  if (shapes.length === 0) return '未识别到公式';

  const { blob } = await editor.toImage(shapes, {
    format: 'png',
    scale: 2,
    pixelRatio: 1,
    background: true,
  });

  const dataUrl = await blobToDataUrl(blob);
  // 复用 solveFromImage（已封装 /api/ai 多模态调用）
  return solveFromImage(
    dataUrl,
    '请识别图中的数学公式，输出 LaTeX 源码。\n要求：\n1. 只输出 LaTeX，不要解释\n2. 用 \\(...\\) 包裹行内公式，用 \\[...\\] 包裹行间公式\n3. 多个公式用换行分隔\n4. 如果图中没有数学公式，输出「未识别到公式」',
  );
}
