const fs = require('node:fs');
const path = require('node:path');

const AGENT_REASONING_EFFORTS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

const DEFAULT_SEARCH_ENGINES = Object.freeze([
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
]);

const DEFAULT_NEW_TAB_SITES = Object.freeze([
  { id: 'google', name: 'Google', url: 'https://www.google.com/', icon: 'G' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/', icon: 'GH' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', icon: 'YT' },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://www.bilibili.com/', icon: '哔' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'AI' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/', icon: 'M' },
]);

const DEFAULT_STATE = Object.freeze({
  version: 1,
  profiles: [],
  nodes: [],
  subscriptions: [],
  extensions: [],
  passwordEntries: [],
  settings: {
    enginePath: '',
    engineVersion: '',
    engineSha256: '',
    engineInstalledAt: '',
    xrayPath: '',
    xrayVersion: '',
    xraySha256: '',
    xrayInstalledAt: '',
    singboxPath: '',
    singboxVersion: '',
    singboxSha256: '',
    singboxInstalledAt: '',
    defaultCore: 'xray',
    defaultStartUrl: 'https://example.com',
    agentApiUrl: '',
    agentProtocolSuffix: '',
    agentApi: '',
    agentKey: '',
    // Agent 对话页配置。agentKey 是兼容旧版本的加密 token 存储位。
    agentProtocol: 'openai-chat-completions',
    agentBaseUrl: '',
    agentModel: '',
    agentContextBudgetTokens: 200000,
    agentMaxOutputTokens: 8192,
    agentTemperature: 0.2,
    agentMaxSteps: 0,
    agentReasoningEffort: 'medium',
    // Agent 连接默认作用于所有环境；取消全部后由 agentProfileIds 指定环境。
    agentProfileScope: 'all',
    agentProfileIds: [],
    // 仅保存按环境覆盖的配置。密钥仍以 enc:/plain: 形式保存在主进程状态中。
    agentProfileOverrides: {},
    jevProvider: 'typesafe',
    jevBaseUrl: 'https://api.typesafe.ai',
    jevModel: 'jev-latest',
    jevKey: '',
    searchEngineUrl: 'https://www.google.com/search?q=%s',
    searchEngines: DEFAULT_SEARCH_ENGINES.map((item) => ({ ...item })),
    bookmarkBarAlwaysVisible: false,
    newTabSites: DEFAULT_NEW_TAB_SITES.map((item) => ({ ...item })),
    newTabBanner: { type: 'image', source: '' },
    newTabDisplayMode: 'immersive',
    browserShortcuts: {
      reload: 'F5',
      devtools: 'F12',
    },
    mouseGesture: {
      enabled: true,
      button: 'right',
      sequence: ['right', 'left'],
      threshold: 80,
      action: 'back',
    },
    theme: {
      preset: 'midnight',
      background: '#0f1423',
      surface: '#101f30',
      surfaceSoft: '#144a74',
      primary: '#2474b5',
      primaryHover: '#10aec2',
      secondary: '#0eb0c9',
      success: '#2c9678',
      warning: '#f7da94',
      danger: '#f1939c',
      text: '#f1f0ed',
      textMuted: '#9fa39a',
      textFaint: '#74787a',
      backgroundImage: '',
      backgroundOpacity: 0.72,
      blur: 18,
      radius: 12,
    },
  },
});

const THEME_HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const THEME_KEYS = [
  'background', 'surface', 'surfaceSoft', 'primary', 'primaryHover', 'secondary',
  'success', 'warning', 'danger', 'text', 'textMuted', 'textFaint',
];

