/**
 * WASM 神经翻译模块 —— 浏览器端离线整句翻译
 *
 * 使用 transformers.js + Xenova/opus-mt-en-zh 模型
 * 模型约 70MB，首次使用时从 HuggingFace CDN 下载，浏览器缓存后离线可用
 *
 * 动态 import 避免进入首屏 bundle
 */

let pipeline: any = null;
let loadPromise: Promise<any> | null = null;
let loadFailed = false;

/** 模型加载状态回调 */
export type WasmLoadProgress = (progress: { loaded: boolean; error?: string; percent?: number }) => void;

/**
 * 加载翻译模型（懒加载，首次调用 translateWasm 时自动触发）
 * 模型从 HuggingFace CDN 下载，浏览器 IndexedDB 缓存
 */
export async function loadTranslationModel(onProgress?: WasmLoadProgress): Promise<any> {
  if (loadFailed) throw new Error('WASM 翻译模型加载失败，请检查网络');
  if (pipeline) return pipeline;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // 动态 import，不进首屏 bundle
      const { pipeline: createPipeline, env } = await import('@huggingface/transformers');

      // 允许从远程加载模型
      env.allowLocalModels = false;
      // 中国大陆访问 huggingface.co 受限，且直连 hf-mirror.com 会被 CORS 拦截
      // 走后端 /api/hf/* 代理（服务端转发到 hf-mirror.com，绕过 CORS 和重定向）
      env.remoteHost = '/api/hf';

      onProgress?.({ loaded: false, percent: 0 });

      // opus-mt-en-zh: 英→中翻译，q8 量化约 70MB
      pipeline = await createPipeline('translation', 'Xenova/opus-mt-en-zh', {
        dtype: 'q8',
        progress_callback: (info: any) => {
          if (info.status === 'progress' && info.progress) {
            onProgress?.({ loaded: false, percent: Math.round(info.progress) });
          } else if (info.status === 'done') {
            onProgress?.({ loaded: true, percent: 100 });
          }
        },
      });

      onProgress?.({ loaded: true, percent: 100 });
      return pipeline;
    } catch (e) {
      loadFailed = true;
      const msg = (e as Error)?.message || '模型加载失败';
      onProgress?.({ loaded: false, error: msg });
      throw e;
    }
  })();

  return loadPromise;
}

/**
 * WASM 离线翻译（英→中）
 * 首次调用会触发模型下载（约 70MB），需联网；后续走浏览器缓存，离线可用
 */
export async function translateWasm(text: string): Promise<string> {
  if (!text.trim()) return '';
  const translator = await loadTranslationModel();
  const output = await translator(text, {
    max_length: 512,
    // callback: (beam: any) => { ... }  // 可选：流式输出
  });
  // 输出格式: [{ translation_text: "..." }]
  if (Array.isArray(output) && output[0]?.translation_text) {
    return output[0].translation_text;
  }
  return String(output);
}

/** 检查 WASM 模型是否已加载（已缓存） */
export function isWasmModelLoaded(): boolean {
  return pipeline !== null;
}

/** 检查 WASM 模型是否加载失败 */
export function isWasmLoadFailed(): boolean {
  return loadFailed;
}

/** 重置失败状态，允许重试 */
export function resetWasmLoadState(): void {
  loadFailed = false;
  loadPromise = null;
}
