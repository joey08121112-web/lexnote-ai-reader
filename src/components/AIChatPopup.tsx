import { useRef, useEffect, useState } from 'react';
import { Sparkles, X, Send, MessageCircle, Loader2, BookMarked, Clock } from 'lucide-react';
import Markdown from '@/components/common/Markdown';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/aiService';

interface AIChatPopupProps {
  x: number;
  y: number;
  messages: ChatMessage[];
  loading: boolean;
  error: string;
  followUp: string;
  pendingImage?: string | null;
  onFollowUpChange: (val: string) => void;
  onSend: () => void;
  onClose: () => void;
  onQuickAction?: (prompt: string) => void;
  onAddToMistake?: (answer: string) => void;
}

const QUICK_ACTIONS = [
  { label: '📝 翻译', prompt: '将图中的文字翻译成中文，只输出译文，不要添加任何解释或额外文字。' },
  { label: '✏️ 解题', prompt: '请仔细看这道题，给出详细的解题步骤和最终答案。' },
  { label: '💡 解释', prompt: '请解释这段内容的含义，用简洁的中文说明。' },
];

export default function AIChatPopup({
  x,
  y,
  messages,
  loading,
  error,
  followUp,
  pendingImage,
  onFollowUpChange,
  onSend,
  onClose,
  onQuickAction,
  onAddToMistake,
}: AIChatPopupProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      setShowSlowHint(false);
      return;
    }
    setShowSlowHint(false);
    const timer = setTimeout(() => setShowSlowHint(true), 20000);
    return () => clearTimeout(timer);
  }, [loading]);

  const POPUP_WIDTH = 380;
  const POPUP_MAX_HEIGHT = Math.min(window.innerHeight * 0.6, 520);

  let posX = x;
  let posY = y;

  if (posX + POPUP_WIDTH > window.innerWidth - 10) {
    posX = window.innerWidth - POPUP_WIDTH - 10;
  }
  if (posX < 10) posX = 10;
  if (posY + POPUP_MAX_HEIGHT > window.innerHeight - 10) {
    posY = window.innerHeight - POPUP_MAX_HEIGHT - 10;
  }
  if (posY < 70) posY = 70;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div
      className="fixed z-50 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/60 flex flex-col overflow-hidden"
      style={{
        left: posX,
        top: posY,
        width: POPUP_WIDTH,
        maxHeight: POPUP_MAX_HEIGHT,
        boxShadow: '0 8px 32px rgba(74,63,53,0.15), 0 2px 8px rgba(74,63,53,0.08)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DE]/60 bg-gradient-to-r from-[#FAF8F5]/80 to-white/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#D4A574] to-[#C49464] flex items-center justify-center shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-[#4A3F35] text-sm">AI 助手</h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#F0EBE4] transition-colors"
        >
          <X className="w-4 h-4 text-[#6B5E54]" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && !loading && !error && (
          <div className="p-4 text-center">
            {pendingImage ? (
              <>
                <div className="mb-3">
                  <img
                    src={pendingImage}
                    alt="选中区域"
                    className="rounded-lg border border-[#E8E4DE] max-h-[200px] w-auto object-contain mx-auto shadow-sm"
                  />
                </div>
                {onQuickAction && (
                  <div className="flex flex-wrap gap-1.5 justify-center mb-2">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => onQuickAction(action.prompt)}
                        className="px-3 py-1.5 rounded-full bg-[#F5F2ED] hover:bg-[#D4A574]/20 text-[#6B5E54] hover:text-[#4A3F35] text-xs font-medium transition-colors border border-[#E8E4DE]"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[#9B8E84] text-xs mt-1">点击快捷按钮或在下方输入你的问题</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4A574] to-[#C49464] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#D4A574]/20">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <p className="text-[#9B8E84] text-sm">请输入你的问题...</p>
              </>
            )}
          </div>
        )}

        <div className="px-3 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              <div className={cn(
                'flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5',
                msg.role === 'user' ? 'bg-[#6B9FD4]' : 'bg-gradient-to-br from-[#D4A574] to-[#C49464]'
              )}>
                {msg.role === 'user' ? (
                  <MessageCircle className="w-3 h-3 text-white" />
                ) : (
                  <Sparkles className="w-3 h-3 text-white" />
                )}
              </div>
              <div className={cn('flex flex-col max-w-[82%]', msg.role === 'user' ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-[#6B9FD4] text-white rounded-tr-sm'
                      : 'bg-[#F5F2ED] text-[#4A3F35] rounded-tl-sm'
                  )}
                >
                  {msg.role === 'user' ? (
                    <div className="space-y-2">
                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="选中区域"
                          className="rounded-lg border border-white/30 max-h-[160px] w-auto object-contain"
                        />
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <Markdown content={msg.content} />
                  )}
                </div>
                {msg.role === 'assistant' && i > 0 && onAddToMistake && (
                  <button
                    onClick={() => onAddToMistake(msg.content)}
                    className="mt-1 text-[10px] text-[#8B6F47] hover:text-[#D4A574] transition-colors flex items-center gap-0.5 opacity-60 hover:opacity-100"
                  >
                    <BookMarked className="w-2.5 h-2.5" />
                    加入错题本
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-[#D4A574] to-[#C49464] flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div className="bg-[#F5F2ED] rounded-xl rounded-tl-sm px-3 py-2">
                <Loader2 className="w-4 h-4 text-[#9B8E84] animate-spin" />
              </div>
            </div>
          )}

          {showSlowHint && loading && (
            <div className="flex gap-2 items-center text-[11px] text-[#9B8E84] px-1">
              <Clock className="w-3 h-3" />
              <span>AI 正在思考中，请稍候...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2.5 border-t border-[#E8E4DE]/60 bg-white/60">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={followUp}
            onChange={(e) => onFollowUpChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={messages.length === 0 ? "输入你的问题，例如：帮我解答这道题" : "继续追问..."}
            disabled={loading}
            className="flex-1 bg-[#F5F2ED] rounded-xl px-3 py-2 text-sm text-[#4A3F35] placeholder:text-[#B5A99D] outline-none border border-transparent focus:border-[#D4A574]/40 focus:bg-white transition-colors disabled:opacity-50"
          />
          <button
            onClick={onSend}
            disabled={loading || !followUp.trim()}
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#D4A574] to-[#C49464] flex items-center justify-center text-white shadow-sm hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
