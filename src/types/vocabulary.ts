export interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  phonetic?: string;
  examples: string[];
  sourceBook?: string;
  addedDate: Date;
  reviewCount: number;
  nextReviewDate: Date;
  easeFactor: number;
  mastered: boolean;
}

export interface ReviewLog {
  id: string;
  wordId: string;
  quality: number; // 0-5
  reviewDate: Date;
}