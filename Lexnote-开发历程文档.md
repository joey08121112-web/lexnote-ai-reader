# Lexnote 开发历程记录

> 本文档记录了使用 TRAE AI 助手开发 Lexnote 项目的完整对话过程和技术实现。

---

## 项目简介

**Lexnote** 是一款 AI 驱动的一体化学习笔记应用，支持 Web 端和 iOS/iPadOS 原生端。核心产品理念：在一个 App 里完成看书、学习、问 AI，不需要在多个 App 之间反复跳转。

**核心用户**：使用 iPad 自学或备考英语的大学生、考研党、职场人士；有阅读英文原著/文献习惯的学习者；重度笔记用户。

**灵感来源**：开发者在备考英语四六级期间，发现需要在 GoodNotes（笔记）、豆包（AI问答）、微信读书（阅读）之间反复切换，注意力被严重打断。因此想到：为什么不能在一个笔记软件里直接问 AI？

---

## 开发时间线

### 第一阶段：Web 端基础功能（6月25日 - 7月3日）

#### 1. 项目初始化与架构搭建
- 使用 Vite + React + TypeScript 搭建前端项目
- 使用 Tailwind CSS 进行样式设计
- 确定暖米色配色主题（#FAF7F2 背景，#C4956A 强调色）
- 设置 Node.js Express 后端服务处理 AI API 请求

#### 2. PDF/EPUB 阅读器核心
- 集成 PDF.js 实现 PDF 渲染
  - 双图层架构：视觉层（canvas）+ 文本层（透明 div 用于选择）
  - 连续垂直滚动，懒加载（仅渲染视口周围 ±800px）
  - 悬浮页码气泡
- 集成 epub.js 实现 EPUB 渲染（保留原生文本渲染，不转PDF）
- TXT 和图片文件通过 jsPDF 转换为 PDF 渲染
- Word/PPT 文件通过后端 LibreOffice 转换为 PDF

#### 3. 阅读/笔记模式切换
- 阅读模式：支持文本选择、划词翻译、点击查词
- 笔记模式：集成 Tldraw v3 手写白板
  - 仅手写笔输入，手指用于滚动
  - 100%-300% 缩放（步长25%）
  - 相机锁定防止书写后内容移动
  - Tldraw 默认 UI 元素（工具栏、水印）通过 CSS 隐藏
  - 紧凑内联式笔迹工具栏（移入顶部区域）
  - 切换模式时笔迹保留不丢失

#### 4. 词典与翻译
- 三级降级策略：本地迷你词典 → WASM 神经翻译 → 离线逐词翻译
- 支持离线使用
- 点击单词即时弹窗显示释义

### 第二阶段：AI 问答功能打通（7月4日 - 7月7日）

#### 5. AI 服务对接
- 接入火山引擎豆包大模型 API
- 服务器内置默认 API Key，用户无需自行配置
- 后端清除代理环境变量确保直连 API
- 前端90秒超时，后端120秒超时

#### 6. AI 区域选择问答
- 点击 AI 按钮进入选择模式（十字光标）
- 阅读模式：矩形拖拽选择（半透明橙色选框）
- 笔记模式：Tldraw 原生框选
- 松开鼠标后截取选中区域截图
- 弹出页内浮动聊天窗口
- 用户输入问题后发送（不自动发送）
- 多轮对话支持追问（后续不重复发送截图）
- 用户消息气泡显示截图缩略图
- 详细的 [AI] 前缀日志用于调试

**遇到的问题与解决**：
- ❌ API 无响应 → 原因是服务器环境变量中 http_proxy 导致请求无法发出 → 解决：在 server/index.js 最顶部清除所有代理环境变量
- ❌ Token 使用量为0 → 原因是代理问题导致请求未真正到达豆包API → 解决：同上
- ❌ 选择区域后自动发送 → 产品需求是用户输入问题后再发送 → 修复：添加输入框和发送按钮
- ❌ 截图未发送 → 原因是截图逻辑选择第一个相交canvas而非最大相交 → 修复：选择交集面积最大的canvas裁剪
- ❌ 类型不匹配错误 → 逐步修复各种编译错误

### 第三阶段：错题本、便利贴等高级功能（7月8日 - 7月9日）

#### 7. 错题本系统
- 支持四种类型：生词、句子、数学题、其他
- 每本书独立错题本
- 记录原始位置（页码和相对坐标），点击可定位回去
- 生词使用 SM-2 间隔重复算法安排复习
- 去重机制：书+类型+内容唯一
- 生词tab只显示mistakeStore数据
- 删除生词同步删除vocabularyStore中的对应条目
- 存储rehydration时自动去重现有数据

#### 8. 便利贴功能
- 默认黄色便签纸风格
- 支持4种颜色切换（黄/粉/蓝/绿）
- 拖拽移动位置
- 可最小化到创建位置（变成小圆点）
- 支持文本输入

#### 9. 图片插入
- 从相册选择图片插入页面
- 支持拖拽移动和缩放

