import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2, X, Clock, ChevronDown, ChevronRight, Copy, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/common/Button';
import {
  AudioRecorder,
  AudioPlayer,
  type AudioNote,
  type StrokeTimestamp,
  findStrokesAtTime,
  findStrokeTime,
} from '@/lib/audioNotes';
import {
  loadAudioNotes,
  saveAudioNote,
  deleteAudioNote,
  revokeAudioNoteUrl,
} from '@/lib/audioStorage';
import type { Editor } from 'tldraw';

interface AudioNotePanelProps {
  bookId: string;
  pageNumber: number;
  editor: Editor | null;
  onClose: () => void;
  /** 录音状态变化通知父组件（用于在工具栏显示红色指示等） */
  onRecordingChange?: (recording: boolean) => void;
  /** 录音器实例就绪时回调（父组件用它接收 stroke 时间戳） */
  onRecorderReady?: (recorder: AudioRecorder | null) => void;
}

/** 时间格式化（毫秒 → mm:ss） */
function fmtTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function AudioNotePanel({
  bookId,
  pageNumber,
  editor,
  onClose,
  onRecordingChange,
  onRecorderReady,
}: AudioNotePanelProps) {
  const [notes, setNotes] = useState<AudioNote[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playTime, setPlayTime] = useState(0);
  const [playDuration, setPlayDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  // D4.3 转录显示
  const [liveTranscript, setLiveTranscript] = useState('');
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRecordingChangeRef = useRef(onRecordingChange);
  onRecordingChangeRef.current = onRecordingChange;
  const onRecorderReadyRef = useRef(onRecorderReady);
  onRecorderReadyRef.current = onRecorderReady;

  // 加载该页的录音列表
  const refreshNotes = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadAudioNotes(bookId, pageNumber);
      // 释放旧的 URL
      setNotes((prev) => {
        prev.forEach(revokeAudioNoteUrl);
        return list;
      });
    } catch (e) {
      console.warn('[AudioNotePanel] load notes failed:', e);
    } finally {
      setLoading(false);
    }
  }, [bookId, pageNumber]);

  useEffect(() => {
    refreshNotes();
    return () => {
      // 卸载时清理
      if (recorderRef.current?.isRecording) {
        recorderRef.current.cancel();
      }
      playerRef.current?.destroy();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      setNotes((prev) => {
        prev.forEach(revokeAudioNoteUrl);
        return [];
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, pageNumber]);

  // 开始录音
  const handleStartRecord = useCallback(async () => {
    if (playingId) handleStopPlay();
    try {
      const r = new AudioRecorder();
      await r.start();
      recorderRef.current = r;
      onRecorderReadyRef.current?.(r);  // 通知父组件，用于 stroke 时间戳记录
      setRecording(true);
      onRecordingChangeRef.current?.(true);
      setRecordElapsed(0);
      setLiveTranscript('');
      recordTimerRef.current = setInterval(() => {
        setRecordElapsed(Date.now() - (r as any).startTime);
        // D4.3 实时拉取转录文本
        setLiveTranscript(r.getLiveTranscript());
      }, 500);
    } catch (e) {
      alert('录音启动失败：' + (e as Error).message);
    }
  }, [playingId]);

  // 停止录音并保存
  const handleStopRecord = useCallback(async () => {
    if (!recorderRef.current) return;
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    try {
      const note = await recorderRef.current.stop();
      if (note) {
        note.bookId = bookId;
        note.pageNumber = pageNumber;
        await saveAudioNote(note);
        // 加到列表顶部（内存 URL 已存在，不需要重新加载）
        setNotes((prev) => [{ ...note, blobUrl: note.blobUrl }, ...prev]);
      }
    } catch (e) {
      console.warn('[AudioNotePanel] save note failed:', e);
      alert('保存录音失败：' + (e as Error).message);
    } finally {
      recorderRef.current = null;
      onRecorderReadyRef.current?.(null);  // 通知父组件清理
      setRecording(false);
      onRecordingChangeRef.current?.(false);
      setLiveTranscript('');
    }
  }, [bookId, pageNumber]);

  // 播放某条录音
  const handlePlay = useCallback(
    (note: AudioNote) => {
      // 停止录音（如果在录音）
      if (recording) handleStopRecord();

      // 同一条录音暂停/继续
      if (playingId === note.id) {
        const p = playerRef.current;
        if (p?.isPaused) {
          p.play();
        } else {
          p?.pause();
        }
        return;
      }

      // 切换到新录音
      playerRef.current?.destroy();
      const player = new AudioPlayer();
      player.load(
        note.blobUrl,
        (timeMs) => {
          setPlayTime(timeMs);
          // 高亮对应时间窗口内的 stroke
          if (editor) {
            const ids = findStrokesAtTime(note.strokes, timeMs);
            highlightStrokes(editor, ids);
          }
        },
        () => {
          // 播放结束
          setPlayingId(null);
          setPlayTime(0);
          if (editor) {
            clearHighlights(editor);
          }
        },
      );
      playerRef.current = player;
      setPlayingId(note.id);
      setPlayDuration(note.duration);
      setPlayTime(0);
      player.play();
    },
    [playingId, recording, editor],
  );

  // 停止播放
  const handleStopPlay = useCallback(() => {
    playerRef.current?.destroy();
    playerRef.current = null;
    setPlayingId(null);
    setPlayTime(0);
    if (editor) clearHighlights(editor);
  }, [editor]);

  // 删除录音
  const handleDelete = useCallback(
    async (note: AudioNote) => {
      if (playingId === note.id) handleStopPlay();
      try {
        await deleteAudioNote(note.id);
        revokeAudioNoteUrl(note);
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
      } catch (e) {
        alert('删除失败：' + (e as Error).message);
      }
    },
    [playingId, handleStopPlay],
  );

  // 跳转播放进度（点击进度条）
  const handleSeek = useCallback(
    (note: AudioNote, e: React.MouseEvent<HTMLDivElement>) => {
      if (!playerRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const timeMs = ratio * note.duration;
      playerRef.current.seek(timeMs);
      setPlayTime(timeMs);
      if (editor) {
        const ids = findStrokesAtTime(note.strokes, timeMs);
        highlightStrokes(editor, ids);
      }
    },
    [editor],
  );

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[360px] bg-white shadow-2xl z-50 flex flex-col border-l border-[#E8E4DE]">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DE] bg-[#FAF8F5]">
        <div className="flex items-center gap-2">
          <Mic className={cn('w-5 h-5', recording ? 'text-[#E85D75] animate-pulse' : 'text-[#D4A574]')} />
          <h2 className="font-semibold text-[#4A3F35] text-sm">录音笔记</h2>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#E8E4DE]">
          <X className="w-4 h-4 text-[#6B5E54]" />
        </button>
      </div>

      {/* 录音控制 */}
      <div className="px-4 py-4 border-b border-[#E8E4DE]">
        {!recording ? (
          <Button className="w-full" onClick={handleStartRecord}>
            <Mic className="w-4 h-4 mr-2" />
            开始录音
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <span className="w-3 h-3 bg-[#E85D75] rounded-full animate-pulse" />
              <span className="text-sm text-[#E85D75] font-medium">
                录音中 {fmtTime(recordElapsed)}
              </span>
            </div>
            <p className="text-xs text-[#9B8E84] text-center">
              现在书写的笔画将与录音时间同步
            </p>
            {/* D4.3 录音中实时转录 */}
            {liveTranscript ? (
              <div className="bg-[#FAF8F5] rounded-lg p-2 border border-[#E8E4DE]">
                <p className="text-xs text-[#6B5E54] mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  实时转录
                </p>
                <p className="text-xs text-[#4A3F35] leading-relaxed">{liveTranscript}</p>
              </div>
            ) : (
              <p className="text-xs text-[#9B8E84] text-center italic">
                转录中...（若持续无文本，可能浏览器不支持）
              </p>
            )}
            <Button variant="secondary" className="w-full" onClick={handleStopRecord}>
              <Square className="w-4 h-4 mr-2" />
              停止并保存
            </Button>
          </div>
        )}
      </div>

      {/* 录音列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-sm text-[#9B8E84]">加载中...</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Clock className="w-10 h-10 text-[#D4A574] mx-auto mb-3 opacity-50" />
            <p className="text-sm text-[#9B8E84]">
              这页还没有录音笔记
            </p>
            <p className="text-xs text-[#9B8E84] mt-1">
              点击上方按钮开始第一段录音
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F5F2EC]">
            {notes.map((note) => {
              const isPlaying = playingId === note.id;
              const progress = isPlaying && playDuration > 0
                ? (playTime / playDuration) * 100
                : 0;
              return (
                <div key={note.id} className="px-4 py-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#4A3F35]">
                        {fmtTime(note.duration)}
                      </p>
                      <p className="text-xs text-[#9B8E84]">
                        {new Date(note.createdAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' · '}
                        {note.strokes.length} 笔
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handlePlay(note)}
                        className="p-1.5 rounded-lg hover:bg-[#FAF8F5]"
                        title={isPlaying ? '暂停' : '播放'}
                      >
                        {isPlaying ? (
                          <Pause className="w-4 h-4 text-[#D4A574]" />
                        ) : (
                          <Play className="w-4 h-4 text-[#D4A574]" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(note)}
                        className="p-1.5 rounded-lg hover:bg-[#FAF8F5]"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4 text-[#9B8E84]" />
                      </button>
                    </div>
                  </div>
                  {/* 进度条 */}
                  <div
                    className="h-1.5 bg-[#F5F2EC] rounded-full overflow-hidden cursor-pointer"
                    onClick={(e) => handleSeek(note, e)}
                  >
                    <div
                      className="h-full bg-[#D4A574] transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {isPlaying && (
                    <p className="text-xs text-[#9B8E84] mt-1 text-center">
                      {fmtTime(playTime)} / {fmtTime(playDuration)}
                    </p>
                  )}
                  {/* D4.3 转录文本折叠区 */}
                  {note.transcript ? (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandedTranscriptId(expandedTranscriptId === note.id ? null : note.id)}
                        className="flex items-center gap-1 text-xs text-[#6B5E54] hover:text-[#D4A574]"
                      >
                        {expandedTranscriptId === note.id ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        <FileText className="w-3 h-3" />
                        转录文本
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard?.writeText(note.transcript || '').catch(() => {});
                          }}
                          className="ml-1 p-0.5 rounded hover:bg-[#E8E4DE]"
                          title="复制转录文本"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </button>
                      {expandedTranscriptId === note.id && (
                        <p className="mt-1 ml-4 text-xs text-[#4A3F35] leading-relaxed bg-[#FAF8F5] p-2 rounded border border-[#E8E4DE]">
                          {note.transcript}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-[#9B8E84] italic">该录音未转录</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="border-t border-[#E8E4DE] p-3 bg-[#FAF8F5]">
        <p className="text-xs text-[#9B8E84] leading-relaxed">
          录音时书写的笔画会与录音时间同步，回放时笔画会按时间顺序高亮显示。点击笔画可跳转到对应录音时间。
        </p>
      </div>
    </div>
  );
}

// ====== stroke 高亮辅助函数 ======
// tldraw 没有"高亮"内置 API，用 setHintingShapes 模拟（hinting 会在 shape 周围显示蓝色边框）
const HIGHLIGHTED_KEY = '__lexnote_audio_highlight';

function highlightStrokes(editor: Editor, shapeIds: string[]): void {
  try {
    if (shapeIds.length === 0) {
      editor.setHintingShapes([]);
      return;
    }
    editor.setHintingShapes(shapeIds as never);
  } catch (e) {
    console.warn('[AudioNotePanel] highlightStrokes failed:', e);
  }
}

function clearHighlights(editor: Editor): void {
  try {
    editor.setHintingShapes([]);
  } catch {
    /* ignore */
  }
}
