import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { VocabularyWord } from '@/types/vocabulary';

interface VocabularyState {
  words: VocabularyWord[];
  currentReviewWord: VocabularyWord | null;
  addWord: (word: VocabularyWord) => void;
  removeWord: (id: string) => void;
  updateWord: (id: string, updates: Partial<VocabularyWord>) => void;
  setCurrentReviewWord: (word: VocabularyWord | null) => void;
  getWordsForReview: () => VocabularyWord[];
}

// 示例生词数据
const sampleWords: VocabularyWord[] = [
  {
    id: '1',
    word: 'ephemeral',
    definition: '短暂的，转瞬即逝的',
    phonetic: '/ɪˈfem(ə)rəl/',
    examples: ['The ephemeral beauty of cherry blossoms.'],
    sourceBook: '英语阅读理解精选',
    addedDate: new Date('2024-03-01'),
    reviewCount: 2,
    nextReviewDate: new Date('2024-03-05'),
    easeFactor: 2.5,
    mastered: false,
  },
  {
    id: '2',
    word: 'ubiquitous',
    definition: '无处不在的，普遍存在的',
    phonetic: '/juˈbɪkwɪtəs/',
    examples: ['Smartphones have become ubiquitous in modern society.'],
    sourceBook: '英语阅读理解精选',
    addedDate: new Date('2024-03-02'),
    reviewCount: 1,
    nextReviewDate: new Date('2024-03-04'),
    easeFactor: 2.5,
    mastered: false,
  },
  {
    id: '3',
    word: 'meticulous',
    definition: '一丝不苟的，细致的',
    phonetic: '/məˈtɪkjələs/',
    examples: ['She is meticulous in her research work.'],
    sourceBook: '人类简史',
    addedDate: new Date('2024-02-20'),
    reviewCount: 3,
    nextReviewDate: new Date('2024-03-10'),
    easeFactor: 2.8,
    mastered: false,
  },
  {
    id: '4',
    word: 'paradigm',
    definition: '范例，范式',
    phonetic: '/ˈpærədaɪm/',
    examples: ['This represents a new paradigm in education.'],
    sourceBook: '深入理解计算机系统',
    addedDate: new Date('2024-01-15'),
    reviewCount: 5,
    nextReviewDate: new Date('2024-03-20'),
    easeFactor: 3.0,
    mastered: true,
  },
];

// Date 字段在 JSON 序列化时变字符串，反序列化时还原
function reviveDates(word: VocabularyWord): VocabularyWord {
  return {
    ...word,
    addedDate: word.addedDate instanceof Date ? word.addedDate : new Date(word.addedDate),
    nextReviewDate:
      word.nextReviewDate instanceof Date
        ? word.nextReviewDate
        : new Date(word.nextReviewDate),
  };
}

export const useVocabularyStore = create<VocabularyState>()(
  persist<VocabularyState>(
    (set) => ({
      words: sampleWords,
      currentReviewWord: null,
      addWord: (word) => set((state) => {
        // 防重复：相同单词（不区分大小写）已存在则替换，不追加
        const lowerWord = word.word.toLowerCase().trim();
        const exists = state.words.some(w => w.word.toLowerCase().trim() === lowerWord);
        if (exists) {
          return {
            words: state.words.map(w =>
              w.word.toLowerCase().trim() === lowerWord ? { ...word, id: w.id } : w
            )
          };
        }
        return { words: [...state.words, word] };
      }),
      removeWord: (id) => set((state) => ({ words: state.words.filter((w) => w.id !== id) })),
      updateWord: (id, updates) =>
        set((state) => ({
          words: state.words.map((w) => (w.id === id ? { ...w, ...updates } : w)),
        })),
      setCurrentReviewWord: (word) => set({ currentReviewWord: word }),
      getWordsForReview: () => {
        const state = useVocabularyStore.getState();
        const today = new Date();
        return state.words.filter((w) => !w.mastered && w.nextReviewDate <= today);
      },
    }),
    {
      name: 'lexnote-vocabulary',
      // 反序列化后还原 Date 字段，并重置临时态 currentReviewWord，同时自动去重
      onRehydrateStorage: () => (state) => {
        if (state?.words) {
          state.words = state.words.map(reviveDates);
          // 自动去重：相同单词（不区分大小写）只保留一个
          const seen = new Set<string>();
          state.words = state.words.filter(w => {
            const key = w.word.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        if (state) {
          state.currentReviewWord = null;
        }
      },
    },
  ),
);