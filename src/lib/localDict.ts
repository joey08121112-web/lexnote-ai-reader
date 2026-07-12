import { get, set } from 'idb-keyval';

/**
 * 本地词典模块 —— 离线查词
 *
 * 数据来源分层：
 * 1. 内置 mini-dict.json（~120 高频词，随应用打包，即时可用）
 * 2. 完整 ecdict.json（可选，用户下载后缓存到 IndexedDB，~5万词）
 *
 * 词态还原：running→run, books→book, easier→easy, went→go
 */

export interface DictEntry {
  word: string;
  translation: string;
  phonetic?: string;
}

// 内存词典：word(小写) → 释义
let dictMap: Map<string, string> | null = null;
let dictLoadPromise: Promise<void> | null = null;

const MINI_DICT_URL = '/dict/mini-dict.json';
const FULL_DICT_URL = '/dict/ecdict.json';
const IDB_FULL_DICT_KEY = 'lexnote-full-dict';

/** 加载内置 mini 词典到内存 */
async function loadMiniDict(): Promise<void> {
  if (dictMap) return;
  try {
    const res = await fetch(MINI_DICT_URL);
    const json = await res.json();
    dictMap = new Map<string, string>();
    if (json.data) {
      for (const [word, trans] of Object.entries(json.data)) {
        dictMap.set(word.toLowerCase(), trans as string);
      }
    }
  } catch (e) {
    console.warn('Failed to load mini dict:', e);
    dictMap = new Map();
  }
}

/** 尝试加载完整词典（IndexedDB 缓存优先，无则尝试 fetch） */
export async function loadFullDict(): Promise<boolean> {
  try {
    // 1. 先查 IndexedDB 缓存
    const cached = await get<Record<string, string>>(IDB_FULL_DICT_KEY);
    if (cached && Object.keys(cached).length > 1000) {
      if (!dictMap) dictMap = new Map();
      for (const [w, t] of Object.entries(cached)) dictMap.set(w.toLowerCase(), t);
      console.log(`[LocalDict] 完整词典已从缓存加载，${dictMap.size} 词`);
      return true;
    }

    // 2. 尝试从 public/dict/ecdict.json 加载
    const res = await fetch(FULL_DICT_URL);
    if (!res.ok) {
      console.log('[LocalDict] 完整词典未找到（ecdict.json 不存在），使用内置词典');
      return false;
    }
    const json = await res.json();
    const data: Record<string, string> = json.data || json;
    if (!data || Object.keys(data).length < 100) return false;

    // 缓存到 IndexedDB
    await set(IDB_FULL_DICT_KEY, data);
    if (!dictMap) dictMap = new Map();
    for (const [w, t] of Object.entries(data)) dictMap.set(w.toLowerCase(), t);
    console.log(`[LocalDict] 完整词典已加载，${dictMap.size} 词`);
    return true;
  } catch (e) {
    console.warn('[LocalDict] 加载完整词典失败:', e);
    return false;
  }
}

/** 确保词典已加载（mini 必加载，full 尝试加载） */
export async function ensureDictLoaded(): Promise<void> {
  if (dictLoadPromise) return dictLoadPromise;
  dictLoadPromise = (async () => {
    await loadMiniDict();
    await loadFullDict();
  })();
  return dictLoadPromise;
}

/**
 * 词态还原 —— 把变形词还原为词根
 * 处理常见英语屈折变化：复数、过去式、进行式、比较级、最高级
 */
