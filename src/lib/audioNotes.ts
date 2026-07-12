import type { Editor } from 'tldraw';
import type { TLDrawShape } from '@tldraw/tlschema';
import { LiveTranscriber, type TranscriptionResult } from './transcription';

/** 单笔 stroke 的录音时间戳 */
export interface StrokeTimestamp {
  shapeId: string;
  /** 录音开始后到该 stroke 开始的毫秒数 */
  startTime: number;
  /** 录音开始后到该 stroke 结束的毫秒数 */
  endTime: number;
}

/** 一条录音笔记 */
export interface AudioNote {
  id: string;
  bookId: string;
  pageNumber: number;
  /** 录音文件 URL（Memory URL，需在卸载时 revoke；从 IndexedDB 加载时重新创建） */
  blobUrl: string;
  /** 总时长（毫秒） */
  duration: number;
  /** ISO 时间字符串 */
  createdAt: string;
  /** 录音期间创建的 stroke 时间戳列表 */
  strokes: StrokeTimestamp[];
  /** D4.2 转录文本（可能为空：浏览器不支持/未授权/无语音） */
  transcript?: string;
}

/**
 * 录音引擎
 *
 * 用法：
 *   const r = new AudioRecorder();
 *   await r.start();
 *   // 用户书写时，监听 stroke 创建/完成：
 *   r.recordStrokeStart(shapeId);  // stroke 开始绘制
 *   r.recordStrokeEnd(shapeId);    // stroke 绘制结束
 *   const note = await r.stop();
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private strokeTimestamps: StrokeTimestamp[] = [];
  private activeStrokeStart = new Map<string, number>();
  // D4.2 转录集成
  private transcriber: LiveTranscriber | null = null;
  private transcriptChunks: string[] = [];
  private liveTranscript: string = '';

  /** 是否正在录音 */
  get isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  /** D4.2 实时转录文本（interim + final 拼接） */
  getLiveTranscript(): string {
    return this.liveTranscript;
  }

  async start(): Promise<void> {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('当前浏览器不支持录音（MediaRecorder API）。请使用 Chrome/Safari 最新版。');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // webm 是 Chrome/Safari/Firefox 通用的默认编码
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';
    this.mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    this.chunks = [];
    this.strokeTimestamps = [];
    this.activeStrokeStart.clear();
    this.transcriptChunks = [];
    this.liveTranscript = '';
    this.startTime = Date.now();
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();

    // D4.2 启动转录（不可用/未授权时静默降级，不阻断录音）
    try {
      this.transcriber = new LiveTranscriber(
        (result: TranscriptionResult) => {
          if (result.isFinal) {
            this.transcriptChunks.push(result.transcript);
            this.liveTranscript = this.transcriptChunks.join(' ');
          } else {
            this.liveTranscript = [...this.transcriptChunks, result.transcript].join(' ');
          }
        },
        (err: string) => {
          console.warn('[AudioRecorder] transcription error:', err);
        },
      );
      this.transcriber.start();
    } catch (e) {
      console.warn('[AudioRecorder] LiveTranscriber 不可用，转录已禁用:', (e as Error).message);
      this.transcriber = null;
    }
  }

  /** stroke 开始绘制时调用 */
  recordStrokeStart(shapeId: string): void {
    if (!this.isRecording) return;
    this.activeStrokeStart.set(shapeId, Date.now() - this.startTime);
  }

  /** stroke 绘制结束时调用 */
  recordStrokeEnd(shapeId: string): void {
    if (!this.isRecording) return;
    const start = this.activeStrokeStart.get(shapeId);
    if (start == null) return;
    this.strokeTimestamps.push({
      shapeId,
      startTime: start,
      endTime: Date.now() - this.startTime,
    });
    this.activeStrokeStart.delete(shapeId);
  }

  /** 停止录音，返回 AudioNote（不含 bookId/pageNumber，由调用方填充） */
  async stop(): Promise<AudioNote | null> {
    if (!this.mediaRecorder) return null;
    const recorder = this.mediaRecorder;
    const startTime = this.startTime;
    const strokes = [...this.strokeTimestamps];
    // D4.2 停止转录，等待最后的结果落地（给 onresult 一个小窗口）
    this.transcriber?.stop();
    const transcriptChunksSnapshot = [...this.transcriptChunks];
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const transcript = transcriptChunksSnapshot.join(' ').trim() || undefined;
        resolve({
          id: `audio-${Date.now()}`,
          bookId: '',
          pageNumber: 1,
          blobUrl: url,
          duration: Date.now() - startTime,
          createdAt: new Date().toISOString(),
          strokes,
          transcript,
        });
        recorder.stream.getTracks().forEach((t) => t.stop());
      };
      recorder.stop();
    });
  }

  /** 取消录音（不保存） */
  cancel(): void {
    this.transcriber?.abort();
    this.transcriber = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.strokeTimestamps = [];
    this.activeStrokeStart.clear();
    this.transcriptChunks = [];
    this.liveTranscript = '';
  }
}

/**
 * 录音回放引擎
 *
 * 用法：
 *   const p = new AudioPlayer();
 *   p.load(blobUrl, (timeMs) => { /* 高亮对应 stroke *\/ });
 *   p.play();
 *   p.seek(timeMs);  // 跳转到指定时间
 */
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private onTimeUpdate?: (time: number) => void;
  private onEndedCallback?: () => void;

  load(blobUrl: string, onTimeUpdate?: (time: number) => void, onEnded?: () => void): void {
    this.destroy();
    this.audio = new Audio(blobUrl);
    this.onTimeUpdate = onTimeUpdate;
    this.onEndedCallback = onEnded;
    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate && this.audio) {
        this.onTimeUpdate(this.audio.currentTime * 1000);
      }
    });
    this.audio.addEventListener('ended', () => {
      this.onEndedCallback?.();
    });
  }

  play(): void {
    this.audio?.play().catch((e) => console.warn('[AudioPlayer] play failed:', e));
  }

  pause(): void {
    this.audio?.pause();
  }

  get isPaused(): boolean {
    return !this.audio || this.audio.paused;
  }

  get currentTime(): number {
    return this.audio ? this.audio.currentTime * 1000 : 0;
  }

  get duration(): number {
    return this.audio ? (this.audio.duration || 0) * 1000 : 0;
  }

  seek(timeMs: number): void {
    if (this.audio) {
      this.audio.currentTime = timeMs / 1000;
      // 立即触发一次更新
      this.onTimeUpdate?.(this.audio.currentTime * 1000);
    }
  }

  destroy(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }
}

/**
 * 根据当前播放时间找到所有匹配的 stroke id（在时间窗口内的）
 * @param strokes 录音的所有 stroke 时间戳
 * @param timeMs 当前播放时间（毫秒）
 * @param windowMs 时间窗口（默认 100ms，避免过短时间频繁切换高亮）
 */
export function findStrokesAtTime(
  strokes: StrokeTimestamp[],
  timeMs: number,
  windowMs = 100,
): string[] {
  return strokes
    .filter((s) => timeMs >= s.startTime && timeMs <= s.endTime + windowMs)
    .map((s) => s.shapeId);
}

/**
 * 找到某个 stroke 对应的录音时间
 * @returns 该 stroke 开始时间的毫秒数；若不在该录音中返回 null
 */
export function findStrokeTime(
  strokes: StrokeTimestamp[],
  shapeId: string,
): number | null {
  const ts = strokes.find((s) => s.shapeId === shapeId);
  return ts ? ts.startTime : null;
}
