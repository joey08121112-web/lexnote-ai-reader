import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, FolderOpen, Palette, Info, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils';
import { useSettingsStore, type AIModel, type DoubaoMode } from '@/stores/settingsStore';

const PRESET_DOUBao_MODELS = [
  { value: 'doubao-1.5-vision-pro', label: 'doubao-1.5-vision-pro（推荐，支持图片）', vision: true },
  { value: 'doubao-seed-2-1-pro-260628', label: 'doubao-seed-2-1-pro-260628', vision: true },
  { value: 'doubao-1.5-pro-32k', label: 'doubao-1.5-pro-32k（文本）', vision: false },
];

export default function Settings() {
  const navigate = useNavigate();
  const {
    apiKey, model, customEndpoint, doubaoMode, doubaoModelName, doubaoEndpointId,
    setApiKey, setModel, setCustomEndpoint, setDoubaoMode, setDoubaoModelName, setDoubaoEndpointId
  } = useSettingsStore();
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-[#E8E4DE]">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold text-[#4A3F35]">设置</h1>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container mx-auto px-6 py-8 max-w-2xl">
        <div className="space-y-6">
          {/* AI 配置 */}
          <SettingsSection title="AI 大模型配置" icon={<Key className="w-5 h-5" />}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#6B5E54] mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入你的 API Key（以 ark- 开头）"
                  className="w-full px-4 py-2 rounded-xl border border-[#E8E4DE] bg-white text-[#4A3F35] focus:outline-none focus:border-[#D4A574] font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-[#6B5E54] mb-2">模型选择</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as AIModel)}
                  className="w-full px-4 py-2 rounded-xl border border-[#E8E4DE] bg-white text-[#4A3F35] focus:outline-none focus:border-[#D4A574]"
                >
                  <option value="doubao">豆包（火山方舟，推荐，免费额度大）</option>
                  <option value="gpt-4o">GPT-4o（支持图片）</option>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet（支持图片）</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash（支持图片）</option>
                  <option value="qwen-vl">通义千问 VL（支持图片）</option>
                  <option value="custom">自定义模型</option>
                </select>
              </div>

              {model === 'doubao' && (
                <div className="space-y-4 bg-[#FAF8F5] rounded-xl p-4">
                  {/* 接入模式切换 */}
                  <div>
                    <label className="block text-sm text-[#6B5E54] mb-2">接入方式</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDoubaoMode('preset')}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-lg text-sm transition-colors',
                          doubaoMode === 'preset'
                            ? 'bg-[#D4A574] text-white'
                            : 'bg-white border border-[#E8E4DE] text-[#6B5E54] hover:border-[#D4A574]'
                        )}
                      >
                        预制模型（推荐）
                      </button>
                      <button
                        onClick={() => setDoubaoMode('endpoint')}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-lg text-sm transition-colors',
                          doubaoMode === 'endpoint'
                            ? 'bg-[#D4A574] text-white'
                            : 'bg-white border border-[#E8E4DE] text-[#6B5E54] hover:border-[#D4A574]'
                        )}
                      >
                        自定义接入点
                      </button>
                    </div>
                  </div>

                  {doubaoMode === 'preset' ? (
                    <div>
                      <label className="block text-sm text-[#6B5E54] mb-2">预制模型</label>
                      <div className="relative">
                        <button
                          onClick={() => setShowModelDropdown(!showModelDropdown)}
                          className="w-full px-4 py-2 rounded-xl border border-[#E8E4DE] bg-white text-[#4A3F35] focus:outline-none focus:border-[#D4A574] text-left flex items-center justify-between"
                        >
                          <span className="text-sm">{doubaoModelName || '选择模型'}</span>
                          <ChevronDown className="w-4 h-4 text-[#9B8E84]" />
                        </button>
                        {showModelDropdown && (
                          <div className="absolute z-10 w-full mt-1 bg-white rounded-xl border border-[#E8E4DE] shadow-lg overflow-hidden">
                            {PRESET_DOUBao_MODELS.map((m) => (
                              <button
                                key={m.value}
                                onClick={() => {
                                  setDoubaoModelName(m.value);
                                  setShowModelDropdown(false);
                                }}
                                className={cn(
                                  'w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-[#FAF8F5] transition-colors',
                                  doubaoModelName === m.value && 'bg-[#D4A574]/10'
                                )}
                              >
                                <span className="text-[#4A3F35]">{m.label}</span>
                                {doubaoModelName === m.value && <Check className="w-4 h-4 text-[#D4A574]" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-[#9B8E84] mt-2">
                        ⚠️ AI截图解题需要选择支持视觉的模型（推荐 doubao-1.5-vision-pro）
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm text-[#6B5E54] mb-2">推理接入点 ID</label>
                      <input
                        type="text"
                        value={doubaoEndpointId}
                        onChange={(e) => setDoubaoEndpointId(e.target.value)}
                        placeholder="ep-2024xxxxxx-xxxxx"
                        className="w-full px-4 py-2 rounded-xl border border-[#E8E4DE] bg-white text-[#4A3F35] focus:outline-none focus:border-[#D4A574] font-mono text-sm"
                      />
                    </div>
                  )}

                  <div className="text-xs text-[#9B8E84] bg-white rounded-lg p-3 space-y-1">
                    <p className="font-medium text-[#6B5E54]">豆包接入步骤：</p>
                    <p>1. 注册火山引擎：https://www.volcengine.com/</p>
                    <p>2. 进入火山方舟控制台 → 开通服务（每日免费额度）</p>
                    <p>3. 左侧「API Key 管理」→ 创建 API Key → 复制到上方</p>
                    <p>4. 选择「预制模型」即可直接使用，无需创建接入点</p>
                  </div>
                </div>
              )}

              {model === 'custom' && (
                <div>
                  <label className="block text-sm text-[#6B5E54] mb-2">自定义 API 端点</label>
                  <input
                    type="text"
                    value={customEndpoint}
                    onChange={(e) => setCustomEndpoint(e.target.value)}
                    placeholder="https://your-api-endpoint.com/v1/chat/completions"
                    className="w-full px-4 py-2 rounded-xl border border-[#E8E4DE] bg-white text-[#4A3F35] focus:outline-none focus:border-[#D4A574]"
                  />
                </div>
              )}

              <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-[#166534] flex items-center gap-2">
                  <Check className="w-4 h-4" /> API Key 安全说明
                </p>
                <ul className="text-xs text-[#15803D] space-y-1 pl-6">
                  <li>✅ API Key 只保存在<strong>你自己的浏览器本地</strong>（localStorage），不会上传到任何公共服务器</li>
                  <li>✅ 后端代理只做请求转发，不会记录或存储你的 Key</li>
                  <li>✅ 别人访问演示网站时，使用的是他们自己浏览器里的 Key，<strong>看不到也用不了你的 Key</strong></li>
                  <li>✅ 通过后端代理调用，避免浏览器直接请求产生CORS问题</li>
                </ul>
              </div>
            </div>
          </SettingsSection>

          {/* Obsidian 配置 */}
          <SettingsSection title="Obsidian 同步" icon={<FolderOpen className="w-5 h-5" />}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#6B5E54] mb-2">Vault 路径</label>
                <input
                  type="text"
                  placeholder="选择 Obsidian Vault 目录"
                  className="w-full px-4 py-2 rounded-xl border border-[#E8E4DE] bg-white text-[#4A3F35] focus:outline-none focus:border-[#D4A574]"
                />
              </div>

              <Button variant="secondary" size="sm">
                选择目录
              </Button>

              <p className="text-xs text-[#9B8E84]">
                高亮内容和笔记将同步到 Obsidian 的 Markdown 文件中
              </p>
            </div>
          </SettingsSection>

          {/* 主题设置 */}
          <SettingsSection title="外观设置" icon={<Palette className="w-5 h-5" />}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#6B5E54] mb-2">主题</label>
                <div className="flex gap-3">
                  <button
                    className="flex-1 py-3 rounded-xl border-2 border-[#D4A574] bg-[#FAF8F5]"
                  >
                    <span className="text-[#4A3F35]">浅色模式</span>
                  </button>
                  <button
                    className="flex-1 py-3 rounded-xl border-2 border-[#E8E4DE] bg-white"
                  >
                    <span className="text-[#4A3F35]">深色模式</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-[#6B5E54] mb-2">高亮颜色</label>
                <div className="flex gap-2">
                  {(['yellow', 'green', 'blue', 'pink'] as const).map((color) => (
                    <div
                      key={color}
                      className={cn(
                        'w-8 h-8 rounded-full cursor-pointer',
                        color === 'yellow' && 'bg-[#FFEB99]',
                        color === 'green' && 'bg-[#C8E6C9]',
                        color === 'blue' && 'bg-[#BBDEFB]',
                        color === 'pink' && 'bg-[#F8BBD9]'
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* 关于 */}
          <SettingsSection title="关于 Lexnote" icon={<Info className="w-5 h-5" />}>
            <div className="space-y-2">
              <p className="text-[#4A3F35]">版本: 1.0.0 (原型演示)</p>
              <p className="text-sm text-[#6B5E54]">
                Lexnote 是一款智能学习应用，整合阅读、笔记、AI 辅助三大核心能力。
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm">使用指南</Button>
                <Button variant="ghost" size="sm">反馈建议</Button>
              </div>
            </div>
          </SettingsSection>
        </div>
      </main>
    </div>
  );
}

function SettingsSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-[#D4A574]">{icon}</div>
        <h2 className="font-semibold text-[#4A3F35]">{title}</h2>
      </div>
      {children}
    </div>
  );
}
