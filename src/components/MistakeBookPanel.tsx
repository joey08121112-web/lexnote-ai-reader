import { useState, useMemo } from 'react';
import { BookMarked, MapPin, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useMistakeStore, type MistakeType, type MistakeItem } from '@/stores/mistakeStore';
import { useVocabularyStore } from '@/stores/vocabularyStore';
import { cn } from '@/lib/utils';

interface MistakeBookPanelProps {
  bookId: string;
  bookTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onLocate: (pageNumber: number) => void;
}

type TabType = MistakeType;

const TABS: { value: TabType; label: string }[] = [
  { value: 'word', label: '生词本' },
  { value: 'sentence', label: '句子' },
  { value: 'math', label: '数学题' },
];

export default function MistakeBookPanel({
  bookId,
  bookTitle,
  isOpen,
  onClose,
  onLocate,
}: MistakeBookPanelProps) {
  const [tab, setTab] = useState<TabType>('word');
  const { mistakes, removeMistake } = useMistakeStore();
  const { words: vocabularyWords, removeWord } = useVocabularyStore();

  // 生词 tab：只从 mistakeStore 获取（addWord 时会同步 addMistake，无需再合并 vocabularyStore 避免重复）
  const wordItems = useMemo(() => {
    return mistakes
      .filter((m) => m.bookId === bookId && m.type === 'word')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [mistakes, bookId]);

  const sentenceItems = useMemo(
    () =>
      mistakes
        .filter((m) => m.bookId === bookId && m.type === 'sentence')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [mistakes, bookId],
  );

  const mathItems = useMemo(
    () =>
      mistakes
        .filter((m) => m.bookId === bookId && m.type === 'math')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [mistakes, bookId],
  );

  const currentList = tab === 'word' ? wordItems : tab === 'sentence' ? sentenceItems : mathItems;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="错题本"
      className="max-w-2xl max-h-[80vh]"
    >
      {/* Tab 栏 */}
      <div className="flex items-center gap-1 bg-black/5 rounded-full p-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'flex-1 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
              tab === t.value
                ? 'bg-white text-[#4A3F35] shadow-sm'
                : 'text-[#6B5E54] hover:text-[#4A3F35]',
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-60">
              {t.value === 'word'
                ? wordItems.length
                : t.value === 'sentence'
                  ? sentenceItems.length
                  : mathItems.length}
            </span>
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="overflow-y-auto max-h-[55vh] -mx-2 px-2">
        {currentList.length === 0 ? (
          <div className="text-center py-16 text-[#9B8E84]">
            <BookMarked className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">暂无内容</p>
            <p className="text-xs mt-1">
              {tab === 'word'
                ? '在阅读时点单词查翻译并加入生词本后会显示在这里'
                : tab === 'sentence'
                  ? '选中句子后用 AI 解答并加入错题本后会显示在这里'
                  : '在笔记模式框选数学题用 AI 解答后加入错题本'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {currentList.map((item) => (
              <MistakeCard
                key={item.id}
                item={item}
                onLocate={() => {
                  onLocate(item.pageNumber);
                  onClose();
                }}
                onRemove={() => {
                  removeMistake(item.id);
                  // 删除生词时同步从 vocabularyStore 删除对应单词
                  if (item.type === 'word') {
                    const lowerContent = item.content.toLowerCase().trim();
                    const vocabWord = vocabularyWords.find(
                      w => w.word.toLowerCase().trim() === lowerContent
                    );
                    if (vocabWord) {
                      removeWord(vocabWord.id);
                    }
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MistakeCard({
  item,
  onLocate,
  onRemove,
}: {
  item: MistakeItem;
  onLocate: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAnswer = !!item.answer;

  return (
    <div className="bg-white rounded-xl border border-[#E8E4DE] p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#4A3F35] break-words">{item.content}</p>
          {hasAnswer && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1 text-xs text-[#8B6F47] hover:text-[#D4A574] transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {expanded ? '收起答案' : '查看答案'}
            </button>
          )}
          {expanded && hasAnswer && (
            <p className="text-xs text-[#6B5E54] mt-1.5 leading-relaxed bg-[#FAF8F5] rounded-lg p-2">
              {item.answer}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onLocate}
            title="定位到原文"
            className="p-1.5 rounded-lg hover:bg-[#D4A574]/10 text-[#8B6F47] hover:text-[#D4A574] transition-colors"
          >
            <MapPin className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            title="删除"
            className="p-1.5 rounded-lg hover:bg-[#E85D75]/10 text-[#9B8E84] hover:text-[#E85D75] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[#9B8E84] mt-1">第 {item.pageNumber} 页</p>
    </div>
  );
}