#### 10. 录音功能
- 使用 MediaRecorder API 录音
- 录音与笔记同步
- 录音历史面板（播放、跳转、删除）

#### 11. 其他功能
- 页面缩略图导航面板
- 大纲导航
- 书签功能
- 本地数据持久化（localStorage + IndexedDB）
- 所有用户数据本地存储，不上传服务器（隐私保护）

### 第四阶段：Web 端部署与参赛准备（7月10日）

#### 12. 部署上线
- 修复 TypeScript 编译错误（baseUrl 废弃警告）
- 部署到 Vercel：https://lexnote-ai-reader-hwthrehcd-milo23.vercel.app/
- 部署到 Render：https://lexnote-web.onrender.com/
- Vercel 部署说明：Free instances 闲置后会休眠，不支持 SSH/持久磁盘

#### 13. 参赛 HTML 演示文档
- 创建产品介绍 HTML 页面（Lexnote-Contest-HTML.zip）
- 包含 Demo 简介、创作思路、功能展示、开发截图
- 暖米色设计风格与应用一致

#### 14. Token 使用量优化
- 截图翻译时压缩图片大小减少 token 消耗
- 仅在首次发送截图，后续追问纯文本
- 提供大致token消耗参考

### 第五阶段：iOS 端开发（7月11日 - 7月12日）

#### 15. iOS 项目初始化
- 使用 XcodeGen 管理项目配置（project.yml）
- SwiftUI + SwiftData 架构
- 部署目标 iOS 17.0，适配 iOS 26 液态玻璃效果
- 集成 ZIPFoundation 处理 EPUB 解压
- 配置麦克风权限描述

#### 16. 数据模型（SwiftData @Model）
- **Book** - 书籍信息
- **VocabularyWord** - 生词本（SM-2间隔重复）
- **StickyNote** - 便利贴（支持 PencilKit 手写，@Attribute(.externalStorage) 存储笔迹数据）
- **PdfHighlight** - PDF高亮
- **Folder** - 文件夹分类
- **MistakeItem** - 错题本（生词/句子/数学/其他，记录位置比例0-1用于定位）
- **RecordingNote** - 录音记录（@Attribute(.externalStorage) 存储音频）
- **InsertedImage** - 插入图片（@Attribute(.externalStorage) 存储图片）

#### 17. iOS 26 液态玻璃效果实现
- **LiquidGlassButtonStyle**：自定义按钮样式
  - `.ultraThinMaterial` 基础模糊材质
  - 多层白色渐变高光模拟玻璃反光（顶部亮→底部暗）
  - 渐变边框（顶部0.9白色→底部0.08黑色）
  - 双重阴影（黑色投影+白色顶光）
  - 按压时0.92缩放+阴影变化动画
- 顶部状态栏、分段控制器、底部悬浮工具栏、面板均使用液态玻璃效果
- 使用自定义 `liquidGlass()` ViewModifier，不依赖 iOS 26 独有的 `.glassEffect()` API，兼容 iOS 17+

#### 18. iOS 核心组件
- **PDFReaderView**：主阅读/笔记视图，整合所有功能
- **CustomPDFView**：基于 PDFKit 的自定义 PDF 视图，支持单词点击识别
- **NoteCanvasView**：基于 PencilKit 的手写画布
- **AIRegionSelector**：区域选择截图组件（使用 connectedScenes 获取 keyWindow，避免废弃的 UIApplication.shared.windows）
- **AISolverView**：AI 对话界面，支持多轮对话和截图预览
- **BottomFloatingToolbar**：底部液态玻璃悬浮工具栏（AI/错题本/便签/图片/录音）
- **MistakeBookPanel**：错题本面板（类型筛选、定位、删除）
- **StickyNoteComponent**：便利贴组件（PencilKit 手写、文本输入、颜色切换、最小化）
- **InsertedImageView**：插入图片显示与拖拽
- **RecordingHistoryPanel**：录音历史面板
- **ThumbnailGridView**：页面缩略图导航（使用 @Environment(\\.displayScale) 替代废弃的 UIScreen.main.scale）

#### 19. iOS 服务层
- **AIService**：AI 对话服务（流式 SSE 响应、多模态图片输入、URLSession 流式处理）
- **RecordingService**：AVFoundation 录音/播放服务
- **FileStore**：文件存储管理（书籍、笔记、录音目录）
- **DictionaryService**：词典服务
- **ConversionService**：文档转换服务
- **OCRService**：OCR 文字识别

#### 20. iOS 编译问题修复
- **SwiftData 宏错误**：命令行 xcodebuild 有 sandbox 限制，在 Xcode IDE 中编译正常
- **ZIPFoundation 模块冲突**：排除 CZLib 目录避免与系统 zlib 冲突
- **ENABLE_USER_SCRIPT_SANDBOXING=NO**：解决 SwiftData 宏编译问题
- **AVAudioSession API**：`session.activate()` 是 iOS 17+ async API，改用 `session.setActive(true, options: [])`
- **GlassCircleButton 参数顺序**：调整为 icon/size/isSelected/action，action 在最后支持尾随闭包
- **Color/LinearGradient 类型不匹配**：三元运算符两分支类型需一致，改用 if 条件判断
- **ForEach 类型检查超时**：`msg == messages.last` 导致编译器无法推断，改用 enumerated() 通过索引判断
- **UIScreen.main 废弃（iOS 26）**：
  - MistakeBookPanel/RecordingHistoryPanel：改用 minHeight/maxHeight 固定尺寸
  - ThumbnailGridView：使用 @Environment(\\.displayScale)
  - LexUI 添加 keyWindow/screenBounds/screenScale 辅助扩展
