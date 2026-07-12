import { useState, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { Tldraw, createTLStore, type Editor } from 'tldraw';
import { Search, X, Loader2 } from 'lucide-react';
import { searchHandwrittenText, type SearchResult } from '@/lib/handwritingSearch';
import 'tldraw/tldraw.css';

interface HandwritingSearchPanelProps {
  bookId: string;
  totalPages: number;
  onJumpToPage: (page: number) => void;
  onClose: () => void;
}

/** 关键词高亮：把 snippet 里匹配 query 的部分用 <mark> 包裹 */
function highlightKeyword(text: string, query: string): ReactNode {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#FFEB99] text-[#4A3F35] px-0.5 rounded">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function HandwritingSearchPanel({
  bookId,
  totalPages,
  onJumpToPage,
  onClose,
}: HandwritingSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const tempEditorRef = useRef<Editor | null>(null);
  // 临时 store：搜索时 loadSnapshot 切换页内容，复用避免反复挂载 Tldraw
  const tempStore = useMemo(
    () => createTLStore({ defaultName: 'lexnote-ocr-tmp' }),
    [],
  );

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    if (!tempEditorRef.current) {
      setError('笔记引擎正在初始化，请稍后再试');
      return;
    }
    setLoading(true);
    setError('');
    setProgress(0);
    setResults([]);
    try {
      const res = await searchHandwrittenText(
        tempEditorRef.current,
        bookId,
        totalPages,
        q,
        (p) => setProgress(p),
      );
      setResults(res);
      setHasSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, bookId, totalPages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) handleSearch();
  };

  return (
    <>
      {/* 离屏临时 Tldraw（OCR 时加载各页 snapshot 渲染笔记图像）
          opacity:0 + pointerEvents:none + 离屏定位，不占布局也不可见 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: -99999,
          top: 0,
          width: 800,
          height: 1100,
          opacity: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <Tldraw
          store={tempStore}
          onMount={(ed) => {
            tempEditorRef.current = ed;
          }}
        />
      </div>

      <div className="fixed left-0 top-0 bottom-0 w-80 bg-white shadow-2xl z-40 flex flex-col border-r border-[#E8E4DE]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DE]">
          <h2 className="text-sm font-semibold text-[#4A3F35]">手写搜索</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#E8E4DE] text-[#6B5E54]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="p-3 border-b border-[#E8E4DE]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入关键词搜索手写笔记"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#E8E4DE] focus:outline-none focus:border-[#D4A574] bg-[#FAF8F5]"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#D4A574] text-white text-sm font-medium hover:bg-[#C4956A] disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </button>
          </div>
          {/* 进度条 */}
          {loading && (
            <div className="mt-2">
              <div className="h-1.5 bg-[#E8E4DE] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#D4A574] transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-[#9B8E84] mt-1">
                正在扫描... {Math.round(progress * 100)}%（首次需联网下载模型，约 30 秒）
              </p>
            </div>
          )}
          {error && (
            <p className="text-[10px] text-[#E85D75] mt-2">{error}</p>
          )}
        </div>

        {/* 结果列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!hasSearched && !loading && (
            <p className="text-center text-[#9B8E84] text-xs py-8">
              输入关键词搜索全书手写笔记
            </p>
          )}
          {hasSearched && results.length === 0 && !loading && (
            <p className="text-center text-[#9B8E84] text-xs py-8">
              未找到匹配结果
            </p>
          )}
          {results.map((r) => (
            <button
              key={r.page}
              onClick={() => onJumpToPage(r.page)}
              className="w-full text-left p-2.5 rounded-lg border border-[#E8E4DE] hover:border-[#D4A574] hover:bg-[#FAF8F5] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-[#D4A574]">
                  第 {r.page} 页
                </span>
              </div>
              <p className="text-xs text-[#4A3F35] line-clamp-2 break-all">
                {highlightKeyword(r.snippet, query)}
              </p>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
