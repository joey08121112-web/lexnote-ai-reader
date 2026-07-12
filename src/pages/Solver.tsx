import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, X, Send, Sparkles, History, Trash2, Clipboard } from 'lucide-react';
import { Button } from '@/components/common/Button';
import Markdown from '@/components/common/Markdown';
import { cn } from '@/lib/utils';
import { solveFromImage, PROMPTS, fileToBase64, type ChatMessage } from '@/lib/aiService';

interface SolverHistory {
  id: string;
  imageBase64: string;
  messages: ChatMessage[];
  timestamp: number;
}

const HISTORY_KEY = 'lexnote-solver-history';

function loadHistory(): SolverHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(items: SolverHistory[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export default function Solver() {
  const navigate = useNavigate();

  const [imageBase64, setImageBase64] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [history, setHistory] = useState<SolverHistory[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // 处理粘贴
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          fileToBase64(file).then((base64) => {
            setImageBase64(base64);
            setMessages([]);
            setError('');
          });
          e.preventDefault();
          break;
        }
      }
    }
  }, []);

  // 处理文件选择
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    const base64 = await fileToBase64(file);
    setImageBase64(base64);
    setMessages([]);
    setError('');
  }, []);

  // 发送给 AI
  const handleSolve = useCallback(async (promptText: string) => {
    if (!imageBase64) {
      setError('请先上传或粘贴一张题目截图');
      return;
    }

    setLoading(true);
    setError('');

    const userMsg: ChatMessage = { role: 'user', content: promptText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    try {
      const result = await solveFromImage(imageBase64, promptText, messages);
      const assistantMsg: ChatMessage = { role: 'assistant', content: result };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);

      // 保存到历史（仅第一次问答时创建新记录）
      if (messages.length === 0) {
        const newHistory: SolverHistory = {
          id: `solver-${Date.now()}`,
          imageBase64,
          messages: finalMessages,
          timestamp: Date.now(),
        };
        const updated = [newHistory, ...history].slice(0, 50);
        setHistory(updated);
        saveHistory(updated);
      } else {
        // 更新当前历史记录
        const updated = history.map((h) =>
          h.imageBase64 === imageBase64
            ? { ...h, messages: finalMessages }
            : h,
        );
        setHistory(updated);
        saveHistory(updated);
      }
    } catch (e) {
      setError((e as Error).message);
      // 移除刚添加的 user 消息
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [imageBase64, messages, history]);

  // 追加提问
  const handleFollowUp = useCallback(async () => {
    if (!followUp.trim() || loading) return;

    setLoading(true);
    setError('');

    const userMsg: ChatMessage = { role: 'user', content: followUp };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setFollowUp('');

    try {
      const result = await solveFromImage(imageBase64, followUp, messages);
      const assistantMsg: ChatMessage = { role: 'assistant', content: result };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);

      // 更新历史
      const updated = history.map((h) =>
        h.imageBase64 === imageBase64
          ? { ...h, messages: finalMessages }
          : h,
      );
      setHistory(updated);
      saveHistory(updated);
    } catch (e) {
      setError((e as Error).message);
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [followUp, loading, messages, imageBase64, history]);

  // 加载历史记录
  const handleLoadHistory = useCallback((item: SolverHistory) => {
    setImageBase64(item.imageBase64);
    setMessages(item.messages);
    setShowHistory(false);
    setError('');
  }, []);

  // 删除历史记录
  const handleDeleteHistory = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
  }, [history]);

  // 清除当前图片
  const handleClearImage = useCallback(() => {
    setImageBase64('');
    setMessages([]);
    setError('');
  }, []);

  return (
    <div
      className="min-h-screen bg-[#FAF8F5]"
      onPaste={handlePaste}
      tabIndex={0}
      ref={pasteAreaRef}
    >
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-[#E8E4DE]">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[#D4A574]" />
              <h1 className="text-lg font-semibold text-[#4A3F35]">AI 解题</h1>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            历史记录 ({history.length})
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-4xl">
        {/* 历史记录侧栏 */}
        {showHistory && (
          <div className="mb-6 bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[#4A3F35]">历史记录</h2>
              <button onClick={() => setShowHistory(false)}>
                <X className="w-4 h-4 text-[#9B8E84]" />
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-[#9B8E84] py-4 text-center">暂无历史记录</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleLoadHistory(item)}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#FAF8F5] cursor-pointer group"
                  >
                    <img
                      src={item.imageBase64}
                      alt="缩略图"
                      className="w-12 h-12 object-cover rounded-lg border border-[#E8E4DE]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#4A3F35] truncate">
                        {item.messages[0]?.content || '无'}
                      </p>
                      <p className="text-xs text-[#9B8E84]">
                        {new Date(item.timestamp).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteHistory(item.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-[#E85D75]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 截图输入区 */}
        {!imageBase64 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={async (e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith('image/')) {
                const base64 = await fileToBase64(file);
                setImageBase64(base64);
              }
            }}
            className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-[#E8E4DE] p-12 text-center cursor-pointer hover:border-[#D4A574] transition-colors"
          >
            <Upload className="w-12 h-12 text-[#D4A574] mx-auto mb-4" />
            <p className="text-lg font-medium text-[#4A3F35] mb-2">
              上传题目截图
            </p>
            <p className="text-sm text-[#9B8E84] mb-4">
              点击选择图片 · 拖拽图片到这里 · 或直接粘贴截图 (Cmd+V)
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-[#9B8E84]">
              <Clipboard className="w-3 h-3" />
              <span>iPad 截图后直接在此页面粘贴</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          <>
            {/* 图片预览 + 对话区 */}
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
              {/* 左侧：图片预览 */}
              <div className="space-y-3">
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="relative">
                    <img
                      src={imageBase64}
                      alt="题目截图"
                      className="w-full"
                    />
                    <button
                      onClick={handleClearImage}
                      className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 快捷按钮 */}
                {messages.length === 0 && (
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() => handleSolve(PROMPTS.solve)}
                      disabled={loading}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      帮我讲解这道题
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleSolve(PROMPTS.answerOnly)}
                        disabled={loading}
                      >
                        只给答案
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleSolve(PROMPTS.explain)}
                        disabled={loading}
                      >
                        讲解知识点
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 右侧：对话区 */}
              <div className="bg-white rounded-2xl shadow-sm flex flex-col min-h-[500px]">
                {/* 消息列表 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 && !loading && (
                    <div className="text-center py-12">
                      <Sparkles className="w-10 h-10 text-[#D4A574] mx-auto mb-3" />
                      <p className="text-[#9B8E84]">
                        点击"帮我讲解这道题"开始
                      </p>
                    </div>
                  )}

                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex',
                        msg.role === 'user' ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] rounded-2xl px-4 py-3',
                          msg.role === 'user'
                            ? 'bg-[#D4A574] text-white'
                            : 'bg-[#FAF8F5] text-[#4A3F35]',
                        )}
                      >
                        {msg.role === 'user' ? (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        ) : (
                          <Markdown content={msg.content} />
                        )}
                      </div>
                    </div>
                  ))}

                  {loading && (
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

                  {error && (
                    <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3">
                      <p className="text-sm text-[#E85D75]">{error}</p>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* 追加提问输入框 */}
                {messages.length > 0 && (
                  <div className="border-t border-[#E8E4DE] p-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleFollowUp();
                          }
                        }}
                        placeholder="追问：比如 第二步为什么用这个公式？"
                        disabled={loading}
                        className="flex-1 px-4 py-2 rounded-xl border border-[#E8E4DE] bg-white text-[#4A3F35] focus:outline-none focus:border-[#D4A574] text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleFollowUp}
                        disabled={loading || !followUp.trim()}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