- **pageShadowsEnabled**：添加 if #available(iOS 18.0, *) 可用性检查

### 第六阶段：最终打包与交付（7月12日）

#### 21. 单文件交互式 HTML Demo
- 创建 Lexnote-Interactive-Demo.html（约30KB，单个自包含文件）
- 所有 CSS/JS 内联，双击直接打开即可体验
- 无需服务器、无需部署、无需网络
- 包含可交互功能：
  - 书架页（5本书+导入按钮）
  - PDF阅读器（3页示例内容、翻页）
  - 阅读/笔记模式切换
  - AI问答（框选区域+模拟AI回复+加入错题本）
  - 错题本（筛选/定位/删除）
  - 便利贴（拖拽/变色/最小化/文本输入）
  - 录音（开始/停止/历史）
  - 缩略图导航
  - 液态玻璃 UI 效果
- AI功能为模拟演示模式（不需要API Key）

#### 22. 交付文件打包
- **Lexnote-iOS-Source.zip**（27MB）：iOS 端完整 Xcode 源码
- **Lexnote-Web-Demo.zip**（7.3MB）：Web 端生产构建 dist 目录
- **Lexnote-Contest-HTML.zip**（3MB）：参赛产品介绍页
- **Lexnote-Interactive-Demo.html**（30KB）：单文件交互式演示版

#### 23. 网页端接管测试
- 使用 integrated_browser 工具打开本地开发服务器（http://localhost:5173/）
- 验证书架页面正常显示8本书
- 验证进入英语阅读理解精选阅读器
- 验证液态玻璃工具栏显示正常
- 验证AI区域选择模式激活

---

## 技术栈总结

### Web 端
| 技术 | 用途 |
|------|------|
| Vite 6 | 构建工具 |
| React 18 + TypeScript | 前端框架 |
| Tailwind CSS | 样式框架 |
| PDF.js | PDF 渲染 |
| epub.js | EPUB 渲染 |
| Tldraw v3 | 手写白板 |
| Mammoth.js | Word 文档解析 |
| html2canvas | 区域截图 |
| Zustand | 状态管理 |
| Express.js | 后端服务 |
| node-fetch | AI API 请求 |
| Render / Vercel | 部署平台 |

### iOS 端
| 技术 | 用途 |
|------|------|
| SwiftUI | UI 框架 |
| SwiftData | 数据持久化 |
| PDFKit | PDF 渲染 |
| PencilKit | 手写功能 |
| AVFoundation | 录音/播放 |
| PhotosUI | 图片选择 |
| ZIPFoundation | EPUB 解压 |
| XcodeGen | 项目配置管理 |
| URLSession + SSE | AI 流式对话 |

---

## 关键设计决策

1. **液态玻璃风格**：使用自定义多层渐变+阴影+高光实现 iOS 26 风格，不使用系统独占 API，兼容 iOS 17+
2. **阅读/笔记模式双架构**：同一页面切换，笔迹保留，Tldraw 相机锁定防止误移
3. **AI 区域选择问答**：拖拽框选→截图→用户输入→发送，不自动发送，支持多轮追问
4. **错题本定位**：存储相对位置比例（0-1）而非绝对坐标，适配不同缩放比例
5. **数据隐私**：所有用户数据本地存储（Web: localStorage/IndexedDB，iOS: SwiftData），不上传服务器
6. **离线优先**：词典三级降级，核心阅读/笔记功能完全离线可用
7. **API Key 内置**：服务器配置默认 API Key，用户开箱即用无需配置
8. **大文件外存**：SwiftData 使用 @Attribute(.externalStorage) 存储图片/音频/笔迹，避免数据库膨胀

---

## 在线体验地址

- **Vercel 完整版**：https://lexnote-ai-reader-hwthrehcd-milo23.vercel.app/
- **Render 完整版**：https://lexnote-web.onrender.com/
- **本地开发**：http://localhost:5173/（需 npm run dev 启动）

---

## 参赛提交内容

1. **Demo 简介**：AI 驱动的一体化学习笔记 App（Web + iOS），面向 iPad 自学/备考人群，核心功能：PDF/EPUB阅读、AI问答、错题本、手写笔记
2. **创作思路**：解决多 App 切换痛点，一个 App 完成阅读+笔记+AI问答
3. **体验地址**：Vercel 在线链接 + 单文件 HTML Demo
4. **TRAE 实践过程**：本文档即为开发过程记录

---

*文档生成时间：2026年7月12日*
*开发工具：TRAE AI IDE*
