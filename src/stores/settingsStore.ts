import { create } from 'zustand';

export type AIModel = 'gpt-4o' | 'claude-3-5-sonnet' | 'gemini-2.0-flash' | 'qwen-vl' | 'doubao' | 'custom';
export type DoubaoMode = 'preset' | 'endpoint';

interface SettingsState {
  apiKey: string;
  model: AIModel;
  customEndpoint: string;
  /** 豆包接入模式：'preset'=预制模型（直接用模型名），'endpoint'=自定义推理接入点（ep-xxx） */
  doubaoMode: DoubaoMode;
  /** 豆包预制模型名（如 doubao-seed-2-1-pro-260628、doubao-1.5-vision-pro） */
  doubaoModelName: string;
  /** 豆包自定义推理接入点 ID（火山方舟创建的 ep-xxx ID） */
  doubaoEndpointId: string;
  setApiKey: (key: string) => void;
  setModel: (model: AIModel) => void;
  setCustomEndpoint: (endpoint: string) => void;
  setDoubaoMode: (mode: DoubaoMode) => void;
  setDoubaoModelName: (name: string) => void;
  setDoubaoEndpointId: (id: string) => void;
}

const STORAGE_KEY = 'lexnote-settings';

interface PersistedSettings {
  apiKey: string;
  model: AIModel;
  customEndpoint: string;
  doubaoMode?: DoubaoMode;
  doubaoModelName?: string;
  doubaoEndpointId?: string;
}

function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey || '',
        model: parsed.model || 'doubao',
        customEndpoint: parsed.customEndpoint || '',
        doubaoMode: parsed.doubaoMode || 'preset',
        doubaoModelName: parsed.doubaoModelName || 'doubao-1.5-vision-pro',
        doubaoEndpointId: parsed.doubaoEndpointId || '',
      };
    }
  } catch {
    // ignore
  }
  return {
    apiKey: '',
    model: 'doubao',
    customEndpoint: '',
    doubaoMode: 'preset',
    doubaoModelName: 'doubao-1.5-vision-pro',
    doubaoEndpointId: '',
  };
}

function saveSettings(s: PersistedSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const initial = loadSettings();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiKey: initial.apiKey,
  model: initial.model,
  customEndpoint: initial.customEndpoint,
  doubaoMode: initial.doubaoMode,
  doubaoModelName: initial.doubaoModelName,
  doubaoEndpointId: initial.doubaoEndpointId,
  setApiKey: (apiKey) => {
    set({ apiKey });
    const s = get();
    saveSettings({
      apiKey, model: s.model, customEndpoint: s.customEndpoint,
      doubaoMode: s.doubaoMode, doubaoModelName: s.doubaoModelName, doubaoEndpointId: s.doubaoEndpointId,
    });
  },
  setModel: (model) => {
    set({ model });
    const s = get();
    saveSettings({
      apiKey: s.apiKey, model, customEndpoint: s.customEndpoint,
      doubaoMode: s.doubaoMode, doubaoModelName: s.doubaoModelName, doubaoEndpointId: s.doubaoEndpointId,
    });
  },
  setCustomEndpoint: (customEndpoint) => {
    set({ customEndpoint });
    const s = get();
    saveSettings({
      apiKey: s.apiKey, model: s.model, customEndpoint,
      doubaoMode: s.doubaoMode, doubaoModelName: s.doubaoModelName, doubaoEndpointId: s.doubaoEndpointId,
    });
  },
  setDoubaoMode: (doubaoMode) => {
    set({ doubaoMode });
    const s = get();
    saveSettings({
      apiKey: s.apiKey, model: s.model, customEndpoint: s.customEndpoint,
      doubaoMode, doubaoModelName: s.doubaoModelName, doubaoEndpointId: s.doubaoEndpointId,
    });
  },
  setDoubaoModelName: (doubaoModelName) => {
    set({ doubaoModelName });
    const s = get();
    saveSettings({
      apiKey: s.apiKey, model: s.model, customEndpoint: s.customEndpoint,
      doubaoMode: s.doubaoMode, doubaoModelName, doubaoEndpointId: s.doubaoEndpointId,
    });
  },
  setDoubaoEndpointId: (doubaoEndpointId) => {
    set({ doubaoEndpointId });
    const s = get();
    saveSettings({
      apiKey: s.apiKey, model: s.model, customEndpoint: s.customEndpoint,
      doubaoMode: s.doubaoMode, doubaoModelName: s.doubaoModelName, doubaoEndpointId,
    });
  },
}));