function normalizeTheme(value, fallback = DEFAULT_STATE.settings.theme) {
  const source = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_STATE.settings.theme;
  const theme = {};
  for (const key of THEME_KEYS) {
    const candidate = typeof source[key] === 'string' ? source[key].trim() : '';
    const inherited = typeof base[key] === 'string' ? base[key] : DEFAULT_STATE.settings.theme[key];
    theme[key] = THEME_HEX_PATTERN.test(candidate) ? candidate.toLowerCase() : inherited;
  }
  const rawPreset = typeof source.preset === 'string' && source.preset.trim()
    ? source.preset.trim().slice(0, 32)
    : String(base.preset || 'midnight');
  const preset = ['midnight', 'ocean', 'ink', 'custom'].includes(rawPreset) ? rawPreset : 'custom';
  const hasImage = Object.prototype.hasOwnProperty.call(source, 'backgroundImage');
  const image = !hasImage
    ? String(base.backgroundImage || '')
    : typeof source.backgroundImage === 'string'
      && (!source.backgroundImage.trim()
        || (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(source.backgroundImage)
          && source.backgroundImage.length <= 8 * 1024 * 1024))
      ? source.backgroundImage.trim()
      : '';
  const numberOr = (candidate, inherited, min, max) => {
    const number = Number(candidate);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : inherited;
  };
  theme.preset = preset;
  theme.backgroundImage = image;
  theme.backgroundOpacity = Math.round(numberOr(source.backgroundOpacity, Number(base.backgroundOpacity ?? 0.72), 0, 1) * 100) / 100;
  theme.blur = Math.round(numberOr(source.blur, Number(base.blur ?? 18), 0, 40));
  theme.radius = Math.round(numberOr(source.radius, Number(base.radius ?? 12), 4, 24));
  return theme;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validSubscriptionSortOrder(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function normalizeSubscriptions(value) {
  const items = Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
  const explicit = items
    .map((item) => validSubscriptionSortOrder(item.sortOrder))
    .filter((item) => item !== null);
  let nextFallback = explicit.length ? Math.max(...explicit) + 1 : 0;
  return items
    .map((item, index) => ({
      ...item,
      sortOrder: validSubscriptionSortOrder(item.sortOrder) ?? (explicit.length ? nextFallback++ : index),
      originalIndex: index,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.originalIndex - right.originalIndex)
    .map(({ originalIndex, ...item }) => item);
}

function normalizeHttpUrl(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeSearchEngines(value) {
  const source = Array.isArray(value) ? value : DEFAULT_SEARCH_ENGINES;
  const seen = new Set();
  const result = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url.includes('%s')) continue;
    const normalizedUrl = normalizeHttpUrl(url);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    const idValue = typeof item.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(item.id.trim())
      ? item.id.trim()
      : `engine-${result.length + 1}`;
    seen.add(normalizedUrl);
    result.push({
      id: idValue,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 40) : '搜索引擎',
      url: normalizedUrl,
    });
    if (result.length >= 12) break;
  }
  if (!result.length) return DEFAULT_SEARCH_ENGINES.map((item) => ({ ...item }));
  return result;
}

function normalizeNewTabSites(value) {
  const source = Array.isArray(value) ? value : DEFAULT_NEW_TAB_SITES;
  const seen = new Set();
  const result = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const url = normalizeHttpUrl(item.url);
    if (!url || seen.has(url)) continue;
    const idValue = typeof item.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(item.id.trim())
      ? item.id.trim()
      : `site-${result.length + 1}`;
    seen.add(url);
    result.push({
      id: idValue,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 40) : new URL(url).hostname,
      url,
      icon: typeof item.icon === 'string' && item.icon.trim() ? item.icon.trim().slice(0, 8) : '↗',
    });
    if (result.length >= 24) break;
  }
  if (!result.length) return DEFAULT_NEW_TAB_SITES.map((item) => ({ ...item }));
  return result;
}

function normalizeNewTabBanner(value, fallback = DEFAULT_STATE.settings.newTabBanner) {
  const source = value && typeof value === 'object' ? value : {};
  const inherited = fallback && typeof fallback === 'object' ? fallback : { type: 'image', source: '' };
  const raw = typeof source.source === 'string' ? source.source.trim() : String(inherited.source || '');
  if (!raw) return { type: 'image', source: '' };
  const validRemote = /^https?:\/\/[^\s]+$/i.test(raw);
  const validData = /^data:(?:image\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+);base64,[a-z0-9+/=]+$/i.test(raw);
  if ((!validRemote && !validData) || raw.length > 8 * 1024 * 1024) return { ...inherited };
  const type = ['image', 'video', 'auto'].includes(String(source.type || '').toLowerCase())
    ? String(source.type).toLowerCase()
    : String(inherited.type || 'image');
  return { type, source: raw };
}

