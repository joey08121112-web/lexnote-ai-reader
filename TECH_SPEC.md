# Lexnote 技术方案

> 当前阶段：**Web 端**（Vite + React 18 + TypeScript），iPad Safari 优化
>
> 未来规划：Web 端稳定后迁移到 **iOS 原生**（SwiftUI + PencilKit）

---

## 一、产品定位

Lexnote 是一款**一体化学习应用**，整合阅读 + 笔记 + AI 翻译 + AI 解题四大核心能力。目标用户为学生、考研党、语言学习者，让他们无需在多个 App 之间切换。

**核心差异化：**
- **阅读 + 笔记一体化**：不像 GoodNotes/Notability 需要先导出再手写，直接在原文上书写
- **AI 深度集成**：点击单词即时翻译、拍照 AI 解题（竞品空白）
- **离线优先**：核心功能（翻译、阅读、笔记）全部离线可用
- **多格式导入**：PDF/EPUB/TXT/Word/PPT/图片都能用

---

## 二、核心功能模块

### 2.1 阅读模块

| 功能 | 描述 | 状态 |
|------|------|------|
| PDF 连续滚动 | 无底部翻页栏，浮动页码气泡 | ✅ |
| EPUB 流式阅读 | 保留原生章节结构 | ✅ |
| Word/PPT → PDF | 后端 LibreOffice 转码 | ✅ |
| 图片/TXT 导入 | TXT/jsPDF 渲染，图片直接显示 | ✅ |
| 双指 pinch 缩放 | 平板手势，touch events | ✅ |
| 滚轮 ctrl+wheel 缩放 | 电脑端（Mac触控板双指捏合） | ✅ |
| 浮动缩放控件 | 25% 步进 100%~300% | ✅ |
| 文字选中 | 长按拖拽选区 + 工具栏 | ✅ |
| 高亮标记 | 4 色（黄/绿/蓝/粉） | ✅ |
| 文字选中 AI 问答 | 调用大模型解释 | ✅ |

### 2.2 英语学习模块（点击单词翻译）

| 功能 | 描述 | 状态 |
|------|------|------|
| PDF 单词点击 | textLayer 单击取词 → 翻译气泡 | ✅ |
| EPUB 单词点击 | 流式文本单击取词 → 翻译气泡 | ✅ |
| 离线词典 | 内置 120 高频词 + ECDICT 5万词 | ✅ |
| 词态还原 | running→run, went→go, books→book | ✅ |
| WASM 神经翻译 | Xenova/opus-mt-en-zh（70MB首次下载） | ✅ |
| 翻译来源标签 | 显示"本地词典/在线/离线AI/离线逐词" | ✅ |
| 离线状态指示器 | 顶部工具栏显示"离线模式" | ✅ |
| 生词本 | 自动收集 + 手动添加 | 🚧 基础完成 |

### 2.3 笔记模块

| 功能 | 描述 | 状态 |
|------|------|------|
| 手写笔记 | Canvas 叠加在内容上 | ✅ |
| 格式无关 | 笔记对所有格式（PDF/EPUB/TXT/Word/图片）通用 | ✅ |
| 多种颜色 + 笔粗 | 调色板 + 滑块 | ✅ |
| 橡皮擦 | destination-out 合成 | ✅ |
| 阅读/笔记模式切换 | top-left 按钮（仿 TRAE Work/Code 切换） | ✅ |
| 跨页保留 | localStorage 存 `{bookId}-{page}` | ✅ |
| Apple Pencil 优先 | touch-action: pan-y + pointerType 区分 | ✅ |
| 笔记模式缩放 | 100%~300%，方便书写 | ✅ |

### 2.4 AI 解题模块

| 功能 | 描述 | 状态 |
|------|------|------|
| 阅读器内截屏 | 点击"AI 解题"→ 截取当前页 → 大模型 | ✅ |
| 独立 /solver 页面 | 粘贴/上传图片 → AI 讲解 | ✅ |
| 历史记录 | localStorage 存所有问答 | ✅ |
| 多模型支持 | GPT-4o / Claude 3.5 / Gemini 2.0 / Qwen-VL / 自定义 | ✅ |
| 多轮对话 | 追问时带历史 context | ✅ |
| API Key 配置 | Settings 页面设置，settingsStore 持久化 | ✅ |

---

## 三、技术架构

