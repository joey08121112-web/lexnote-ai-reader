// ==== 全局错误捕获（确保任何启动错误都能输出到日志）====
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

console.log('Starting Lexnote server...');
console.log('Node version:', process.version);
console.log('Working directory:', process.cwd());

// ==== 第一步：清除所有代理环境变量（必须在任何 require 之前！）====
const PROXY_KEYS = ['http_proxy','https_proxy','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','all_proxy','no_proxy','NO_PROXY'];
for (const k of PROXY_KEYS) { delete process.env[k]; }
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

// 确保 Node.js 原生 fetch（undici）不使用代理
try {
  const { setGlobalDispatcher, ProxyAgent } = require('undici');
  // 不设置任何 ProxyAgent，使用默认直连 dispatcher
} catch (e) {
  // undici 不可用则忽略（Node 16 及以下）
}

const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ==== 服务端默认 AI 配置（硬编码，所有人可用）====
const DEFAULT_AI_CONFIG = {
  apiKey: 'ark-82fca55c-1cba-4090-a5de-6f05ba3e0fd3-a3955',
  model: 'doubao',
  doubaoMode: 'preset',
  doubaoModelName: 'doubao-seed-2-1-pro-260628',
  doubaoEndpointId: '',
};

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 中间件（允许 iOS APP 和 Web 端跨域访问）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 解析 JSON 请求体（用于 AI 代理）
app.use(express.json({ limit: '50mb' }));

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 临时文件存储
const upload = multer({ dest: path.join(os.tmpdir(), 'lexnote-uploads/') });

app.post('/api/convert', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未收到文件' });
  }

  const libreoffice = process.platform === 'darwin'
    ? '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    : 'libreoffice';

  if (process.platform !== 'darwin' && !fs.existsSync('/usr/bin/libreoffice') && !fs.existsSync('/usr/local/bin/libreoffice')) {
    return res.status(503).json({ error: '文档转换服务暂不可用（LibreOffice 未安装），云端部署请使用 PDF 格式' });
  }

  const inputPath = req.file.path;
  const outputDir = path.join(os.tmpdir(), 'lexnote-converted');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 关键：传入 HOME 环境变量和 -env:UserInstallation 参数
  // 否则 LibreOffice 首次运行无法完成"用户安装"（创建用户配置目录）
  // 注意：路径不能含空格，否则 LibreOffice 会崩溃，所以用 /tmp 下的路径
  const userInstallDir = '/tmp/libreoffice-user';
  if (!fs.existsSync(userInstallDir)) {
    fs.mkdirSync(userInstallDir, { recursive: true });
  }

  execFile(
    libreoffice,
    [
      '-env:UserInstallation=file://' + userInstallDir,
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      inputPath
    ],
    { timeout: 60000, env: { ...process.env, HOME: os.homedir() } },
    (err, stdout, stderr) => {
      console.log('LibreOffice stdout:', stdout);
      console.log('LibreOffice stderr:', stderr);
      if (err) {
        console.error('LibreOffice error:', err.message);
        // 清理临时文件
        fs.unlink(inputPath, () => {});
        return res.status(500).json({ error: '转换失败: ' + (stderr || err.message) });
      }

      // 输出文件名 = 输入文件名（multer 生成的随机名，换 .pdf 后缀）
      // 不能用 req.file.originalname，因为 LibreOffice 用 inputPath 的文件名生成输出
      const inputBaseName = path.basename(inputPath, path.extname(inputPath));
      const outputPath = path.join(outputDir, inputBaseName + '.pdf');

      if (!fs.existsSync(outputPath)) {
        fs.unlink(inputPath, () => {});
        return res.status(500).json({ error: '转换后文件未找到' });
      }

      // 返回 PDF 文件
      res.sendFile(outputPath, (err) => {
        // 发送后清理临时文件
        fs.unlink(inputPath, () => {});
        fs.unlink(outputPath, () => {});
      });
    }
  );
});

