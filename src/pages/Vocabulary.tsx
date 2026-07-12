import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, RotateCcw, Check, X, Trash2, Calendar } from 'lucide-react';
import { useVocabularyStore } from '@/stores/vocabularyStore';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils';

export default function Vocabulary() {
  const navigate = useNavigate();
  const { words, removeWord, updateWord } = useVocabularyStore();
  const [viewMode, setViewMode] = useState<'list' | 'review'>('list');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // 获取需要复习的单词
  const reviewWords = words.filter((w) => !w.mastered);

  // 复习评分
  const handleReview = (quality: number) => {
    if (reviewWords[reviewIndex]) {
      const word = reviewWords[reviewIndex];
      const newEaseFactor = Math.max(1.3, word.easeFactor + 0.1 - (5.0 - quality) * (0.08 + (5.0 - quality) * 0.02));
      
      let interval: number;
      if (word.reviewCount === 0) {
        interval = 1;
      } else if (word.reviewCount === 1) {
        interval = 6;
      } else {
        interval = Math.round(word.reviewCount * word.easeFactor);
      }
      
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + interval);
      
      updateWord(word.id, {
        reviewCount: word.reviewCount + 1,
        easeFactor: newEaseFactor,
        nextReviewDate,
        mastered: quality >= 4,
      });
      
      setFlipped(false);
      setReviewIndex((i) => Math.min(i + 1, reviewWords.length - 1));
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-[#E8E4DE]">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold text-[#4A3F35]">生词本</h1>
          </div>
          
          <div className="flex items-center gap-2 bg-[#E8E4DE] rounded-xl p-1">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-4 py-2 rounded-lg transition-colors text-sm',
                viewMode === 'list' ? 'bg-[#D4A574] text-white' : 'text-[#6B5E54]'
              )}
            >
              <BookOpen className="w-4 h-4 inline mr-1" />
              列表
            </button>
            <button
              onClick={() => {
                setViewMode('review');
                setReviewIndex(0);
                setFlipped(false);
              }}
              className={cn(
                'px-4 py-2 rounded-lg transition-colors text-sm',
                viewMode === 'review' ? 'bg-[#D4A574] text-white' : 'text-[#6B5E54]'
              )}
            >
              <RotateCcw className="w-4 h-4 inline mr-1" />
              复习
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container mx-auto px-6 py-8 max-w-3xl">
        {viewMode === 'list' ? (
          <WordListView
            words={words}
            onRemove={removeWord}
            onUpdate={updateWord}
          />
        ) : (
          <ReviewView
            words={reviewWords}
            currentIndex={reviewIndex}
            flipped={flipped}
            onFlip={() => setFlipped(!flipped)}
            onReview={handleReview}
            onExit={() => setViewMode('list')}
          />
        )}
      </main>
    </div>
  );
}

// 列表视图
function WordListView({
  words,
  onRemove,
  onUpdate,
}: {
  words: ReturnType<typeof useVocabularyStore.getState>['words'];
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ReturnType<typeof useVocabularyStore.getState>['words'][0]>) => void;
}) {
  const [sortBy, setSortBy] = useState<'date' | 'progress'>('date');

  const sortedWords = [...words].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.addedDate).getTime() - new Date(a.addedDate).getTime();
    }
    return a.easeFactor - b.easeFactor;
  });

  return (
    <div>
      {/* 统计信息 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="总单词数"
          value={words.length}
          color="bg-[#D4A574]"
        />
        <StatCard
          label="已掌握"
          value={words.filter((w) => w.mastered).length}
          color="bg-[#C8E6C9]"
        />
        <StatCard
          label="待复习"
          value={words.filter((w) => !w.mastered).length}
          color="bg-[#BBDEFB]"
        />
      </div>

      {/* 排序选择 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-[#6B5E54]">排序：</span>
        <button
          onClick={() => setSortBy('date')}
          className={cn(
            'px-3 py-1 rounded-lg text-sm transition-colors',
            sortBy === 'date' ? 'bg-[#D4A574] text-white' : 'bg-[#E8E4DE] text-[#6B5E54]'
          )}
        >
          添加时间
        </button>
        <button
          onClick={() => setSortBy('progress')}
          className={cn(
            'px-3 py-1 rounded-lg text-sm transition-colors',
            sortBy === 'progress' ? 'bg-[#D4A574] text-white' : 'bg-[#E8E4DE] text-[#6B5E54]'
          )}
        >
          掌握程度
        </button>
      </div>

      {/* 单词列表 */}
      <div className="space-y-3">
        {sortedWords.map((word) => (
          <WordCard
            key={word.id}
            word={word}
            onRemove={() => onRemove(word.id)}
            onMarkMastered={() => onUpdate(word.id, { mastered: true })}
          />
        ))}
      </div>
    </div>
  );
}

// 统计卡片
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className={cn('w-8 h-8 rounded-lg mb-2 flex items-center justify-center', color)}>
        <span className="text-white font-bold">{value}</span>
      </div>
      <p className="text-sm text-[#6B5E54]">{label}</p>
    </div>
  );
}

