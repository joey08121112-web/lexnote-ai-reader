import { useSettingsStore, type AIModel } from '@/stores/settingsStore';
import { lookupWord, isWord, translateSentenceOffline, ensureDictLoaded } from './localDict';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
}

function buildAIPayload(
  image: string | null,
  prompt: string,
  history?: ChatMessage[],
) {
  const { apiKey, model, customEndpoint, doubaoMode, doubaoModelName, doubaoEndpointId } = useSettingsStore.getState();

  return {
    image,
    prompt,
    model: apiKey ? model : undefined,
    apiKey: apiKey || undefined,
    history: history?.map((h) => ({ role: h.role, content: h.content })),
    customEndpoint: apiKey && model === 'custom' ? customEndpoint : undefined,
    doubaoMode: apiKey && model === 'doubao' ? doubaoMode : undefined,
    doubaoModelName: apiKey && model === 'doubao' ? doubaoModelName : undefined,
    endpointId: apiKey && model === 'doubao' && doubaoMode === 'endpoint' ? doubaoEndpointId : undefined,
  };
}

/**
 * 调用 AI 多模态大模型，支持图片输入
 * 通过后端 /api/ai 代理转发，避免 CORS 和 API Key 暴露
 * 若前端未配置 apiKey，后端自动使用服务端默认 Key
 */
export async function solveFromImage(
  imageBase64: string,
  prompt: string,
  history?: ChatMessage[],
): Promise<string> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAIPayload(imageBase64, prompt, history)),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '网络错误' }));
    throw new Error(err.error || `请求失败 (${response.status})`);
  }

  const data = await response.json();
  return data.content;
}

/**
 * 纯文本 AI 问答（不传图片）
 */
export async function askFromText(
  text: string,
  prompt: string,
  history?: ChatMessage[],
): Promise<string> {
  const fullPrompt = `${prompt}\n\n${text}`;

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAIPayload(null, fullPrompt, history)),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '网络错误' }));
    throw new Error(err.error || `请求失败 (${response.status})`);
  }

  const data = await response.json();
  return data.content;
}

/** 预设提示词 */
export const PROMPTS = {
  solve: '请仔细看这道题，给出详细的解题步骤，每一步都解释清楚为什么这么做。如果有多个解法，给出最简单的那种。',
  answerOnly: '请直接给出这道题的答案，不需要详细步骤。',
  explain: '请讲解这道题考查的知识点，以及类似的题目应该怎么解。',
  translate: '请把页面中的内容翻译成中文，保持原文结构清晰。',
  grammar: '请对以下英文句子进行语法分析：\n1. 标注句子结构（主语/谓语/宾语/定语/状语/补语）\n2. 列出核心语法点（时态、从句类型、特殊句式等）\n3. 给出中文翻译\n4. 如果有难点词汇，简要解释\n\n句子：',
  documentQA: '你是文档助手。基于以下文档内容回答用户的问题。如果文档中没有相关信息，明确说明。回答用中文。\n\n文档内容：',
  summarize: '请总结以下文档的核心内容，分点输出（不超过 5 点，每点不超过 30 字）：\n\n文档内容：',
  extractWords: '请从以下文档中提取 10 个最重要的英文生词，输出 JSON 数组，每项含 {word, definition, phonetic}：\n\n文档内容：',
} as const;

/** File 转 base64 data URL */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 翻译文本 —— 三层降级策略，支持离线
 */
export async function translateText(
  text: string,
  target = 'zh-CN',
): Promise<{ translated: string; detectedLang: string; source: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { translated: '', detectedLang: 'auto', source: 'dict' };

  ensureDictLoaded().catch(() => {});

  if (isWord(trimmed)) {
    const dictResult = await lookupWord(trimmed);
    if (dictResult) {
      return { translated: dictResult, detectedLang: 'en', source: 'dict' };
    }
  }

  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, target }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return { translated: data.translated, detectedLang: data.detectedLang || 'auto', source: 'online' };
      }
    } catch {
      // 网络错误/超时，继续降级
    }
  }

  try {
    const { translateWasm, isWasmLoadFailed } = await import('./wasmTranslate');
    if (!isWasmLoadFailed()) {
      const wasmResult = await translateWasm(trimmed);
      if (wasmResult) {
        return { translated: wasmResult, detectedLang: 'en', source: 'wasm' };
      }
    }
  } catch {
    // WASM 不可用，继续降级
  }

  const fallback = await translateSentenceOffline(trimmed);
  return { translated: fallback, detectedLang: 'en', source: 'offline-fallback' };
}
