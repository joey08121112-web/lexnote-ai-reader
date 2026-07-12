import { useState, useRef, useCallback } from 'react';
import { FileText, Send, X, Loader2, BookOpen, Sparkles, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/common/Button';
import Markdown from '@/components/common/Markdown';
import { askFromText, PROMPTS, type ChatMessage } from '@/lib/aiService';
import { useVocabularyStore } from '@/stores/vocabularyStore';
import type { VocabularyWord } from '@/types/vocabulary';

interface AIDocumentPanelProps {
  /** 全书文本（懒加载完成后由 Reader 传入） */
  documentText: string;
  /** 书名，显示在头部副标题 */
  bookTitle: string;
  /** 全文提取中（首次打开时） */
  loading?: boolean;
  onClose: () => void;
}

interface ExtractedWord {
  word: string;
  definition: string;
  phonetic?: string;
}

/**
 * 从 AI 返回的文本中解析生词列表
 * 优先 JSON.parse；失败则用正则提取
 */
function parseExtractedWords(raw: string): ExtractedWord[] {
  // 清洗 markdown 代码块包裹
  const cleaned = raw
    .replace(/```json\s*\n?/g, '')
    .replace(/```\s*\n?/g, '')
    .trim();

  // 1. 尝试 JSON 解析
  try {
    const arr = JSON.parse(cleaned);
    if (Array.isArray(arr)) {
      return arr
        .filter((it) => it && typeof it.word === 'string')
        .map((it) => ({
          word: String(it.word).trim(),
          definition: String(it.definition ?? '').trim(),
          phonetic: it.phonetic ? String(it.phonetic).trim() : undefined,
        }))
        .filter((it) => it.word);
    }
  } catch {
    // 继续 fallback
  }

  // 2. 正则提取 {"word": "...", "definition": "..."}
  const results: ExtractedWord[] = [];
  const re = /"word"\s*:\s*"([^"]+)"[^}]*?"definition"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    results.push({ word: m[1].trim(), definition: m[2].trim() });
  }
  return results;
}