### 3.1 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                  iPad / Mac 浏览器                          │
├──────────────────────────────────────────────────────────┤
│  React 18 + TypeScript + Vite 6                          │
│  ├── Pages: Bookshelf / Reader / Solver / Vocabulary /   │
│  │          Settings / EnglishReader                     │
│  ├── Components: PdfViewer / EpubViewer / common        │
│  ├── Stores (Zustand): book / settings / vocabulary      │
│  └── Lib: aiService / localDict / wasmTranslate /        │
│          storage / fileProcessor                         │
├──────────────────────────────────────────────────────────┤
│  本地存储                                                  │
│  ├── IndexedDB (idb-keyval)   ← 大文件/翻译缓存/词典     │
│  └── localStorage             ← 笔记/元数据/设置/历史     │
├──────────────────────────────────────────────────────────┤
│  后端 (Express, 端口 3001)                                  │
│  ├── /api/convert   Word/PPT → PDF (LibreOffice)         │
│  ├── /api/ai        多模态大模型代理（避免 CORS/暴露 Key） │
│  ├── /api/translate Google 翻译代理（避免 CORS）          │
│  └── /api/hf/*      HuggingFace 镜像代理（避开 CORS）     │
├──────────────────────────────────────────────────────────┤
│  外部服务                                                  │
│  ├── HuggingFace CDN / hf-mirror.com  (WASM 模型下载)    │
│  ├── OpenAI / Anthropic / Google / 阿里  (大模型)         │
│  └── translate.googleapis.com          (在线翻译)          │
└──────────────────────────────────────────────────────────┘
```

### 3.2 技术栈选型理由

| 选型 | 理由 |
|------|------|
| **React + Vite** | iPad Safari 兼容好，Vite HMR 快，TypeScript 类型安全 |
| **Zustand** | 轻量（比 Redux 少 90% 模板），持久化中间件 |
| **pdfjs-dist** | Mozilla 官方，PDF 渲染事实标准，TextLayer 文本可选 |
| **epubjs** | 唯一成熟的浏览器端 EPUB 库 |
| **IndexedDB (idb-keyval)** | 浏览器原生可存数百 MB，比 localStorage 5MB 限制大得多 |
| **@huggingface/transformers** | 浏览器端运行 ONNX 模型，无后端依赖 |
| **Express + LibreOffice** | 唯一能真正保留 Word/PPT 排版转 PDF 的方案 |
| **Tailwind CSS** | 原子化样式，类名即语义，HMR 友好 |

### 3.3 目录结构

```
Lexnote/
├── src/
│   ├── components/
│   │   ├── common/          Button / Modal / Toast
│   │   ├── EpubViewer.tsx
│   │   ├── PdfViewer.tsx    # 连续滚动 + 懒加载 + scale prop
│   │   └── Empty.tsx
│   ├── pages/
│   │   ├── Bookshelf.tsx    # 书架 + 导入
│   │   ├── Reader.tsx       # 阅读器（核心页面，580+ 行）
│   │   ├── Solver.tsx       # AI 解题
│   │   ├── Settings.tsx
│   │   ├── Vocabulary.tsx   # 生词本
│   │   ├── Home.tsx
│   │   └── EnglishReader.tsx
│   ├── lib/
│   │   ├── aiService.ts     # AI/翻译三层降级
│   │   ├── localDict.ts     # 离线词典 + 词态还原
│   │   ├── wasmTranslate.ts # 浏览器端 WASM 翻译
│   │   ├── storage.ts       # IndexedDB 封装
│   │   ├── fileProcessor.ts # 多格式导入
│   │   └── utils.ts
│   ├── stores/              # Zustand
│   │   ├── bookStore.ts
│   │   ├── settingsStore.ts
│   │   └── vocabularyStore.ts
│   ├── hooks/
│   │   └── useTheme.ts
│   └── types/
│       ├── book.ts
│       └── vocabulary.ts
├── server/                  # Express 后端
│   ├── index.js
│   └── package.json
├── public/
│   └── dict/mini-dict.json  # 内置 120 高频词
├── .trae/documents/         # 设计/方案文档
└── vite.config.ts
```

---

## 四、数据模型

```typescript
// 书籍
interface Book {
  id: string;
  title: string;
  author?: string;
  fileType: 'pdf' | 'epub' | 'txt' | 'docx' | 'pptx' | 'image';
  storageType: 'text' | 'pdf-blob' | 'epub-blob';  // 决定用哪个渲染器
  coverImage?: string;
  content?: string;          // 仅 text 类型用
  addedDate: Date;
  lastReadPage: number;
  totalPages?: number;
}

// 高亮
interface Highlight {
  id: string;
  bookId: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'pink';
  pageNumber: number;
  note?: string;
  createdAt: Date;
}

// 生词
interface VocabularyWord {
  id: string;
  word: string;
  translation: string;
  phonetic?: string;
  examples: string[];
  sourceBook?: string;
  addedDate: Date;
  reviewCount: number;
  nextReviewDate: Date;
  easeFactor: number;  // SM-2 算法
}

// 设置
interface Settings {
  apiKey: string;
  model: 'gpt-4o' | 'claude-3-5-sonnet' | 'gemini-2.0-flash' | 'qwen-vl' | 'custom';
  customEndpoint: string;
}
```

### 4.1 存储策略

| 数据 | 位置 | 大小 |
|------|------|------|
| 书籍元数据 | localStorage | <1KB/本 |
| PDF/EPUB 原始文件 | IndexedDB | 数 MB ~ 数十 MB |
| TXT/Word 文本 | IndexedDB | 数百 KB |
| 手写笔记 | localStorage (`lexnote-notes-{bookId}-{page}`) | 数 KB/页 |
| 词典缓存 | IndexedDB (`lexnote-full-dict`) | ~5MB（可选） |
| WASM 模型 | 浏览器 HTTP 缓存 | ~70MB |
| 翻译缓存 | 内存 | - |
| API Key | localStorage (`lexnote-settings`) | <1KB |
| AI 解题历史 | localStorage (`lexnote-solver-history`) | 数 MB（图片base64） |

---

## 五、关键技术方案

### 5.1 PDF 连续滚动 + 缩放

**问题：** 默认 PDF.js 是一页一页翻，用户体验差。需要支持 iPad 连续滚动浏览。

**方案：**
- 用 `pdfjs-dist` 的 `getDocument` 加载 PDF
- 遍历所有页创建占位 div（用第 1 页比例估算高度）
- `IntersectionObserver` 监听可见页，触发 `pdfPage.render()` 渲染到 canvas
- 文本层用 `pdfjs-dist` 的 `TextLayer` API 创建透明 div（用于文字选中和点击取词）
- 缩放通过 `scale` prop 传给 PdfViewer，渲染时用 `renderScale = (containerWidth / vp0.width) * userScale`
- 浮动页码气泡（替代底部翻页栏）

**关键优化：**
- `renderPage` 用 `useCallback` 稳定引用，observer effect 只依赖 `[loading, numPages]`
- 缩放时清空已渲染 canvas + textLayer，requestAnimationFrame 后重新触发
- `initialPage` 用 `hasScrolledRef` 避免和滚动→页码更新形成循环

### 5.2 多格式"一切皆 PDF"策略

```
PDF → 直接渲染
EPUB → epubjs 流式渲染
TXT → 文本分页
Word/PPT → 后端转 PDF → 按 PDF 渲染
图片 → jsPDF 包成 PDF → 按 PDF 渲染
```

笔记 Canvas 位于内容层之上，格式无关，所有格式都支持手写笔记。

### 5.3 翻译三层降级（核心）

**目标：** 离线状态下也能翻译。

```
请求 → [1] 本地词典（单词）
     → [2a] 在线 Google 翻译（3秒超时）
     → [2b] WASM 神经翻译（Xenova/opus-mt-en-zh）
     → [2c] 本地逐词兜底
```

详见 [`.trae/documents/TRANSLATION.md`](file:///Users/ami/Documents/TRAE/Lexnote/.trae/documents/TRANSLATION.md)。

### 5.4 阅读/笔记模式切换

- 状态：`noteMode: boolean`，仿 TRAE 的 Work/Code tab
- 阅读模式：canvas `pointer-events: none`（穿透），textLayer 可选
- 笔记模式：canvas `pointer-events: auto`（可写），textLayer 禁用选择
- 单指滑动 = 滚动（`touch-action: pan-y`）
- Apple Pencil / 鼠标 = 书写（`pointerType !== 'touch'` 才落笔）
- 模式切换通过 top-left 按钮（不依赖特定手势，符合用户预期）

### 5.5 PDF textLayer 单击取词

**挑战：** PDF textLayer 的 span 有 `position:absolute` + `transform:scale()`，浏览器原生 `caretRangeFromPoint` 返回的字符偏移不准。

**方案：**
1. `document.elementsFromPoint(clientX, clientY)` 拿点击位置所有元素
2. 过滤出 `.textLayer span`，遍历这些 span 的每个单词
3. 用 `Range.getBoundingClientRect()` 测每个单词的视觉位置（transform 后）
4. 点击坐标落在哪个 rect 内就命中哪个词
5. 高亮用独立 div overlay 覆盖（不修改 textLayer DOM，避免重影）

### 5.6 离线翻译模型下载

**挑战：** HuggingFace CDN 在中国大陆受限，模型 70MB 加载慢。

**方案：**
- 后端 `/api/hf/*` 路由代理 `https://hf-mirror.com`
- 透传 `content-length`/`content-type`/`accept-ranges` 头
- 用 `Readable.fromWeb(response.body).pipe(res)` 流式转发（避免内存爆）
- Vite `optimizeDeps.exclude: ['@huggingface/transformers']` 避免预构建卡死
- 模型下载后浏览器 HTTP 缓存，离线可用

---

## 六、UI 设计要点

### 6.1 设计风格

- **主色调**：温暖米白 `#FAF8F5` + 深棕 `#4A3F35` + 琥珀强调 `#D4A574`
- **辅助色**：高亮黄 `#FFEB99` / 高亮绿 `#C8E6C9` / 高亮蓝 `#BBDEFB` / 高亮粉 `#F8BBD9`
- **按钮**：圆角矩形，微阴影
- **字体**：标题 Playfair Display（衬线体），正文 Source Sans Pro
- **布局**：卡片式，桌面优先（iPad 横屏）

### 6.2 主界面

```
┌────────────────────────────────────────┐
│  📚 Lexnote    书架 生词本 解题 设置  │
├────────────────────────────────────────┤
│  [书籍网格]   [书籍网格]   [书籍网格]  │
│  [书籍网格]   [书籍网格]   [书籍网格]  │
│  [书籍网格]   [书籍网格]   [书籍网格]  │
│                                        │
│              [+ 导入书籍]               │
└────────────────────────────────────────┘
```

### 6.3 阅读界面

```
┌────────────────────────────────────────┐
│ [阅读/笔记]  ← 书名 →  AI解题  ⚙️ 离线 │
├────────────────────────────────────────┤
│                                        │
│       PDF/EPUB 内容（连续滚动）         │
│       单击单词 → 翻译气泡              │
│       长按选词 → 工具栏（高亮/AI）      │
│                                        │
├────────────────────────────────────────┤
│ 笔记 canvas 叠加（笔记模式时）         │
└────────────────────────────────────────┘

阅读模式底部浮动：[100%][-][100%][+][100%][适应]
笔记模式左侧浮动：颜色/笔粗/橡皮/清空
```

---

## 七、路线图

### Phase 1：Web 端 MVP ✅ 已完成
- 多格式导入（PDF/EPUB/TXT/Word/PPT/图片）
- PDF 连续滚动 + 懒加载
- Canvas 笔记叠加（格式无关）
- 阅读/笔记模式切换
- 单词点击翻译

### Phase 2：Web 端增强 ✅ 已完成
- 离线翻译三层降级（本地词典 + WASM + 在线）
- AI 解题（阅读器内 + 独立页面）
- 双指 pinch 缩放 + 滚轮 ctrl+wheel 缩放
- 浮动缩放控件
- 翻译来源标签 + 离线状态指示器

### Phase 3：Web 端打磨 🚧 进行中
- UI/UX 优化
- 性能调优（大 PDF 多页并发渲染）
- 错误处理完善
- iPad Safari 兼容性测试
- 生词本复习系统（SM-2 算法）

### Phase 4：iOS 原生 📋 待启动
- Web 端稳定后启动
- 重新评估技术栈（SwiftUI + PencilKit + PDFKit）
- 数据迁移方案
- iCloud 同步
- App Store 上架

---

## 八、风险与解决方案

| 风险 | 当前状态 | 解决方案 |
|------|---------|---------|
| pdfjs-dist v6 Safari 兼容 | 已处理 | `Map.prototype.getOrInsertComputed` polyfill |
| WASM 模型下载慢 | 已处理 | 后端代理 hf-mirror.com + 流式转发 |
| 离线翻译降级链复杂 | 已实现 | 三层降级 + 来源标签可视化 |
| PDF textLayer 点击取词不准确 | 已解决 | elementsFromPoint + Range 视觉位置测量 |
| iPad Safari 触摸事件 | 已实现 | touch-action: pan-y + pointerType 区分 |
| LibreOffice 体积大 | 接受 | 失败时降级为 mammoth.js 文本提取 |
| Google 翻译在中国不可达 | 已处理 | 3秒超时快速降级到 WASM |
| transformers.js bundle 体积 | 已处理 | Vite optimizeDeps.exclude + 动态 import |

---

## 九、API Key 管理

```typescript
// Settings 页面配置，settingsStore 持久化
interface Settings {
  apiKey: string;          // 用户自带
  model: AIModel;
  customEndpoint: string;  // 自定义 OpenAI 兼容端点
}
```

- 存 localStorage（明文，iPad 本地，不上传）
- 通过后端 `/api/ai` 代理调用，避免 CORS 和 Key 暴露到浏览器控制台
- 切换模型无需重启