// ============ 翻译代理端点 ============
// 接收 { text, target? } 转发到 Google 翻译免费接口，避免 CORS
app.post('/api/translate', async (req, res) => {
  const { text, target = 'zh-CN' } = req.body;
  if (!text) return res.status(400).json({ error: '缺少待翻译文本' });

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`翻译服务错误 (${response.status})`);

    const data = await response.json();
    // data[0] 是翻译片段数组，每项 [translatedText, originalText, ...]
    const translated = (data[0] || []).map((item) => item[0]).join('');
    // data[2] 是检测到的源语言
    const detectedLang = data[2] || 'auto';
    res.json({ translated, detectedLang });
  } catch (err) {
    console.error('Translate error:', err.message);
    res.status(500).json({ error: err.message || '翻译失败' });
  }
});

// ============ HuggingFace 镜像代理 ============
// transformers.js 直接访问 hf-mirror.com 会被 CORS 拦截（且 307 重定向到相对路径）
// 这里服务端流式代理转发，绕过 CORS 和重定向，避免大模型文件全量加载到内存
// 用法：前端 env.remoteHost = '/api/hf'，请求 /api/hf/Xenova/opus-mt-en-zh/resolve/main/config.json
app.get('/api/hf/*', async (req, res) => {
  const subPath = req.params[0]; // catch-all 参数
  const url = `https://hf-mirror.com/${subPath}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow', // 服务端跟随重定向
    });
    if (!response.ok) {
      return res.status(response.status).send(`镜像请求失败: ${response.status}`);
    }
    // 透传关键头：content-length（transformers.js 读它显示进度）、content-type、accept-ranges、etag
    const passthroughHeaders = ['content-length', 'content-type', 'accept-ranges', 'etag', 'last-modified'];
    for (const h of passthroughHeaders) {
      const v = response.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    // 流式转发 body（不缓存到内存，支持大模型文件并发下载）
    // Node 18+ fetch 的 response.body 是 Web ReadableStream，用 pipeline 转 Node stream
    const { Readable } = require('stream');
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error('HF proxy error:', err.message);
    res.status(502).json({ error: '镜像代理失败: ' + err.message });
  }
});

// ============ AI 配置查询端点 ============
app.get('/api/ai-config', (req, res) => {
  res.json({
    hasServerKey: !!DEFAULT_AI_CONFIG.apiKey,
    defaultModel: DEFAULT_AI_CONFIG.model,
    defaultDoubaoMode: DEFAULT_AI_CONFIG.doubaoMode,
    defaultDoubaoModelName: DEFAULT_AI_CONFIG.doubaoModelName,
  });
});

// ============ AI 代理端点 ============
// 接收 { image, prompt, model, apiKey, history, doubaoMode, doubaoModelName, endpointId } 转发到多模态大模型
// 不传 apiKey 时使用服务端默认配置
app.post('/api/ai', async (req, res) => {
  let { image, prompt, model, apiKey, history, customEndpoint, doubaoMode, doubaoModelName, endpointId } = req.body;

  // 如果前端没传apiKey或传了空字符串，使用服务端默认配置
  const usingServerDefault = !apiKey;
  if (usingServerDefault) {
    apiKey = DEFAULT_AI_CONFIG.apiKey;
    model = model || DEFAULT_AI_CONFIG.model;
    doubaoMode = doubaoMode || DEFAULT_AI_CONFIG.doubaoMode;
    doubaoModelName = doubaoModelName || DEFAULT_AI_CONFIG.doubaoModelName;
    endpointId = endpointId || DEFAULT_AI_CONFIG.doubaoEndpointId;
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'API Key 未配置' });
  }

  const hasImage = !!image;
  let imageSizeKB = 0;
  if (image) {
    const b64 = image.startsWith('data:') ? image.split(',')[1] : image;
    imageSizeKB = Math.round(Buffer.byteLength(b64, 'base64') / 1024);
  }
  console.log(`[AI] request: model=${model}, doubaoMode=${doubaoMode}, hasImage=${hasImage}, imageSize=${imageSizeKB}KB, promptLen=${prompt?.length || 0}, historyLen=${history?.length || 0}, usingServerDefault=${usingServerDefault}`);

  try {
    let result;

    if (model === 'gpt-4o') {
      result = await callOpenAI(image, prompt, apiKey, 'gpt-4o', history);
    } else if (model === 'claude-3-5-sonnet') {
      result = await callAnthropic(image, prompt, apiKey, 'claude-3-5-sonnet-20241022', history);
    } else if (model === 'gemini-2.0-flash') {
      result = await callGemini(image, prompt, apiKey, 'gemini-2.0-flash', history);
    } else if (model === 'qwen-vl') {
      result = await callQwenVL(image, prompt, apiKey, history);
    } else if (model === 'doubao') {
      const modelId = doubaoMode === 'preset' ? doubaoModelName : endpointId;
      if (!modelId) {
        return res.status(400).json({ error: '请在设置中配置豆包模型' });
      }
      console.log(`[AI] calling Doubao: modelId=${modelId}, usePreset=${doubaoMode === 'preset'}`);
      result = await callDoubao(image, prompt, apiKey, modelId, doubaoMode === 'preset', history);
    } else if (model === 'custom' && customEndpoint) {
      result = await callOpenAI(image, prompt, apiKey, 'gpt-4o', history, customEndpoint);
    } else {
      return res.status(400).json({ error: '不支持的模型: ' + model });
    }

    console.log(`[AI] response: length=${result?.length || 0}`);
    res.json({ content: result });
  } catch (err) {
    console.error('[AI] proxy error:', err.message);
    res.status(500).json({ error: err.message || 'AI 调用失败' });
  }
});

// 豆包（火山方舟）：支持预制模型（responses API）和自定义接入点（chat/completions API）
async function callDoubao(image, prompt, apiKey, modelId, usePreset, history) {
  let url, requestBody;

  if (usePreset) {
    // 预制模型使用 /api/v3/responses 端点
    url = 'https://ark.cn-beijing.volces.com/api/v3/responses';

    // 构建 input 数组
    const input = [];
    // 历史对话转换格式（Responses API 要求 content 是对象数组）
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === 'assistant') {
          input.push({
            role: 'assistant',
            content: [{ type: 'output_text', text: msg.content }],
          });
        } else {
          input.push({
            role: 'user',
            content: [{ type: 'input_text', text: msg.content }],
          });
        }
      }
    }
    // 当前消息
    const currentContent = [];
    if (image) {
      currentContent.push({
        type: 'input_image',
        image_url: image.startsWith('data:') ? image : `data:image/png;base64,${image}`,
      });
    }
    currentContent.push({ type: 'input_text', text: prompt });
    input.push({ role: 'user', content: currentContent });

    requestBody = {
      model: modelId,
      input: input,
      thinking: { type: 'disabled' },
    };
  } else {
    // 自定义接入点使用 /api/v3/chat/completions 端点（OpenAI 兼容格式）
    url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

    const messages = [];
    if (history && history.length > 0) {
      messages.push(...history);
    }
    const content = [];
    if (image) {
      content.push({
        type: 'image_url',
        image_url: { url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` },
      });
    }
    content.push({ type: 'text', text: prompt });
    messages.push({ role: 'user', content });

    requestBody = { model: modelId, messages, max_tokens: 4096, thinking: { type: 'disabled' } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('豆包 API 请求超时（120秒），请稍后重试');
    }
    throw new Error(`豆包 API 网络错误: ${e.message}`);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const errText = await response.text();
    console.error('[AI] Doubao API error:', response.status, errText.slice(0, 500));
    throw new Error(`豆包 API 错误 (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();

  // 解析两种不同的响应格式
  if (usePreset) {
    // responses API 格式: data.output[0].content[0].text
    try {
      const output = data.output || [];
      for (const item of output) {
        if (item.type === 'message' && item.content) {
          for (const c of item.content) {
            if (c.type === 'output_text' && c.text) {
              return c.text;
            }
          }
        }
      }
      // 如果找不到，尝试返回整个响应的文本部分
      if (data.output_text) return data.output_text;
      console.error('[AI] Doubao unexpected response format:', JSON.stringify(data).slice(0, 500));
      return JSON.stringify(data);
    } catch (e) {
      return data.output_text || JSON.stringify(data);
    }
  } else {
    // chat/completions 格式: data.choices[0].message.content
    return data.choices[0].message.content;
  }
}

// OpenAI 格式（GPT-4o, 兼容自定义端点）
async function callOpenAI(image, prompt, apiKey, model, history, customUrl) {
  const url = customUrl || 'https://api.openai.com/v1/chat/completions';

  const messages = [];

  // 添加历史对话
  if (history && history.length > 0) {
    messages.push(...history);
  }

  // 当前消息：图片 + 文字
  const content = [];
  if (image) {
    content.push({
      type: 'image_url',
      image_url: { url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` },
    });
  }
  content.push({ type: 'text', text: prompt });
  messages.push({ role: 'user', content });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 4096 }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API 错误 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Anthropic Claude