export default function AIDocumentPanel({
  documentText,
  bookTitle,
  loading = false,
  onClose,
}: AIDocumentPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [extractingWords, setExtractingWords] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const followUpInputRef = useRef<HTMLInputElement | null>(null);

  const { addWord, words: existingWords } = useVocabularyStore();

  // 截断文档文本以避免 token 超限（保留前 12000 字符）
  const truncatedDoc = documentText.slice(0, 12000);

  // ==== 文档问答：发送用户输入 ====
  const handleAsk = useCallback(async (promptText: string) => {
    setError('');

    if (!documentText || documentText === '[提取失败，请重试]') {
      setError('文档文本不可用，请关闭后重新打开');
      return;
    }

    setAiLoading(true);

    const userMsg: ChatMessage = { role: 'user', content: promptText };
    const prevMessages = messagesRef.current;
    const newMessages = [...prevMessages, userMsg];
    setMessages(newMessages);

    try {
      const result = await askFromText(truncatedDoc, promptText, prevMessages);
      const assistantMsg: ChatMessage = { role: 'assistant', content: result };
      setMessages([...newMessages, assistantMsg]);
    } catch (e) {
      setError((e as Error).message);
      setMessages(prevMessages);
    } finally {
      setAiLoading(false);
    }
  }, [documentText, truncatedDoc]);

  // ==== 总结全文 ====
  const handleSummarize = useCallback(async () => {
    if (!truncatedDoc) {
      setError('文档文本不可用');
      return;
    }
    setAiLoading(true);
    setError('');
    const userMsg: ChatMessage = { role: 'user', content: '总结全文' };
    const prevMessages = messagesRef.current;
    const newMessages = [...prevMessages, userMsg];
    setMessages(newMessages);
    try {
      const result = await askFromText(truncatedDoc, PROMPTS.summarize);
      setMessages([...newMessages, { role: 'assistant', content: result }]);
    } catch (e) {
      setError((e as Error).message);
      setMessages(prevMessages);
    } finally {
      setAiLoading(false);
    }
  }, [truncatedDoc]);

  // ==== 提取生词（批量加入生词本） ====
  const handleExtractWords = useCallback(async () => {
    if (!truncatedDoc) {
      setError('文档文本不可用');
      return;
    }
    setExtractingWords(true);
    setError('');

    const userMsg: ChatMessage = { role: 'user', content: '提取生词' };
    const prevMessages = messagesRef.current;
    const newMessages = [...prevMessages, userMsg];
    setMessages(newMessages);

    try {
      const result = await askFromText(truncatedDoc, PROMPTS.extractWords);
      const words = parseExtractedWords(result);

      let added = 0;
      let duplicate = 0;
      const addedList: string[] = [];

      for (const w of words) {
        const lower = w.word.toLowerCase();
        if (existingWords.some((ew) => ew.word.toLowerCase() === lower)) {
          duplicate++;
          continue;
        }
        const newWord: VocabularyWord = {
          id: `vocab-${Date.now()}-${added}`,
          word: w.word,
          definition: w.definition || '(无释义)',
          phonetic: w.phonetic,
          examples: [],
          addedDate: new Date(),
          reviewCount: 0,
          nextReviewDate: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            return d;
          })(),
          easeFactor: 2.5,
          mastered: false,
          sourceBook: bookTitle,
        };
        addWord(newWord);
        added++;
        addedList.push(w.word);
      }

      const summary = words.length === 0
        ? `AI 返回内容无法解析，原文如下：\n\n${result}`
        : `已加入 ${added} 个生词${duplicate > 0 ? `，已存在 ${duplicate} 个` : ''}\n\n${addedList.length > 0 ? '新加入：' + addedList.join(', ') : ''}`;

      setMessages([
        ...newMessages,
        { role: 'assistant', content: summary },
      ]);
    } catch (e) {
      setError((e as Error).message);
      setMessages(prevMessages);
    } finally {
      setExtractingWords(false);
    }
  }, [truncatedDoc, existingWords, addWord, bookTitle]);

  // ==== 追问 ====
  const handleFollowUp = useCallback(async () => {
    if (!followUp.trim() || aiLoading || extractingWords) return;
    setFollowUp('');
    await handleAsk(`${PROMPTS.documentQA}${followUp.trim()}`);
  }, [followUp, aiLoading, extractingWords, handleAsk]);

  const isLoading = aiLoading || extractingWords;

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-[#E8E4DE]">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DE] bg-[#FAF8F5]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-5 h-5 text-[#D4A574] flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="font-semibold text-[#4A3F35] text-sm">AI 文档助手</h2>
            <p className="text-xs text-[#9B8E84] truncate max-w-[260px]" title={bookTitle}>
              {bookTitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                setError('');
              }}
              className="text-xs text-[#9B8E84] hover:text-[#4A3F35] px-2 py-1"
            >
              清空
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#E8E4DE]"
          >
            <X className="w-4 h-4 text-[#6B5E54]" />
          </button>
        </div>
      </div>

      {/* 对话内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* 全文提取中 */}
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-[#D4A574] mx-auto mb-3 animate-spin" />
            <p className="text-sm text-[#6B5E54]">正在提取全文内容...</p>
            <p className="text-xs text-[#9B8E84] mt-1">PDF 大文件可能需要数秒</p>
          </div>
        )}

        {/* 空状态：预设按钮 */}
        {!loading && messages.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-[#D4A574] mx-auto mb-3" />
            <p className="text-[#9B8E84] mb-4 text-sm">
              基于全书内容回答问题
            </p>
            <div className="space-y-2">
              <Button className="w-full" onClick={handleSummarize}>
                <BookOpen className="w-4 h-4 mr-2" />
                总结全文
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => followUpInputRef.current?.focus()}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                问文档
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleExtractWords}
              >
                <Plus className="w-4 h-4 mr-2" />
                提取生词（自动加入生词本）
              </Button>
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[90%] rounded-2xl px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-[#D4A574] text-white'
                  : 'bg-[#FAF8F5] text-[#4A3F35]'
              )}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              ) : (
                <Markdown content={msg.content} />
              )}
            </div>
          </div>
        ))}

        {/* AI 思考中 */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#FAF8F5] rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[#D4A574] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-[#D4A574] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-[#D4A574] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3 py-2">
            <p className="text-sm text-[#E85D75]">{error}</p>
          </div>
        )}
      </div>

      {/* 追问输入栏 */}
      <div className="border-t border-[#E8E4DE] p-3">
        <div className="flex gap-2">
          <input
            ref={followUpInputRef}
            type="text"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleFollowUp();
              }
            }}
            placeholder="问文档相关问题..."
            disabled={isLoading || loading}
            className="flex-1 px-3 py-2 rounded-xl border border-[#E8E4DE] bg-white text-[#4A3F35] focus:outline-none focus:border-[#D4A574] text-sm disabled:opacity-60"
          />
          <Button
            size="sm"
            onClick={handleFollowUp}
            disabled={isLoading || loading || !followUp.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
