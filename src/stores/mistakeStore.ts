import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HighlightLocator } from '@/lib/storage';

export type MistakeType = 'word' | 'sentence' | 'math';

export interface MistakeItem {
  id: string;
  bookId: string;
  type: MistakeType;
  content: string; // 生词 / 句子 / 题目文本
  answer?: string; // AI 解答或翻译
  pageNumber: number; // 定位用页码
  locator?: HighlightLocator; // 精确定位（复用高亮定位器）
  createdAt: string; // ISO string
}

interface MistakeState {
  mistakes: MistakeItem[];
  addMistake: (m: MistakeItem) => void;
  removeMistake: (id: string) => void;
  clearByBook: (bookId: string) => void;
  getMistakesByBook: (bookId: string) => MistakeItem[];
  getMistakesByType: (bookId: string, type: MistakeType) => MistakeItem[];
}

export const useMistakeStore = create<MistakeState>()(
  persist<MistakeState>(
    (set, get) => ({
      mistakes: [],
      addMistake: (m) =>
        set((state) => {
          // 防重复：同书同类型同内容的不重复添加
          const duplicate = state.mistakes.find(
            x => x.bookId === m.bookId && x.type === m.type && x.content.trim().toLowerCase() === m.content.trim().toLowerCase()
          );
          if (duplicate) {
            return {
              mistakes: state.mistakes.map(x => x.id === duplicate.id ? { ...m, id: duplicate.id } : x)
            };
          }
          return {
            mistakes: [...state.mistakes.filter((x) => x.id !== m.id), m],
          };
        }),
      removeMistake: (id) =>
        set((state) => ({ mistakes: state.mistakes.filter((x) => x.id !== id) })),
      clearByBook: (bookId) =>
        set((state) => ({ mistakes: state.mistakes.filter((x) => x.bookId !== bookId) })),
      getMistakesByBook: (bookId) =>
        get()
          .mistakes.filter((x) => x.bookId === bookId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      getMistakesByType: (bookId, type) =>
        get()
          .mistakes.filter((x) => x.bookId === bookId && x.type === type)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }),
    {
      name: 'lexnote-mistakes',
      // 反序列化时自动去重
      onRehydrateStorage: () => (state) => {
        if (state?.mistakes) {
          const seen = new Set<string>();
          state.mistakes = state.mistakes.filter(m => {
            const key = `${m.bookId}-${m.type}-${m.content.trim().toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      },
    },
  ),
);