function lemmatize(word: string): string {
  const w = word.toLowerCase();
  // 不规则动词（常见）
  const irregular: Record<string, string> = {
    went: 'go', gone: 'go', going: 'go',
    was: 'be', were: 'be', been: 'be', being: 'be', am: 'be', is: 'be', are: 'be',
    had: 'have', has: 'have', having: 'have',
    did: 'do', done: 'do', doing: 'do', does: 'do',
    said: 'say', saying: 'say',
    took: 'take', taken: 'take', taking: 'take', takes: 'take',
    came: 'come', coming: 'come',
    made: 'make', making: 'make', makes: 'make',
    saw: 'see', seen: 'see', seeing: 'see', sees: 'see',
    found: 'find', finding: 'find', finds: 'find',
    gave: 'give', given: 'give', giving: 'give', gives: 'give',
    got: 'get', gotten: 'get', getting: 'get', gets: 'get',
    knew: 'know', known: 'know', knowing: 'know', knows: 'know',
    thought: 'think', thinking: 'think', thinks: 'think',
    told: 'tell', telling: 'tell', tells: 'tell',
    put: 'put', putting: 'put',
    let: 'let', letting: 'let',
    read: 'read', reading: 'read', reads: 'read',
    ran: 'run', running: 'run', runs: 'run',
    sat: 'sit', sitting: 'sit', sits: 'sit',
    stood: 'stand', standing: 'stand', stands: 'stand',
    spoke: 'speak', spoken: 'speak', speaking: 'speak', speaks: 'speak',
    wrote: 'write', written: 'write', writing: 'write', writes: 'write',
    began: 'begin', begun: 'begin', beginning: 'begin', begins: 'begin',
    drank: 'drink', drunk: 'drink', drinking: 'drink', drinks: 'drink',
    ate: 'eat', eaten: 'eat', eating: 'eat', eats: 'eat',
    fell: 'fall', fallen: 'fall', falling: 'fall', falls: 'fall',
    felt: 'feel', feeling: 'feel', feels: 'feel',
    left: 'leave', leaving: 'leave', leaves: 'leave',
    met: 'meet', meeting: 'meet', meets: 'meet',
    won: 'win', winning: 'win', wins: 'win',
    lost: 'lose', losing: 'lose', loses: 'lose',
    children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth',
    better: 'good', best: 'good',
    worse: 'bad', worst: 'bad',
    more: 'much', most: 'much',
    further: 'far', furthest: 'far',
  };
  if (irregular[w]) return irregular[w];

  // 规则变化
  // 进行时/过去式 -ing/-ed
  if (w.endsWith('ing') && w.length > 4) {
    const stem = w.slice(0, -3);
    if (dictMap?.has(stem)) return stem;
    // running → run
    if (w.endsWith('ing') && w.length > 5 && w[w.length - 4] === w[w.length - 5]) {
      const stem2 = w.slice(0, -4);
      if (dictMap?.has(stem2)) return stem2;
    }
  }
  if (w.endsWith('ied') && w.length > 4) {
    const stem = w.slice(0, -3) + 'y'; // tried → try
    if (dictMap?.has(stem)) return stem;
  }
  if (w.endsWith('ed') && w.length > 3) {
    const stem = w.slice(0, -2);
    if (dictMap?.has(stem)) return stem;
    // stopped → stop
    if (w[w.length - 3] === w[w.length - 4]) {
      const stem2 = w.slice(0, -3);
      if (dictMap?.has(stem2)) return stem2;
    }
  }
  // 复数 -es/-s
  if (w.endsWith('ies') && w.length > 4) {
    const stem = w.slice(0, -3) + 'y'; // cities → city
    if (dictMap?.has(stem)) return stem;
  }
  if (w.endsWith('es') && w.length > 3) {
    const stem = w.slice(0, -2);
    if (dictMap?.has(stem)) return stem;
  }
  if (w.endsWith('s') && w.length > 2) {
    const stem = w.slice(0, -1);
    if (dictMap?.has(stem)) return stem;
  }
  // 比较级/最高级
  if (w.endsWith('ier') && w.length > 4) {
    const stem = w.slice(0, -3) + 'y';
    if (dictMap?.has(stem)) return stem;
  }
  if (w.endsWith('iest') && w.length > 5) {
    const stem = w.slice(0, -4) + 'y';
    if (dictMap?.has(stem)) return stem;
  }
  if (w.endsWith('er') && w.length > 3) {
    const stem = w.slice(0, -2);
    if (dictMap?.has(stem)) return stem;
  }
  if (w.endsWith('est') && w.length > 4) {
    const stem = w.slice(0, -3);
    if (dictMap?.has(stem)) return stem;
  }
  return w;
}

/**
 * 查询单个单词
 * 自动尝试词态还原
 */
export async function lookupWord(word: string): Promise<string | null> {
  await ensureDictLoaded();
  if (!dictMap) return null;
  const w = word.toLowerCase().trim();
  if (!w) return null;

  // 1. 直接查
  const direct = dictMap.get(w);
  if (direct) return direct;

  // 2. 词态还原后查
  const lemma = lemmatize(w);
  if (lemma !== w) {
    const found = dictMap.get(lemma);
    if (found) return found;
  }

  return null;
}

/** 判断是否为单词（含字母，可含撇号/连字符） */
export function isWord(text: string): boolean {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(text.trim());
}

/**
 * 离线逐词翻译句子（fallback，质量有限）
 * 已知词用词典释义，未知词保留原文
 */
export async function translateSentenceOffline(text: string): Promise<string> {
  await ensureDictLoaded();
  const words = text.split(/(\s+)/); // 保留空格
  const parts: string[] = [];
  for (const token of words) {
    if (/^\s+$/.test(token)) {
      parts.push(token);
      continue;
    }
    // 去除标点后查词
    const cleanWord = token.replace(/[^A-Za-z'-]/g, '');
    if (!cleanWord) {
      parts.push(token);
      continue;
    }
    const trans = await lookupWord(cleanWord);
    if (trans) {
      // 只取第一个释义的核心部分
      const first = trans.split(/[;；,，]/)[0].trim();
      parts.push(first);
    } else {
      parts.push(token); // 未知词保留原文
    }
  }
  return parts.join('');
}

/** 获取词典统计信息 */
export function getDictStats(): { size: number; hasFull: boolean } {
  return {
    size: dictMap?.size || 0,
    hasFull: (dictMap?.size || 0) > 1000,
  };
}
