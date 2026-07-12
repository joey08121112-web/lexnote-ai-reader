import { useEffect, useState } from 'react';
import { X, Trash2, Highlighter, Loader2 } from 'lucide-react';
import { getHighlightsByBook, deleteHighlight, type PersistedHighlight } from '@/lib/storage';
import { cn } from '@/lib/utils';

interface HighlightManagerPanelProps {
  bookId: string;
  currentPage: number;
  /** 高亮版本号，外部增删高亮后递增以触发刷新 */
  highlightsVersion: number;
  onJumpToPage: (page: number) => void;
  onClose: () => void;
}

const COLOR_HEX: Record<string, string> = {
  yellow: '#FFEB99',
  green: '#C8E6C9',
  blue: '#BBDEFB',
  pink: '#F8BBD9',
};

const SOURCE_LABEL: Record<string, string> = {
  'word-lookup': '查词',
  'word-added': '生词',
  'manual-select': '手动',
};

export default function HighlightManagerPanel({
  bookId,
  currentPage,
  highlightsVersion,
  onJumpToPage,
  onClose,
}: HighlightManagerPanelProps) {
  const [highlights, setHighlights] = useState<PersistedHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHighlightsByBook(bookId)
      .then((list) => {
        if (!cancelled) setHighlights(list);
      })
      .catch((e) => console.warn('[HighlightManager] load failed:', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, highlightsVersion]);

  const handleDelete = async (h: PersistedHighlight) => {
    setDeletingId(h.id);
    try {
      await deleteHighlight(bookId, h.pageNumber, h.id);
      setHighlights((prev) => prev.filter((x) => x.id !== h.id));
    } catch (e) {
      console.warn('[HighlightManager] delete failed:', e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 bg-white shadow-2xl z-40 flex flex-col border-l border-[#E8E4DE]">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DE]">
        <div className="flex items-center gap-2">
          <Highlighter className="w-4 h-4 text-[#D4A574]" />
          <h2 className="text-sm font-semibold text-[#4A3F35]">高亮管理</h2>
          <span className="text-xs text-[#9B8E84]">{highlights.length}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#E8E4DE] text-[#6B5E54]">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-[#9B8E84] animate-spin" />
          </div>
        ) : highlights.length === 0 ? (
          <div className="text-center py-10">
            <Highlighter className="w-8 h-8 text-[#9B8E84] mx-auto mb-2 opacity-40" />
            <p className="text-sm text-[#9B8E84]">暂无高亮</p>
            <p className="text-xs text-[#9B8E84] mt-1">在阅读模式点击单词或选区高亮后会出现在这里</p>
          </div>
        ) : (
          highlights.map((h) => (
            <div
              key={h.id}
              className={cn(
                'group rounded-lg border p-2.5 transition-all cursor-pointer',
                h.pageNumber === currentPage
                  ? 'border-[#D4A574] bg-[#D4A574]/5'
                  : 'border-[#E8E4DE] hover:border-[#D4A574]/40 hover:bg-[#FAF8F5]',
              )}
              onClick={() => onJumpToPage(h.pageNumber)}
            >
              <div className="flex items-start gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 mt-1 border border-black/5"
                  style={{ backgroundColor: COLOR_HEX[h.color] || '#FFEB99' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#4A3F35] line-clamp-2 break-words">{h.text}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-[#9B8E84]">第 {h.pageNumber} 页</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full',
                        h.source === 'word-added' && 'bg-[#C8E6C9]/60 text-[#2E7D32]',
                        h.source === 'word-lookup' && 'bg-[#FFEB99]/60 text-[#8B6F47]',
                        h.source === 'manual-select' && 'bg-[#BBDEFB]/60 text-[#1565C0]',
                      )}
                    >
                      {SOURCE_LABEL[h.source] || h.source}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (deletingId === null) handleDelete(h);
                  }}
                  disabled={deletingId === h.id}
                  title="删除高亮"
                  className="p-1 rounded text-[#9B8E84] hover:text-[#E85D75] hover:bg-[#FCE8EC] opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                >
                  {deletingId === h.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
