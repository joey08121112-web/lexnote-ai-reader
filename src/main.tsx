// pdfjs-dist v6 依赖 Map.prototype.getOrInsertComputed（ES2024 提案），
// Safari/旧版 Chrome 不支持，需要 polyfill，否则 PDF 渲染失败（空白页）
declare global {
  interface Map<K, V> {
    getOrInsertComputed(key: K, callback: () => V): V;
  }
}

if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Map.prototype.getOrInsertComputed = function <K, V>(
    this: Map<K, V>,
    key: K,
    callback: () => V,
  ): V {
    if (this.has(key)) return this.get(key) as V;
    const value = callback();
    this.set(key, value);
    return value;
  };
}

import * as pdfjsLib from 'pdfjs-dist';
// 使用 Vite 原生 Worker 导入，这是最可靠的方式
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
const pdfWorker = new PdfWorker();
pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorker;

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
