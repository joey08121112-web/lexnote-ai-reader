// D4.1 实时转录：Web Speech API 封装
// 仅 Chrome/Edge/Safari 支持，Firefox 不可用（降级为不显示 transcript）

export interface TranscriptionResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

/**
 * LiveTranscriber：实时转录封装。
 * 用法：
 *   const t = new LiveTranscriber(onResult, onError);
 *   t.start();  // 开始转录
 *   t.stop();   // 停止并清理
 * 不可用（浏览器不支持）时构造即抛错，调用方应 try/catch 降级。
 */
export class LiveTranscriber {
  private recognition: SpeechRecognitionLike | null = null;
  private onResult: (result: TranscriptionResult) => void;
  private onError: (error: string) => void;
  private running = false;
  private stoppedByUser = false;

  constructor(onResult: (result: TranscriptionResult) => void, onError: (error: string) => void) {
    const Ctor = this.getSpeechRecognitionCtor();
    if (!Ctor) {
      throw new Error('当前浏览器不支持 Web Speech API');
    }
    this.onResult = onResult;
    this.onError = onError;
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result.item(0);
        this.onResult({
          transcript: alt.transcript,
          isFinal: result.isFinal,
          confidence: alt.confidence,
        });
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.onError(event.error || '转录错误');
    };

    // 浏览器会主动 stop（如静音），自动重启直到用户主动 stop
    this.recognition.onend = () => {
      this.running = false;
      if (!this.stoppedByUser && this.recognition) {
        try {
          this.recognition.start();
          this.running = true;
        } catch (e) {
          // start 失败（例如 repeated-start），忽略
        }
      }
    };
  }

  private getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }

  start() {
    if (!this.recognition || this.running) return;
    this.stoppedByUser = false;
    try {
      this.recognition.start();
      this.running = true;
    } catch (e) {
      this.onError(`启动转录失败：${(e as Error).message}`);
    }
  }

  stop() {
    this.stoppedByUser = true;
    if (this.recognition && this.running) {
      try {
        this.recognition.stop();
      } catch (e) {
        // 忽略
      }
    }
    this.running = false;
  }

  abort() {
    this.stoppedByUser = true;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {
        // 忽略
      }
    }
    this.running = false;
  }

  setLang(lang: string) {
    if (this.recognition) this.recognition.lang = lang;
  }

  isRunning() {
    return this.running;
  }
}
