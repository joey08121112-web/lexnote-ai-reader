const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

if (typeof process !== 'undefined') {
  const PROXY_KEYS = ['http_proxy','https_proxy','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','all_proxy','no_proxy','NO_PROXY'];
  for (const k of PROXY_KEYS) { delete process.env[k]; }
  process.env.NO_PROXY = '*';
  process.env.no_proxy = '*';
}

const DEFAULT_AI_CONFIG = {
  apiKey: 'ark-82fca55c-1cba-4090-a5de-6f05ba3e0fd3-a3955',
  model: 'doubao',
  doubaoMode: 'preset',
  doubaoModelName: 'doubao-seed-2-1-pro-260628',
  doubaoEndpointId: '',
};

function createApp() {
  const app = express();

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

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
        if (err) {
          console.error('LibreOffice error:', err.message);
          fs.unlink(inputPath, () => {});
          return res.status(500).json({ error: '转换失败: ' + (stderr || err.message) });
        }

        const inputBaseName = path.basename(inputPath, path.extname(inputPath));
        const outputPath = path.join(outputDir, inputBaseName + '.pdf');

        if (!fs.existsSync(outputPath)) {
          fs.unlink(inputPath, () => {});
          return res.status(500).json({ error: '转换后文件未找到' });
        }

        res.sendFile(outputPath, () => {
          fs.unlink(inputPath, () => {});
          fs.unlink(outputPath, () => {});
        });
      }
    );
  });

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
      const translated = (data[0] || []).map((item) => item[0]).join('');
      const detectedLang = data[2] || 'auto';
      res.json({ translated, detectedLang });
    } catch (err) {
      console.error('Translate error:', err.message);
      res.status(500).json({ error: err.message || '翻译失败' });
    }
  });

  app.get('/api/hf/*', async (req, res) => {
    const subPath = req.params[0];
    const url = `https://hf-mirror.com/${subPath}`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      });
      if (!response.ok) {
        return res.status(response.status).send(`镜像请求失败: ${response.status}`);
      }
      const passthroughHeaders = ['content-length', 'content-type', 'accept-ranges', 'etag', 'last-modified'];
      for (const h of passthroughHeaders) {
        const v = response.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      const { Readable } = require('stream');
      Readable.fromWeb(response.body).pipe(res);
    } catch (err) {
      console.error('HF proxy error:', err.message);
      res.status(502).json({ error: '镜像代理失败: ' + err.message });
    }
  });

  app.get('/api/ai-config', (req, res) => {
    res.json({
      hasServerKey: !!DEFAULT_AI_CONFIG.apiKey,
      defaultModel: DEFAULT_AI_CONFIG.model,
      defaultDoubaoMode: DEFAULT_AI_CONFIG.doubaoMode,
      defaultDoubaoModelName: DEFAULT_AI_CONFIG.doubaoModelName,
    });
  });

  app.post('/api/ai', async (req, res) => {
    let { image, prompt, model, apiKey, history, customEndpoint, doubaoMode, doubaoModelName, endpointId } = req.body;

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
    console.log(`[AI] request: model=${model}, hasImage=${hasImage}, imageSize=${imageSizeKB}KB`);

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
          return res.status(400).json({ error: '请配置豆包模型' });
        }
        result = await callDoubao(image, prompt, apiKey, modelId, doubaoMode === 'preset', history);
      } else if (model === 'custom' && customEndpoint) {
        result = await callOpenAI(image, prompt, apiKey, 'gpt-4o', history, customEndpoint);
      } else {
        return res.status(400).json({ error: '不支持的模型: ' + model });
      }

      res.json({ content: result });
    } catch (err) {
      console.error('[AI] proxy error:', err.message);
      res.status(500).json({ error: err.message || 'AI 调用失败' });
    }
  });

  return app;
}

async function callDoubao(image, prompt, apiKey, modelId, usePreset, history) {
  let url, requestBody;

  if (usePreset) {
    url = 'https://ark.cn-beijing.volces.com/api/v3/responses';
    const input = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === 'assistant') {
          input.push({ role: 'assistant', content: [{ type: 'output_text', text: msg.content }] });
        } else {
          input.push({ role: 'user', content: [{ type: 'input_text', text: msg.content }] });
        }
      }
    }
    const currentContent = [];
    if (image) {
      currentContent.push({ type: 'input_image', image_url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` });
    }
    currentContent.push({ type: 'input_text', text: prompt });
    input.push({ role: 'user', content: currentContent });
    requestBody = { model: modelId, input, thinking: { type: 'disabled' } };
  } else {
    url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    const messages = [];
    if (history && history.length > 0) messages.push(...history);
    const content = [];
    if (image) content.push({ type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` } });
    content.push({ type: 'text', text: prompt });
    messages.push({ role: 'user', content });
    requestBody = { model: modelId, messages, max_tokens: 4096 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('请求超时，请稍后重试');
    throw new Error(`网络错误: ${e.message}`);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`豆包 API 错误 (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  if (usePreset) {
    const output = data.output || [];
    for (const item of output) {
      if (item.type === 'message' && item.content) {
        for (const c of item.content) {
          if (c.type === 'output_text' && c.text) return c.text;
        }
      }
    }
    return data.output_text || JSON.stringify(data);
  } else {
    return data.choices[0].message.content;
  }
}

async function callOpenAI(image, prompt, apiKey, model, history, customUrl) {
  const url = customUrl || 'https://api.openai.com/v1/chat/completions';
  const messages = [];
  if (history && history.length > 0) messages.push(...history);
  const content = [];
  if (image) content.push({ type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` } });
  content.push({ type: 'text', text: prompt });
  messages.push({ role: 'user', content });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 4096 }),
      signal: controller.signal,
    });
  } finally { clearTimeout(timeout); }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API 错误 (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(image, prompt, apiKey, model, history) {
  const url = 'https://api.anthropic.com/v1/messages';
  const content = [];
  if (image) {
    const base64 = image.startsWith('data:') ? image.split(',')[1] : image;
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } });
  }
  content.push({ type: 'text', text: prompt });
  const body = { model, max_tokens: 4096, messages: [] };
  if (history && history.length > 0) body.messages.push(...history.map(h => ({ role: h.role, content: h.content })));
  body.messages.push({ role: 'user', content });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API 错误 (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return data.content[0].text;
}

async function callGemini(image, prompt, apiKey, model, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const parts = [];
  if (image) {
    const base64 = image.startsWith('data:') ? image.split(',')[1] : image;
    parts.push({ inline_data: { mime_type: 'image/png', data: base64 } });
  }
  parts.push({ text: prompt });
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 错误 (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function callQwenVL(image, prompt, apiKey, history) {
  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  const messages = [];
  if (history && history.length > 0) messages.push(...history);
  const content = [];
  if (image) content.push({ type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/png;base64,${image}` } });
  content.push({ type: 'text', text: prompt });
  messages.push({ role: 'user', content });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'qwen-vl-max', messages }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`通义千问 API 错误 (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

function createFullServer() {
  const app = createApp();
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    express.static.mime.define({'application/javascript': ['mjs']});
    express.static.mime.define({'application/wasm': ['wasm']});
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.mjs')) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        if (filePath.includes(path.sep + 'assets' + path.sep)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }));
    app.get(/^\/(?!api)(?!.*\.\w+$)/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  return app;
}

module.exports = { createApp, createFullServer };