// 单词卡片
function WordCard({
  word,
  onRemove,
  onMarkMastered,
}: {
  word: ReturnType<typeof useVocabularyStore.getState>['words'][0];
  onRemove: () => void;
  onMarkMastered: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-lg text-[#4A3F35]">{word.word}</span>
            {word.phonetic && (
              <span className="text-sm text-[#6B5E54]">{word.phonetic}</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {word.mastered && (
              <span className="bg-[#C8E6C9] text-[#2E7D32] px-2 py-1 rounded text-xs">
                已掌握
              </span>
            )}
            <span className="text-xs text-[#9B8E84]">
              复习 {word.reviewCount} 次
            </span>
          </div>
        </div>
        
        <p className="text-[#4A3F35] mt-1">{word.definition}</p>
      </div>
      
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#E8E4DE] pt-3">
          {word.examples.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-[#6B5E54] mb-1">例句：</p>
              <p className="text-[#4A3F35] bg-[#E8E4DE] rounded-lg p-2">
                {word.examples[0]}
              </p>
            </div>
          )}
          
          {word.sourceBook && (
            <p className="text-sm text-[#9B8E84] mb-3">
              来源: {word.sourceBook}
            </p>
          )}
          
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onMarkMastered}>
              <Check className="w-4 h-4 mr-1" />
              标记已掌握
            </Button>
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="w-4 h-4 mr-1" />
              删除
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// 复习视图
function ReviewView({
  words,
  currentIndex,
  flipped,
  onFlip,
  onReview,
  onExit,
}: {
  words: ReturnType<typeof useVocabularyStore.getState>['words'];
  currentIndex: number;
  flipped: boolean;
  onFlip: () => void;
  onReview: (quality: number) => void;
  onExit: () => void;
}) {
  if (words.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpen className="w-16 h-16 text-[#6B5E54] mx-auto mb-4" />
        <p className="text-[#4A3F35] mb-2">暂无需要复习的单词</p>
        <p className="text-sm text-[#9B8E84]">继续阅读，添加更多生词吧！</p>
      </div>
    );
  }

  const word = words[currentIndex];
  if (!word) {
    return (
      <div className="text-center py-12">
        <Check className="w-16 h-16 text-[#C8E6C9] mx-auto mb-4" />
        <p className="text-[#4A3F35] mb-2">复习完成！</p>
        <Button variant="primary" onClick={onExit}>
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* 进度条 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#6B5E54]">复习进度</span>
          <span className="text-sm text-[#6B5E54]">
            {currentIndex + 1} / {words.length}
          </span>
        </div>
        <div className="h-2 bg-[#E8E4DE] rounded-full">
          <div
            className="h-full bg-[#D4A574] rounded-full transition-all"
            style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
          />
        </div>
      </div>

      {/* 翻转卡片 */}
      <div
        className="relative h-[300px] cursor-pointer perspective-1000"
        onClick={onFlip}
      >
        <div
          className={cn(
            'absolute inset-0 transition-transform duration-500 transform-style-preserve-3d',
            flipped && 'rotate-y-180'
          )}
        >
          {/* 正面 - 单词 */}
          <div
            className={cn(
              'absolute inset-0 backface-hidden',
              'bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center'
            )}
          >
            <span className="text-4xl font-bold text-[#4A3F35] mb-4">{word.word}</span>
            {word.phonetic && (
              <span className="text-lg text-[#6B5E54]">{word.phonetic}</span>
            )}
            <p className="text-sm text-[#9B8E84] mt-4">点击查看释义</p>
          </div>
          
          {/* 背面 - 释义 */}
          <div
            className={cn(
              'absolute inset-0 backface-hidden rotate-y-180',
              'bg-[#D4A574] rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center'
            )}
          >
            <span className="text-2xl font-bold text-white mb-4">{word.word}</span>
            <p className="text-xl text-white mb-4">{word.definition}</p>
            {word.examples.length > 0 && (
              <p className="text-sm text-white/80">{word.examples[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* 评分按钮 */}
      {flipped && (
        <div className="mt-6">
          <p className="text-sm text-[#6B5E54] mb-3 text-center">你记得这个单词吗？</p>
          <div className="flex justify-center gap-2">
            <Button
              variant="secondary"
              onClick={() => onReview(0)}
              className="bg-[#FFCDD2] hover:bg-[#EF9A9A]"
            >
              <X className="w-4 h-4 mr-1" />
              完全忘记
            </Button>
            <Button
              variant="secondary"
              onClick={() => onReview(3)}
            >
              模糊记得
            </Button>
            <Button
              variant="primary"
              onClick={() => onReview(5)}
            >
              <Check className="w-4 h-4 mr-1" />
              清晰记得
            </Button>
          </div>
        </div>
      )}

      {/* 下次复习时间 */}
      <div className="mt-6 text-center">
        <Calendar className="w-4 h-4 inline text-[#6B5E54]" />
        <span className="text-sm text-[#9B8E84] ml-1">
          下次复习: {new Date(word.nextReviewDate).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}