async function callAnthropic(image, prompt, apiKey, model, history) {
  const url = 'https://api.anthropic.com/v1/messages';

  const content = [];
  if (image) {
    const base64 = image.startsWith('data:') ? image.split(',')[1] : image;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: base64 },
    });
  }
  content.push({ type: 'text', text: prompt });

  const body = {
    model,
    max_tokens: 4096,
    messages: [],
  };

  // 添加历史
  if (history && history.length > 0) {
    body.messages.push(...history.map(h => ({
      role: h.role,
      content: h.content,
    })));
  }

  body.messages.push({ role: 'user', content });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API 错误 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Google Gemini
async function callGemini(image, prompt, apiKey, model, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts = [];
  if (image) {
    const base64 = image.startsWith('data:') ? image.split(',')[1] : image;
    parts.push({ inline_data: { mime_type: 'image/png', data: base64 } });
  }
  parts.push({ text: prompt });

  const body = {
    contents: [{ role: 'user', parts }],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 错误 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// 通义千问 VL
async function callQwenVL(image, prompt, apiKey, history) {
  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  const messages = [];
  if (history && history.length > 0) {
    messages.push(...history);
  }

  const content = [];
  if (image) {
    content.push({
      type: 'image_url',
      image_url: { url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` },
    });
  }
  content.push({ type: 'text', text: prompt });
  messages.push({ role: 'user', content });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'qwen-vl-max', messages }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`通义千问 API 错误 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 静态文件服务：提供前端 dist 目录（生产部署用）
const distPath = path.join(__dirname, '..', 'dist');
console.log('Dist path:', distPath, 'exists:', fs.existsSync(distPath));
if (fs.existsSync(distPath)) {
  // 确保 .mjs 文件以正确的 MIME 类型提供（ES Module 需要）
  express.static.mime.define({'application/javascript': ['mjs']});
  express.static.mime.define({'application/wasm': ['wasm']});

  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      // 为 .mjs 文件显式设置正确的 MIME 类型
      if (filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      }
      // 带 hash 的静态资源（assets 目录下的 JS/CSS/字体/图片/WASM）设置长期缓存
      if (filePath.includes(path.sep + 'assets' + path.sep)) {
        // Vite 构建的文件名包含 content hash，内容变更时 hash 也变，可安全长期缓存
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // index.html 不缓存，确保每次都拿到最新版本
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));

  // SPA 路由 fallback：仅当路径不含扩展名、不是 /api/ 开头时返回 index.html
  app.get(/^\/(?!api)(?!.*\.\w+$)/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lexnote server running on http://0.0.0.0:${PORT}`);
});