function normalizeNewTabDisplayMode(value, fallback = DEFAULT_STATE.settings.newTabDisplayMode) {
  const inherited = fallback === 'minimal' ? 'minimal' : 'immersive';
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return candidate === 'minimal' || candidate === 'immersive' ? candidate : inherited;
}

function mergeState(input) {
  const source = input && typeof input === 'object' ? input : {};
  const records = (value) => (Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : []);
  const sourceSettings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const settings = {
    ...DEFAULT_STATE.settings,
    ...sourceSettings,
    theme: normalizeTheme(sourceSettings.theme, DEFAULT_STATE.settings.theme),
    searchEngines: normalizeSearchEngines(sourceSettings.searchEngines),
    bookmarkBarAlwaysVisible: sourceSettings.bookmarkBarAlwaysVisible === true,
    newTabSites: normalizeNewTabSites(sourceSettings.newTabSites),
    newTabBanner: normalizeNewTabBanner(sourceSettings.newTabBanner, DEFAULT_STATE.settings.newTabBanner),
    newTabDisplayMode: normalizeNewTabDisplayMode(sourceSettings.newTabDisplayMode),
  };
  // 迁移早期浏览器设置里的 Agent 字段；新字段优先，旧字段只作为回退。
  if (!settings.agentBaseUrl && settings.agentApiUrl) settings.agentBaseUrl = settings.agentApiUrl;
  if (!settings.agentModel && settings.agentApi) settings.agentModel = settings.agentApi;
  if (!settings.agentApiUrl && settings.agentBaseUrl) settings.agentApiUrl = settings.agentBaseUrl;
  if (!settings.agentApi && settings.agentModel) settings.agentApi = settings.agentModel;
  if (settings.agentMaxSteps === '' || settings.agentMaxSteps === null || settings.agentMaxSteps === undefined) {
    settings.agentMaxSteps = DEFAULT_STATE.settings.agentMaxSteps;
  }
  if (!AGENT_REASONING_EFFORTS.has(String(settings.agentReasoningEffort || '').trim().toLowerCase())) {
    settings.agentReasoningEffort = DEFAULT_STATE.settings.agentReasoningEffort;
  }
  settings.agentProfileScope = settings.agentProfileScope === 'selected' ? 'selected' : 'all';
  settings.agentProfileIds = Array.isArray(settings.agentProfileIds)
    ? [...new Set(settings.agentProfileIds.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];
  settings.agentProfileOverrides = settings.agentProfileOverrides
    && typeof settings.agentProfileOverrides === 'object'
    && !Array.isArray(settings.agentProfileOverrides)
    ? Object.fromEntries(Object.entries(settings.agentProfileOverrides).filter(([, value]) => (
      value && typeof value === 'object' && !Array.isArray(value)
    )))
    : {};
  settings.jevProvider = settings.jevProvider === 'custom' ? 'custom' : 'typesafe';
  settings.jevBaseUrl = typeof settings.jevBaseUrl === 'string' ? settings.jevBaseUrl.trim() : DEFAULT_STATE.settings.jevBaseUrl;
  settings.jevModel = typeof settings.jevModel === 'string' ? settings.jevModel.trim() : DEFAULT_STATE.settings.jevModel;
  return {
    version: 1,
    profiles: records(source.profiles),
    nodes: records(source.nodes),
    subscriptions: normalizeSubscriptions(source.subscriptions),
    extensions: records(source.extensions),
    passwordEntries: records(source.passwordEntries),
    settings,
  };
}

function createStore(filePath) {
  let state = clone(DEFAULT_STATE);

  function load() {
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      state = mergeState(JSON.parse(text));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        state = clone(DEFAULT_STATE);
      }
    }
    return clone(state);
  }

  function save(nextState) {
    state = mergeState(nextState);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
    return clone(state);
  }

  function update(mutator) {
    const next = clone(state);
    mutator(next);
    return save(next);
  }

  return {
    load,
    save,
    update,
    get: () => clone(state),
  };
}

module.exports = {
  DEFAULT_STATE,
  createStore,
  mergeState,
  normalizeTheme,
  normalizeSearchEngines,
  normalizeNewTabSites,
  normalizeNewTabBanner,
  normalizeNewTabDisplayMode,
};
