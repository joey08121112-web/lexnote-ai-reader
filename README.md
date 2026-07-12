# Lexnote 智能学习应用

> 一体化学习体验：阅读 + 笔记 + AI 翻译 + AI 解题

Lexnote 是一款跨平台智能学习应用。**当前阶段先做好 Web 端（iPad Safari 优化），功能稳定后再迁移到 iOS 原生 App**。

## 目标

- **多格式导入**：PDF / EPUB / TXT / Word / PPT / 图片 全部支持
- **阅读 + 笔记一体化**：GoodNotes 式体验，单指滑动浏览、Pencil 书写
- **AI 加持**：点击单词翻译 / 整句翻译 / 拍照 AI 解题
- **离线优先**：核心功能（翻译、阅读、笔记）全部离线可用

## 快速开始

### 1. 安装依赖

```bash
npm install
cd server && npm install
```

### 2. 启动开发环境

需要同时启动前后端：

```bash
# 终端 1：前端 (Vite dev server, 端口 5173)
npm run dev

# 终端 2：后端 (Express, 端口 3001)
npm run dev:server
```

> Mac 上 Word/PPT 转 PDF 需要 LibreOffice：`brew install --cask libreoffice`
> 不装也能用，Word/PPT 会自动降级为文本提取。

### 3. 浏览器访问

```
http://localhost:5173
```

iPad 上访问：Mac 和 iPad 同 WiFi，Vite 已配置 `host: true`，用 `http://<Mac-IP>:5173` 访问。

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| 路由 | React Router 7 |
| PDF 渲染 | pdfjs-dist v6 (连续滚动 + 懒加载) |
| EPUB 渲染 | epubjs |
| Word/PPT → PDF | 后端 LibreOffice headless |
| 离线翻译 | @huggingface/transformers (WASM) + 内置词典 |
| 本地存储 | IndexedDB (大文件) + localStorage (元数据/笔记) |
| 后端 | Express + multer + child_process |

## 核心功能

### 阅读
- ✅ PDF 连续滚动浏览（无底部翻页栏，浮动页码气泡）
- ✅ EPUB 章节渲染（保留原生流式文本）
- ✅ Word / PPT 导入后转 PDF 统一渲染
- ✅ 图片 / TXT 导入
- ✅ 双指 pinch 缩放（平板）+ 滚轮 ctrl+wheel 缩放（电脑）
- ✅ 浮动缩放控件（25% 步进，100%~300%）

### 单词翻译（离线优先三层降级）
1. **本地词典**：内置 120 高频词 + 可选 ECDICT 5万词，含词态还原（running→run, went→go）
2. **在线 Google 翻译**：3 秒超时快速失败
3. **WASM 神经翻译**：首次下载 70MB 模型（Xenova/opus-mt-en-zh），浏览器缓存后离线可用
4. **本地逐词兜底**：以上都不可用时返回词典逐词翻译

PDF textLayer 单击单词即可翻译，EPUB 同理。翻译气泡显示来源（本地词典/在线翻译/离线AI/离线逐词）。

### 笔记
- ✅ Canvas 叠加在阅读内容之上
- ✅ Apple Pencil / 鼠标书写，手指滑动=滚动
- ✅ 多种颜色 + 笔粗 + 橡皮擦
- ✅ 笔记按 `{bookId}-{page}` 存 localStorage，跨页保留
- ✅ 阅读/笔记模式切换（笔记模式隐藏翻译气泡，可书写）

### AI 解题
- ✅ 阅读器内点击"AI 解题"按钮 → 截取当前页 → 发送给多模态大模型
- ✅ 独立 `/solver` 页面：粘贴/上传图片 → AI 讲解 → 历史记录
- ✅ 支持 GPT-4o / Claude 3.5 / Gemini 2.0 / Qwen-VL / 自定义端点
- ✅ 多轮对话（追问）

## 目录结构

```
Lexnote/
├── src/
│   ├── components/        # PdfViewer / EpubViewer / common
│   ├── pages/             # Bookshelf / Reader / Solver / Settings / Vocabulary
│   ├── lib/               # aiService / localDict / wasmTranslate / storage / fileProcessor
│   ├── stores/            # bookStore / settingsStore / vocabularyStore (Zustand)
│   ├── hooks/             # useTheme
│   └── types/             # book / vocabulary
├── server/                # Express 后端 (Word/PPT 转 PDF, AI 代理, 翻译代理, HF 镜像代理)
├── public/dict/           # 内置 mini-dict.json
└── .trae/documents/       # 项目设计/方案文档
```

## 路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Web 端 MVP | 多格式导入 + 阅读 + 笔记 + 翻译 | ✅ 已完成 |
| Web 端增强 | 离线翻译 + AI 解题 + 缩放交互 | ✅ 已完成 |
| Web 端打磨 | UI/UX 优化 + 性能调优 + 错误处理 | 🚧 进行中 |
| iOS 原生 | Web 端稳定后迁移到 SwiftUI + PencilKit | 📋 待启动 |

## 文档

- [TECH_SPEC.md](file:///Users/ami/Documents/TRAE/Lexnote/TECH_SPEC.md) — 完整技术方案（Web 端当前状态）
- [`.trae/documents/PRD.md`](file:///Users/ami/Documents/TRAE/Lexnote/.trae/documents/PRD.md) — 产品需求
- [`.trae/documents/multi-format-import-plan.md`](file:///Users/ami/Documents/TRAE/Lexnote/.trae/documents/multi-format-import-plan.md) — 多格式导入方案（已实现）
- [`.trae/documents/screenshot-ai-solver-plan.md`](file:///Users/ami/Documents/TRAE/Lexnote/.trae/documents/screenshot-ai-solver-plan.md) — AI 解题方案（已实现）
- [`.trae/documents/CHANGELOG.md`](file:///Users/ami/Documents/TRAE/Lexnote/.trae/documents/CHANGELOG.md) — 开发变更日志
