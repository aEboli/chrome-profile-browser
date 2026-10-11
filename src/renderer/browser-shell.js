const params = new URLSearchParams(window.location.search);
let profileName = params.get('profileName') || '浏览器环境';
const brandName = params.get('brandName') || '简约指纹';
let startUrl = params.get('startUrl') || 'about:blank';
const partition = params.get('partition') || '';
const initialCountry = params.get('connectionCountry') || '系统直连';
const initialIp = params.get('connectionIp') || '未解析';
const initialLatency = params.get('connectionLatency') || '未测';
let connectionMode = params.get('connectionMode') || 'direct';
let connectionRefreshInFlight = false;
let connectionRouteSwitchInFlight = false;
let connectionRouteMenuRequest = 0;
const profileId = params.get('profileId') || '';
const DEFAULT_SEARCH_ENGINE_URL = 'https://www.google.com/search?q=%s';
const DEFAULT_SEARCH_ENGINES = [
  { id: 'google', name: 'Google', url: DEFAULT_SEARCH_ENGINE_URL },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
];
const DEFAULT_NEW_TAB_SITES = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/', icon: 'G' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/', icon: 'GH' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', icon: 'YT' },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://www.bilibili.com/', icon: '哔' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'AI' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/', icon: 'M' },
];
const DEFAULT_NEW_TAB_DISPLAY_MODE = 'immersive';
const DEFAULT_NEW_TAB_BACKGROUND_OPACITY = 0.72;
const DEFAULT_NEW_TAB_BACKGROUND_BLUR = 18;
const PAGE_LOAD_TIMEOUT_MS = 20000;
const AGENT_CONTEXT_COMPRESSION_RATIO = 0.9;
const AGENT_HUMAN_CLICK = Object.freeze({
  moveStepPixels: 84,
  moveDelayMs: 5,
  settleDelayMs: 28,
  pressDelayMs: 54,
  clickGapDelayMs: 62,
});

const pages = document.querySelector('#pages');
const pageFind = document.querySelector('#page-find');
const pageFindInput = document.querySelector('#page-find-input');
const pageFindCount = document.querySelector('#page-find-count');
const backButton = document.querySelector('#back');
const forwardButton = document.querySelector('#forward');
const reloadButton = document.querySelector('#reload');
const mutedSiteHosts = new Set();
let historyRevision = 0;
let downloadNoticeTimer = 0;
let nextFindToken = 0;
const pageViewport = document.querySelector('.page-viewport');
const passwordVaultPrompt = document.querySelector('#password-vault-prompt');
const shellInputModal = document.querySelector('#shell-input-modal');
const shellInputModalEyebrow = document.querySelector('#shell-input-modal-eyebrow');
const shellInputModalTitle = document.querySelector('#shell-input-modal-title');
const shellInputModalMessage = document.querySelector('#shell-input-modal-message');
const shellInputModalDetail = document.querySelector('#shell-input-modal-detail');
const shellInputModalField = document.querySelector('#shell-input-modal-field');
const shellInputModalLabel = document.querySelector('#shell-input-modal-label');
const shellInputModalValue = document.querySelector('#shell-input-modal-value');
const shellInputModalSubmit = document.querySelector('#shell-input-modal-submit');
const shellInputModalCancel = document.querySelector('#shell-input-modal-cancel');
const shellInputModalClose = document.querySelector('#shell-input-modal-close');
const tabs = document.querySelector('#tabs');
const tabActiveSurface = document.querySelector('#tab-active-surface');
const newTabButton = document.querySelector('#new-tab');
const tabMenuButton = document.querySelector('#tab-menu');
const tabSwitcherPanel = document.querySelector('#tab-switcher-panel');
const tabSwitcherSearch = document.querySelector('#tab-switcher-search');
const tabSwitcherOpenList = document.querySelector('#tab-switcher-open');
const tabSwitcherClosedList = document.querySelector('#tab-switcher-closed');
const connectionDetailsButton = document.querySelector('#connection-details');
const connectionRefreshSpinner = document.querySelector('#connection-refresh-spinner');
const connectionRefreshNotice = document.querySelector('#connection-refresh-notice');
const connectionRouteMenu = document.querySelector('#connection-route-menu');
let connectionRefreshNoticeTimer = 0;
const browserMoreToggle = document.querySelector('#browser-more-toggle');
const browserMoreMenu = document.querySelector('#browser-more-menu');
const browserSettingsToggle = document.querySelector('#browser-settings-toggle');
const browserSettingsPanel = document.querySelector('#browser-settings-panel');
const browserSettingsClose = document.querySelector('#browser-settings-close');
const browserSettingsForm = document.querySelector('#browser-settings-form');
const browserSettingsSave = document.querySelector('#browser-settings-save');
const browserSettingsCancel = document.querySelector('#browser-settings-cancel');
const browserSettingsStatus = document.querySelector('#browser-settings-status');
const agentApiUrlInput = document.querySelector('#setting-agent-api-url');
const agentProtocolSuffixInput = document.querySelector('#setting-agent-protocol-suffix');
const agentApiInput = document.querySelector('#setting-agent-api');
const agentKeyInput = document.querySelector('#setting-agent-key');
const agentKeyStatus = document.querySelector('#setting-agent-key-status');
const agentKeyClear = document.querySelector('#setting-agent-key-clear');
const searchEngineInput = document.querySelector('#setting-search-engine-url');
const shortcutReloadInput = document.querySelector('#setting-shortcut-reload');
const shortcutDevtoolsInput = document.querySelector('#setting-shortcut-devtools');
const gestureEnabledInput = document.querySelector('#setting-gesture-enabled');
const gestureButtonInput = document.querySelector('#setting-gesture-button');
const gestureSequenceInput = document.querySelector('#setting-gesture-sequence');
const gestureActionInput = document.querySelector('#setting-gesture-action');
const gestureThresholdInput = document.querySelector('#setting-gesture-threshold');
const searchEnginePresetInput = document.querySelector('#setting-search-engine-preset');
const bookmarkBarAlwaysInput = document.querySelector('#setting-bookmark-bar-always');
const newTabBannerTypeInput = document.querySelector('#setting-new-tab-banner-type');
const newTabBannerSourceInput = document.querySelector('#setting-new-tab-banner-source');
const newTabBannerFileInput = document.querySelector('#setting-new-tab-banner-file');
const newTabSitesEditor = document.querySelector('#new-tab-sites-editor');
const newTabSiteAdd = document.querySelector('#new-tab-site-add');
const browserSettingsAi = document.querySelector('#browser-settings-ai');
const agentSettingsToggle = document.querySelector('#agent-settings-toggle');
const agentSettingsPanel = document.querySelector('#agent-settings-panel');
const agentSettingsForm = document.querySelector('#agent-settings-form');
const agentThemeToggle = document.querySelector('#agent-theme-toggle');
const agentModelSummary = document.querySelector('#agent-model-summary');
const agentSettingsCancel = document.querySelector('#agent-settings-cancel');
const agentSettingsSave = document.querySelector('#agent-settings-save');
const agentSettingsStatus = document.querySelector('#agent-settings-status');
const agentProtocolInput = document.querySelector('#agent-setting-protocol');
const agentBaseUrlInput = document.querySelector('#agent-setting-base-url');
const agentModelInput = document.querySelector('#agent-setting-model');
const agentSettingModelRefresh = document.querySelector('#agent-setting-model-refresh');
const agentSettingModelOptions = document.querySelector('#agent-setting-model-options');
const agentSettingModelStatus = document.querySelector('#agent-setting-model-status');
const agentSettingScope = document.querySelector('#agent-setting-scope');
const agentTokenInput = document.querySelector('#agent-setting-token');
const agentTokenStatus = document.querySelector('#agent-setting-token-status');
const agentTokenClear = document.querySelector('#agent-setting-token-clear');
const agentContextInput = document.querySelector('#agent-setting-context');
const agentOutputInput = document.querySelector('#agent-setting-output');
const agentReasoningInput = document.querySelector('#agent-setting-reasoning');
const agentTemperatureInput = document.querySelector('#agent-setting-temperature');
const agentStepsInput = document.querySelector('#agent-setting-steps');
let webview = null;
let activeTabId = '';
let shellInterfaceZoom = null;
let nextTabId = 1;
const tabItems = [];
const TAB_GAP = 3;
const TAB_DRAG_THRESHOLD = 6;
let tabActiveSurfaceFrame = 0;
let tabDrag = null;
let suppressedTabClickId = '';
let nextClosedTabId = 1;
const recentlyClosedTabs = [];
let activeShellInput = null;
const address = document.querySelector('#address');
const addressSuggestions = document.querySelector('#address-suggestions');
const bookmarkToggle = document.querySelector('#bookmark-toggle');
const bookmarkStar = bookmarkToggle?.querySelector('.bookmark-star');
const bookmarkMenu = document.querySelector('#bookmark-menu');
const bookmarkFaviconObserver = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      bookmarkFaviconObserver.unobserve(entry.target);
      void loadBookmarkFaviconImage(entry.target);
    }
  }, { rootMargin: '48px' })
  : null;
const status = document.querySelector('#shell-status');
const zoomIndicator = document.querySelector('#zoom-indicator');
const loading = document.querySelector('#loading');
const extensionsToggle = document.querySelector('#extensions-toggle');
const extensionsPanel = document.querySelector('#extensions-panel');
const extensionsClose = document.querySelector('#extensions-close');
const extensionsList = document.querySelector('#extensions-list');
const extensionsEmpty = document.querySelector('#extensions-empty');
const extensionsCompatibility = document.querySelector('#extensions-compatibility');
const extensionsStatus = document.querySelector('#extensions-status');
const extensionCount = document.querySelector('#extension-count');
const downloadsToggle = document.querySelector('#downloads-toggle');
const downloadsPanel = document.querySelector('#downloads-panel');
const downloadsList = document.querySelector('#downloads-list');
const downloadsEmpty = document.querySelector('#downloads-empty');
const downloadCount = document.querySelector('#download-count');
const downloadsClear = document.querySelector('#downloads-clear');
const localListenersToggle = document.querySelector('#local-listeners-toggle');
const localListenersPanel = document.querySelector('#local-listeners-panel');
const localListenersRefresh = document.querySelector('#local-listeners-refresh');
const localListenersScheme = document.querySelector('#local-listeners-scheme');
const localListenersStatus = document.querySelector('#local-listeners-status');
const localListenersList = document.querySelector('#local-listeners-list');
const localListenersEmpty = document.querySelector('#local-listeners-empty');
const extensionToolbar = document.querySelector('#extension-toolbar');
const bookmarkBar = document.querySelector('#bookmark-bar');
const agentToggle = document.querySelector('#agent-toggle');
const agentPanel = document.querySelector('#agent-panel');
const agentClose = document.querySelector('#agent-close');
const agentState = document.querySelector('#agent-state');
const agentTaskTimer = document.querySelector('#agent-task-timer');
const agentContextTitle = document.querySelector('#agent-context-title');
const agentContextUrl = document.querySelector('#agent-context-url');
const agentHumanVerification = document.querySelector('#agent-human-verification');
const agentHumanVerificationMessage = document.querySelector('#agent-human-verification-message');
const agentHumanVerificationResume = document.querySelector('#agent-human-verification-resume');
const agentTranscript = document.querySelector('#agent-transcript');
const agentComposerForm = document.querySelector('#agent-composer-form');
const agentComposer = document.querySelector('#agent-composer');
const agentComposerAttachments = document.querySelector('#agent-composer-attachments');
const agentComposerAttachmentStatus = document.querySelector('#agent-composer-attachment-status');
const agentSend = document.querySelector('#agent-send');
const agentContextUsage = document.querySelector('#agent-context-usage');
const agentContextTooltip = document.querySelector('#agent-context-tooltip');
const agentContextTooltipPercent = document.querySelector('#agent-context-tooltip-percent');
const agentContextTooltipTokens = document.querySelector('#agent-context-tooltip-tokens');
const agentContextUsageUtils = window.browserAgentContextUsage;
const agentModelPicker = document.querySelector('#agent-model-picker');
const agentModelPickerStatus = document.querySelector('#agent-model-picker-status');
const agentModelOptions = document.querySelector('#agent-model-options');
const agentReasoningOptions = document.querySelector('#agent-reasoning-options');
const agentModelRefresh = document.querySelector('#agent-model-refresh');
const agentActions = window.browserAgentActions || {};
const agentRetry = window.browserAgentRetry || {};
let tornDown = false;
let extensionItems = [];
let agentBusy = false;
let lastPageTitle = '';
let agentPointer = null;
let agentExecution = Promise.resolve();
let agentConversation = [];
let agentRunSequence = 0;
let agentStopRequested = false;
let agentHumanVerificationWait = null;
let agentHumanVerificationPollTimer = null;
let agentHumanVerificationCheckInFlight = false;
let agentTaskQueue = [];
let agentTaskDrainPromise = null;
let agentModelFetchSequence = 0;
let agentThinkingRow = null;
let agentWelcomeShown = false;
let agentRetryController = null;
let agentRequestCancel = null;
let agentModelRequestId = '';
let agentTaskTimerHandle = null;
let agentTaskStartedAt = 0;
let agentTaskElapsedMs = 0;
let agentTaskTimerActive = false;
let agentContextLastCompressionTokens = 0;
let agentContextNoticeTimer = null;
const AGENT_IMAGE_DATA_URL_LIMIT = 10_000_000;
let agentComposerImages = [];
let nextAgentComposerImageId = 1;
let agentImageReadQueue = Promise.resolve();
let searchEngineUrl = DEFAULT_SEARCH_ENGINE_URL;
let searchEngines = DEFAULT_SEARCH_ENGINES.map((item) => ({ ...item }));
let bookmarks = [];
let bookmarkMenuContext = null;
let bookmarkMenuTrigger = null;
let bookmarkSubmenus = [];
let bookmarkHoverTimer = 0;
let bookmarkBarCommandVisible = false;
let browserDownloads = [];
let localListeners = [];
let localListenersRequest = 0;
let navigationHistory = [];
let recognizedNewTabSites = [];
let recognizedNewTabSitesLoaded = false;
let recentNewTabSearches = [];
const newTabSiteFaviconCache = window.NewTabSiteFaviconCache.create(
  () => window.localStorage,
  `new-tab-site-favicons:${profileId || 'default'}`,
);
const newTabSiteFaviconRequests = new Map();
let addressSuggestionIndex = -1;
let addressEditing = false;
let addressHiddenScheme = '';
let addressPointerDown = null;
let passwordPromptState = null;
let passwordPromptTimer = 0;
const ADDRESS_SCHEME_PATTERN = /^(?:https?|chrome):\/\//i;
let browserSettings = {
  agentApiUrl: '',
  agentProtocolSuffix: '',
  agentApi: '',
  agentKeySet: false,
  agentTokenSet: false,
  agentProtocol: 'openai-chat-completions',
  agentBaseUrl: '',
  agentModel: '',
  agentContextBudgetTokens: 200000,
  agentMaxOutputTokens: 8192,
  agentReasoningEffort: 'medium',
  agentTemperature: 0.2,
  agentMaxSteps: 0,
  agentEnabled: true,
  agentSource: 'global',
  agentProtocols: [],
  searchEngineUrl: DEFAULT_SEARCH_ENGINE_URL,
  searchEngines: DEFAULT_SEARCH_ENGINES.map((item) => ({ ...item })),
  bookmarkBarAlwaysVisible: false,
  newTabSites: DEFAULT_NEW_TAB_SITES.map((item) => ({ ...item })),
  newTabBanner: { type: 'image', source: '' },
  newTabDisplayMode: DEFAULT_NEW_TAB_DISPLAY_MODE,
  newTabBackgroundOpacity: DEFAULT_NEW_TAB_BACKGROUND_OPACITY,
  newTabBackgroundBlur: DEFAULT_NEW_TAB_BACKGROUND_BLUR,
  browserShortcuts: { reload: 'F5', devtools: 'F12' },
  mouseGesture: { enabled: true, button: 'right', sequence: ['right', 'left'], threshold: 80, action: 'back' },
};
let browserSettingsLoaded = false;
let clearAgentKeyRequested = false;
let clearAgentTokenRequested = false;
let draftNewTabSites = DEFAULT_NEW_TAB_SITES.map((item) => ({ ...item }));
let selectedBannerSource = '';
const AGENT_THEME_STORAGE_KEY = 'chrome-profile-browser.agent-theme';

function normalizeAgentTheme(value) {
  return String(value || '').toLowerCase() === 'light' ? 'light' : 'dark';
}

function readAgentTheme() {
  try {
    return normalizeAgentTheme(window.localStorage?.getItem(AGENT_THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

function setAgentTheme(nextTheme, { persist = true } = {}) {
  const theme = normalizeAgentTheme(nextTheme);
  if (agentPanel) agentPanel.dataset.theme = theme;
  if (document.body) document.body.dataset.agentTheme = theme;
  if (agentThemeToggle) {
    const nextLabel = theme === 'dark' ? '切换到浅色主题' : '切换到深色主题';
    agentThemeToggle.title = nextLabel;
    agentThemeToggle.setAttribute('aria-label', nextLabel);
  }
  if (persist) {
    try { window.localStorage?.setItem(AGENT_THEME_STORAGE_KEY, theme); } catch { /* storage may be unavailable */ }
  }
}

function setIdentityText(selector, value) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = value;
  element.title = value;
}

function connectionRefreshTitle() {
  if (connectionMode === 'subscription') return '左键重新测速并自动切换热节点，右键手动切换线路';
  if (connectionMode === 'node') return '左键重新检测当前节点延迟，右键手动切换线路';
  return '左键重新检测直连，右键手动切换线路';
}

function setConnectionRefreshState(refreshing) {
  if (!connectionDetailsButton) return;
  const busy = refreshing || connectionRouteSwitchInFlight;
  connectionDetailsButton.disabled = busy;
  connectionDetailsButton.setAttribute('aria-busy', busy ? 'true' : 'false');
  connectionDetailsButton.classList.toggle('is-refreshing', refreshing);
  connectionDetailsButton.classList.toggle('is-switching', connectionRouteSwitchInFlight);
  if (connectionRefreshSpinner) connectionRefreshSpinner.hidden = !busy;
  connectionDetailsButton.title = connectionRouteSwitchInFlight ? '切换线路中' : refreshing ? '检测中' : connectionRefreshTitle();
  connectionDetailsButton.setAttribute('aria-label', connectionDetailsButton.title);
}

function setConnectionRefreshNotice(label, kind = '', duration = 3500) {
  if (!connectionRefreshNotice) return;
  window.clearTimeout(connectionRefreshNoticeTimer);
  connectionRefreshNotice.hidden = !label;
  connectionRefreshNotice.textContent = label;
  connectionRefreshNotice.dataset.state = kind;
  if (label && duration > 0) {
    connectionRefreshNoticeTimer = window.setTimeout(() => {
      connectionRefreshNotice.hidden = true;
      connectionRefreshNotice.textContent = '';
    }, duration);
  }
}

function closeConnectionRouteMenu(restoreFocus = false) {
  connectionRouteMenuRequest += 1;
  if (connectionRouteMenu) {
    connectionRouteMenu.hidden = true;
    connectionRouteMenu.innerHTML = '';
  }
  connectionDetailsButton?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) connectionDetailsButton?.focus({ preventScroll: true });
}

function positionConnectionRouteMenu(x, y) {
  if (!connectionRouteMenu || connectionRouteMenu.hidden) return;
  const width = connectionRouteMenu.offsetWidth || 360;
  const height = connectionRouteMenu.offsetHeight || 320;
  const margin = 10;
  const anchor = connectionDetailsButton?.getBoundingClientRect?.();
  const requestedX = Number(x);
  const requestedY = Number(y);
  const anchorX = Number(anchor?.right) || margin;
  const anchorY = Number(anchor?.bottom) || margin;
  const left = Math.max(margin, Math.min(Number.isFinite(requestedX) && requestedX > 0 ? requestedX : anchorX, window.innerWidth - width - margin));
  const top = Math.max(margin, Math.min(Number.isFinite(requestedY) && requestedY > 0 ? requestedY : anchorY, window.innerHeight - height - margin));
  connectionRouteMenu.style.left = `${Math.round(left)}px`;
  connectionRouteMenu.style.top = `${Math.round(top)}px`;
}

function compactRouteMetadata(value) {
  return String(value || '未查询').trim().replace(/IP$/i, '').trim() || '未查询';
}

function renderConnectionRouteMenu(data = {}) {
  if (!connectionRouteMenu) return;
  if (data.loading) {
    connectionRouteMenu.innerHTML = '<div class="connection-route-menu-heading">手动切换线路</div><div class="connection-route-menu-status">正在读取线路…</div>';
    return;
  }
  if (data.error) {
    connectionRouteMenu.innerHTML = `<div class="connection-route-menu-heading">手动切换线路</div><div class="connection-route-menu-status connection-route-menu-status--error">${escapeHtml(data.error)}</div>`;
    return;
  }
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const groupMarkup = groups.map((group) => {
    const options = Array.isArray(group?.options) ? group.options : [];
    if (!options.length) return '';
    const optionMarkup = options.map((option) => {
      const type = escapeHtml(option.type || '');
      const nodeId = escapeHtml(option.nodeId || '');
      const subscriptionId = escapeHtml(option.subscriptionId || '');
      const labelText = option.label || '未命名线路';
      const metaText = option.meta || '';
      const label = escapeHtml(labelText);
      const meta = escapeHtml(metaText);
      const selected = option.selected === true;
      const disabled = option.disabled === true;
      const isNode = option.type === 'node';
      const ipAddressText = option.ipAddress || '未解析';
      const metadataValues = [option.country || '未查询', compactRouteMetadata(option.ipSource), compactRouteMetadata(option.ipProperty)];
      const metadataText = metadataValues.join(' · ');
      const latencyText = option.latency || '未测速';
      const latencyLabel = /ms$/i.test(latencyText) ? latencyText : `延迟：${latencyText}`;
      const metadataTone = option.ipSource?.includes('广播') ? 'broadcast'
        : option.ipProperty?.includes('住宅') ? 'residential'
          : option.ipProperty?.includes('机房') ? 'datacenter'
            : option.ipSource?.includes('原生') ? 'native' : 'unknown';
      const copy = isNode
        ? `<span class="connection-route-option-copy"><span class="connection-route-option-name" title="${escapeHtml(ipAddressText)}">${escapeHtml(ipAddressText)}</span><span class="connection-route-option-meta connection-route-option-meta--${metadataTone}" title="${escapeHtml(metadataText)}"><span>${escapeHtml(metadataValues[0])}</span><span>${escapeHtml(metadataValues[1])}</span><span>${escapeHtml(metadataValues[2])}</span></span><span class="connection-route-option-latency">${escapeHtml(latencyLabel)}</span></span>`
        : `<span class="connection-route-option-copy"><span class="connection-route-option-name">${label}</span><span class="connection-route-option-meta">${meta}</span></span>`;
      const accessibleLabel = isNode
        ? escapeHtml([labelText, metaText, ipAddressText, metadataText, latencyLabel].filter(Boolean).join(' · '))
        : label;
      return `<button class="connection-route-option${isNode ? ' connection-route-option--node' : ''}${selected ? ' is-selected' : ''}" type="button" role="menuitemradio" aria-checked="${selected ? 'true' : 'false'}" aria-label="${accessibleLabel}" title="${escapeHtml([labelText, metaText].filter(Boolean).join(' · '))}" data-connection-route-option data-route-type="${type}" data-node-id="${nodeId}" data-subscription-id="${subscriptionId}" data-route-label="${label}"${disabled ? ' disabled' : ''}>${copy}<span class="connection-route-option-mark" aria-hidden="true">${selected ? '✓' : ''}</span></button>`;
    }).join('');
    return `<section class="connection-route-group"><div class="connection-route-group-label">${escapeHtml(group.label || '线路')}</div>${optionMarkup}</section>`;
  }).join('');
  connectionRouteMenu.innerHTML = `<div class="connection-route-menu-heading">手动切换线路</div>${groupMarkup || '<div class="connection-route-menu-status">没有可用线路</div>'}`;
}

async function openConnectionRouteMenu(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!connectionRouteMenu || connectionRefreshInFlight || connectionRouteSwitchInFlight) return;
  dismissBrowserPopovers();
  const request = ++connectionRouteMenuRequest;
  connectionRouteMenu.hidden = false;
  connectionDetailsButton?.setAttribute('aria-expanded', 'true');
  renderConnectionRouteMenu({ loading: true });
  positionConnectionRouteMenu(event.clientX, event.clientY);
  try {
    if (typeof window.shellApi?.getConnectionRoutes !== 'function') throw new Error('线路切换服务未就绪，请重启应用后重试');
    const response = await window.shellApi.getConnectionRoutes();
    if (request !== connectionRouteMenuRequest || connectionRouteMenu.hidden) return;
    if (!response || response.ok === false) throw new Error(response?.error || '线路列表读取失败');
    renderConnectionRouteMenu(response);
    positionConnectionRouteMenu(event.clientX, event.clientY);
    connectionRouteMenu.querySelector('[data-connection-route-option]:not(:disabled)')?.focus();
  } catch (error) {
    if (request !== connectionRouteMenuRequest || connectionRouteMenu.hidden) return;
    renderConnectionRouteMenu({ error: error?.message || '线路列表读取失败' });
    positionConnectionRouteMenu(event.clientX, event.clientY);
    setShellStatus(error?.message || '线路列表读取失败', 'error');
  }
}

async function switchConnectionRoute(option) {
  if (!option || connectionRouteSwitchInFlight) return;
  const type = option.dataset.routeType || '';
  if (!['direct', 'node', 'subscription'].includes(type)) return;
  connectionRouteSwitchInFlight = true;
  closeConnectionRouteMenu();
  setConnectionRefreshState(false);
  const label = option.dataset.routeLabel || '目标线路';
  const input = {
    type,
    nodeId: option.dataset.nodeId || '',
    subscriptionId: option.dataset.subscriptionId || '',
  };
  setConnectionRefreshNotice(`正在切换到“${label}”…`, 'busy', 0);
  setShellStatus(`正在切换到“${label}”`, 'busy');
  try {
    if (typeof window.shellApi?.switchConnectionRoute !== 'function') throw new Error('线路切换服务未就绪，请重启应用后重试');
    const response = await window.shellApi.switchConnectionRoute(input);
    if (!response || response.ok === false) throw new Error(response?.error || '线路切换失败');
    if (response.cancelled) {
      setConnectionRefreshNotice('已取消线路切换', 'busy');
      setShellStatus('已取消线路切换', 'busy');
    } else {
      const message = type === 'subscription' ? `已启用“${label}”` : `已切换到“${label}”`;
      setConnectionRefreshNotice(message, 'success');
      setShellStatus(message, 'success');
    }
  } catch (error) {
    const message = error?.message || '线路切换失败';
    setConnectionRefreshNotice(message, 'error', 5000);
    setShellStatus(message, 'error');
  } finally {
    connectionRouteSwitchInFlight = false;
    setConnectionRefreshState(false);
  }
}

function applyConnectionDetails(details) {
  if (!details || typeof details !== 'object') return;
  if (details.mode) connectionMode = String(details.mode);
  setIdentityText('#connection-country', details.country || '未知国家');
  setIdentityText('#connection-ip', details.ip || '未解析');
  setIdentityText('#connection-latency', details.latency || '未测');
  setConnectionRefreshState(connectionRefreshInFlight);
}

setIdentityText('#profile-name', profileName);
setIdentityText('#connection-country', initialCountry);
setIdentityText('#connection-ip', initialIp);
setIdentityText('#connection-latency', initialLatency);
setConnectionRefreshState(false);
document.title = `${profileName} · ${brandName}`;
setAgentTheme(readAgentTheme(), { persist: false });

function searchUrlFor(query, template = searchEngineUrl) {
  const selected = String(template || '');
  const resolved = selected.includes('%s') ? selected : DEFAULT_SEARCH_ENGINE_URL;
  return resolved.replaceAll('%s', encodeURIComponent(query));
}

function looksLikeAddress(value) {
  if (/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:[/?#]|$)/i.test(value)) return true;
  if (/^\[[0-9a-f:]+\](?::\d+)?(?:[/?#]|$)/i.test(value)) return true;
  return /^[^\s/?#]+\.[^\s/?#]+(?::\d+)?(?:[/?#].*)?$/i.test(value);
}

function normalizedUrl(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return 'about:newtab';
  if (/^(?:https?:|about:|file:|data:|blob:|chrome:|chrome-extension:|view-source:)/i.test(trimmed)) return trimmed;
  return looksLikeAddress(trimmed) ? `https://${trimmed}` : searchUrlFor(trimmed);
}

function isNewTabUrl(value) {
  return String(value || '').toLowerCase() === 'about:newtab' || String(value || '').toLowerCase() === 'about:blank';
}

function isHistoryUrl(value) {
  return String(value || '').toLowerCase() === 'about:history';
}

function isShellPage(item) {
  return Boolean(item?.isNewTab || item?.isHistory);
}

function bookmarkableUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function currentBookmark() {
  const url = bookmarkableUrl(currentWebviewUrl());
  return bookmarks.find((item) => item.type === 'bookmark' && item.url === url) || null;
}

function renderBookmarkToggle() {
  if (!bookmarkToggle) return;
  const saved = Boolean(currentBookmark());
  if (bookmarkStar) bookmarkStar.textContent = saved ? '⭐' : '☆';
  bookmarkToggle.classList.toggle('is-saved', saved);
  bookmarkToggle.setAttribute('aria-pressed', saved ? 'true' : 'false');
  bookmarkToggle.setAttribute('aria-label', saved ? '移除收藏' : '添加收藏');
  bookmarkToggle.title = saved ? '移除收藏' : '添加收藏';
}

function activeTabIsNewTab() {
  return Boolean(activeTab()?.isNewTab);
}

function shouldShowBookmarkBar() {
  return Boolean(bookmarkBarCommandVisible || browserSettings.bookmarkBarAlwaysVisible || activeTabIsNewTab());
}

function bookmarkChildren(parentId = '') {
  return bookmarks.filter((item) => (item.parentId || '') === parentId);
}

function bookmarkById(bookmarkId) {
  return bookmarks.find((item) => item.id === bookmarkId) || null;
}

async function loadBookmarkFaviconImage(icon) {
  const item = bookmarkById(icon?.dataset.bookmarkId);
  if (!item || item.type !== 'bookmark' || !window.shellApi?.getBookmarkFavicon) return;
  try {
    const result = await window.shellApi.getBookmarkFavicon({
      id: item.id,
      favicon: icon.dataset.faviconCandidate || '',
    });
    if (result?.ok === false || !/^data:image\//i.test(result?.favicon || '')) return;
    if (!icon.isConnected) return;
    icon.src = result.favicon;
    icon.classList.remove('is-loading');
    icon.hidden = false;
    const fallback = icon.nextElementSibling;
    if (fallback) fallback.hidden = true;
    if (Array.isArray(result.bookmarks)) applyBookmarkState(result.bookmarks);
  } catch {
    // A missing site icon must not affect bookmark navigation.
  }
}

function createShellIcon(symbolId, className = 'shell-icon') {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', className);
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${symbolId}`);
  icon.append(use);
  return icon;
}

function createBookmarkEntryButton(item, inMenu = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = inMenu ? 'bookmark-menu-entry' : 'bookmark-bar-item';
  button.dataset.bookmarkEntryId = item.id;
  button.dataset.bookmarkEntryType = item.type;
  button.title = item.type === 'bookmark' ? item.url : item.title;
  button.setAttribute('aria-label', item.type === 'folder' ? `文件夹：${item.title}` : item.title || item.url);
  if (inMenu) button.setAttribute('role', 'menuitem');

  if (item.type === 'folder') {
    button.append(createShellIcon('shell-icon-folder', 'bookmark-folder-icon'));
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-controls', 'bookmark-menu');
    if (!inMenu) {
      button.setAttribute('aria-expanded', 'false');
    }
  } else {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'bookmark-site-icon';
    const icon = document.createElement('img');
    icon.className = 'bookmark-bar-item-icon';
    icon.alt = '';
    icon.loading = 'lazy';
    icon.dataset.bookmarkId = item.id;
    icon.dataset.faviconCandidate = item.favicon && !/^data:image\//i.test(item.favicon) ? item.favicon : '';
    const fallback = createShellIcon('shell-icon-bookmark', 'bookmark-fallback-icon');
    const hasDataIcon = /^data:image\//i.test(item.favicon || '');
    fallback.hidden = hasDataIcon;
    icon.addEventListener('error', () => {
      bookmarkFaviconObserver?.unobserve(icon);
      icon.hidden = true;
      fallback.hidden = false;
    });
    if (hasDataIcon) {
      icon.src = item.favicon;
      icon.hidden = false;
    } else {
      icon.classList.add('is-loading');
      if (bookmarkFaviconObserver) bookmarkFaviconObserver.observe(icon);
      else void loadBookmarkFaviconImage(icon);
    }
    iconWrap.append(icon, fallback);
    button.append(iconWrap);
  }

  const title = document.createElement('span');
  title.className = 'bookmark-bar-item-title';
  title.textContent = item.title || item.url;
  button.append(title);
  if (inMenu && item.type === 'folder') {
    button.setAttribute('aria-expanded', 'false');
    const arrow = document.createElement('span');
    arrow.className = 'bookmark-menu-submenu-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    button.append(arrow);
  }
  button.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    const current = bookmarkById(button.dataset.bookmarkEntryId);
    event.preventDefault();
    event.stopPropagation();
    if (current?.type === 'bookmark') openBookmarkEntry(current, { newTab: true, activate: event.shiftKey === true });
  });
  return button;
}

function renderBookmarkBar() {
  if (!bookmarkBar) return;
  bookmarkBar.textContent = '';
  const visible = shouldShowBookmarkBar();
  bookmarkBar.hidden = !visible;
  document.body.classList.toggle('bookmark-bar-visible', visible);
  if (!visible) {
    closeBookmarkMenu();
    return;
  }
  const rootItems = bookmarkChildren();
  if (!rootItems.length) {
    const empty = document.createElement('span');
    empty.className = 'bookmark-bar-empty';
    empty.textContent = '暂无收藏';
    bookmarkBar.append(empty);
  }
  for (const item of rootItems) bookmarkBar.append(createBookmarkEntryButton(item));
  const overflow = document.createElement('button');
  overflow.type = 'button';
  overflow.className = 'bookmark-bar-overflow';
  overflow.title = '显示更多收藏';
  overflow.setAttribute('aria-label', '显示更多收藏');
  overflow.setAttribute('aria-haspopup', 'menu');
  overflow.setAttribute('aria-controls', 'bookmark-menu');
  overflow.setAttribute('aria-expanded', 'false');
  overflow.textContent = '»';
  overflow.hidden = true;
  bookmarkBar.append(overflow);
  layoutBookmarkBarOverflow();
}

// 与 Chrome 一致：放不下的收藏收进末尾的“»”菜单，而不是让收藏栏横向滚动。
function layoutBookmarkBarOverflow() {
  if (!bookmarkBar || bookmarkBar.hidden) return;
  const overflow = bookmarkBar.querySelector('.bookmark-bar-overflow');
  if (!overflow) return;
  const items = [...bookmarkBar.querySelectorAll('[data-bookmark-entry-id]')];
  for (const item of items) item.hidden = false;
  overflow.hidden = true;
  if (!items.length) return;
  const barBounds = bookmarkBar.getBoundingClientRect();
  const limit = barBounds.right - (Number.parseFloat(getComputedStyle(bookmarkBar).paddingRight) || 0);
  if (items.at(-1).getBoundingClientRect().right <= limit) return;
  overflow.hidden = false;
  const itemLimit = limit - overflow.getBoundingClientRect().width - 4;
  let overflowing = false;
  for (const item of items) {
    overflowing = overflowing || item.getBoundingClientRect().right > itemLimit;
    item.hidden = overflowing;
  }
}

function applyBookmarkState(items) {
  bookmarks = Array.isArray(items) ? items : [];
  renderBookmarkToggle();
  renderBookmarkBar();
  for (const item of tabItems) if (item.isNewTab) renderNewTabPage(item);
  if (addressSuggestions?.hidden === false) renderAddressSuggestions();
}

function appendBookmarkMenuAction(label, action, { disabled = false, destructive = false } = {}, panel = bookmarkMenu) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `bookmark-menu-action${destructive ? ' is-destructive' : ''}`;
  button.setAttribute('role', 'menuitem');
  button.dataset.bookmarkAction = action;
  button.textContent = label;
  button.disabled = disabled;
  panel.append(button);
  return button;
}

function appendBookmarkMenuSeparator(panel = bookmarkMenu) {
  const separator = document.createElement('div');
  separator.className = 'bookmark-menu-separator';
  separator.setAttribute('role', 'separator');
  panel.append(separator);
}

function appendBookmarkFolderContents(panel, folderId) {
  panel.dataset.bookmarkFolderId = folderId;
  const children = bookmarkChildren(folderId);
  if (!children.length) {
    const empty = document.createElement('div');
    empty.className = 'bookmark-menu-empty';
    empty.textContent = '（空）';
    panel.append(empty);
    return;
  }
  for (const item of children) panel.append(createBookmarkEntryButton(item, true));
  const links = children.filter((item) => item.type === 'bookmark');
  if (!links.length) return;
  appendBookmarkMenuSeparator(panel);
  appendBookmarkMenuAction(`全部在新标签页中打开（${links.length}）`, 'open-all', {}, panel).dataset.bookmarkFolderId = folderId;
}

function openAllBookmarksInFolder(folderId) {
  const links = bookmarkChildren(folderId).filter((item) => item.type === 'bookmark');
  closeBookmarkMenu();
  for (const item of links) openBookmarkEntry(item, { newTab: true });
}

function bookmarkPanelLevel(panel) {
  return panel && panel !== bookmarkMenu ? Number(panel.dataset.bookmarkLevel) || 0 : 0;
}

function closeBookmarkSubmenus(level = 0) {
  while (bookmarkSubmenus.length > level) {
    const submenu = bookmarkSubmenus.pop();
    submenu.trigger.setAttribute('aria-expanded', 'false');
    submenu.trigger.classList.remove('is-open');
    submenu.panel.remove();
  }
}

function openBookmarkSubmenu(folderId, entry, { focus = false } = {}) {
  const parentPanel = entry?.closest('.bookmark-menu');
  if (!parentPanel || bookmarkById(folderId)?.type !== 'folder') return null;
  const level = bookmarkPanelLevel(parentPanel);
  const existing = bookmarkSubmenus[level];
  if (existing?.trigger === entry) {
    closeBookmarkSubmenus(level + 1);
    if (focus) existing.panel.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    return existing.panel;
  }
  closeBookmarkSubmenus(level);
  const panel = document.createElement('div');
  panel.className = 'bookmark-menu bookmark-submenu';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', bookmarkById(folderId).title);
  panel.dataset.bookmarkLevel = String(level + 1);
  appendBookmarkFolderContents(panel, folderId);
  panel.addEventListener('click', handleBookmarkMenuClick);
  panel.addEventListener('contextmenu', handleBookmarkMenuContextMenu);
  panel.addEventListener('keydown', handleBookmarkMenuKeydown);
  panel.addEventListener('mouseover', handleBookmarkMenuHover);
  document.body.append(panel);
  entry.setAttribute('aria-expanded', 'true');
  entry.classList.add('is-open');
  bookmarkSubmenus.push({ panel, trigger: entry, folderId });

  const margin = 8;
  const entryBounds = entry.getBoundingClientRect();
  const parentBounds = parentPanel.getBoundingClientRect();
  const bounds = panel.getBoundingClientRect();
  let left = parentBounds.right - 3;
  if (left + bounds.width > window.innerWidth - margin) left = parentBounds.left - bounds.width + 3;
  left = Math.max(margin, left);
  const top = Math.max(margin, Math.min(window.innerHeight - bounds.height - margin, entryBounds.top - 6));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  if (focus) panel.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  return panel;
}

function showBookmarkMenu(context, x, y, trigger = null) {
  if (!bookmarkMenu) return;
  closeBookmarkMenu();
  bookmarkMenuContext = context;
  bookmarkMenuTrigger = trigger;
  bookmarkMenu.textContent = '';
  delete bookmarkMenu.dataset.bookmarkFolderId;

  if (context.type === 'root' || context.type === 'create') {
    const currentUrl = bookmarkableUrl(currentWebviewUrl());
    const alreadySaved = bookmarks.some((item) => item.type === 'bookmark' && item.url === currentUrl);
    if (currentUrl) appendBookmarkMenuAction(alreadySaved ? '当前页面已收藏' : '添加当前页面', 'add-current', { disabled: alreadySaved });
    else appendBookmarkMenuAction('添加当前页面', 'add-current', { disabled: true });
    appendBookmarkMenuAction('新建文件夹', 'new-folder');
    const children = bookmarkChildren(context.parentId || '');
    if (children.length) {
      appendBookmarkMenuSeparator();
      for (const item of children) bookmarkMenu.append(createBookmarkEntryButton(item, true));
    }
  } else if (context.type === 'overflow') {
    const hiddenIds = [...(bookmarkBar?.querySelectorAll('[data-bookmark-entry-id][hidden]') || [])].map((item) => item.dataset.bookmarkEntryId);
    for (const id of hiddenIds) {
      const item = bookmarkById(id);
      if (item) bookmarkMenu.append(createBookmarkEntryButton(item, true));
    }
    bookmarkMenu.dataset.bookmarkFolderId = '';
  } else if (context.type === 'bookmark') {
    appendBookmarkMenuAction('在当前标签打开', 'open-current');
    appendBookmarkMenuAction('在新标签打开', 'open-new-tab');
    appendBookmarkMenuSeparator();
    appendBookmarkMenuAction('编辑收藏', 'edit-bookmark');
    appendBookmarkMenuAction('删除收藏', 'delete-bookmark', { destructive: true });
  } else if (context.type === 'folder') {
    const folder = bookmarkById(context.id);
    if (!folder || folder.type !== 'folder') return;
    if (context.showContents) {
      // 左键展开文件夹只显示内容，管理操作放在右键菜单中，与 Chrome 一致。
      appendBookmarkFolderContents(bookmarkMenu, folder.id);
    } else {
      const heading = document.createElement('div');
      heading.className = 'bookmark-menu-heading';
      heading.textContent = folder.title;
      bookmarkMenu.append(heading);
      appendBookmarkMenuAction('打开文件夹', 'open-folder');
      const linkCount = bookmarkChildren(folder.id).filter((item) => item.type === 'bookmark').length;
      appendBookmarkMenuAction(`全部在新标签页中打开（${linkCount}）`, 'open-all', { disabled: !linkCount });
      appendBookmarkMenuSeparator();
      appendBookmarkMenuAction('在文件夹中新建收藏', 'new-bookmark');
      appendBookmarkMenuAction('新建文件夹', 'new-folder');
      appendBookmarkMenuAction('重命名文件夹', 'rename-folder');
      appendBookmarkMenuAction('删除文件夹', 'delete-folder', { destructive: true });
    }
  }

  bookmarkMenu.hidden = false;
  bookmarkMenu.style.left = '0px';
  bookmarkMenu.style.top = '0px';
  const margin = 8;
  const bounds = bookmarkMenu.getBoundingClientRect();
  const left = Math.max(margin, Math.min(window.innerWidth - bounds.width - margin, x));
  const top = Math.max(margin, Math.min(window.innerHeight - bounds.height - margin, y));
  bookmarkMenu.style.left = `${left}px`;
  bookmarkMenu.style.top = `${top}px`;
  if (trigger?.getAttribute('aria-haspopup') === 'menu') trigger.setAttribute('aria-expanded', 'true');
  bookmarkMenu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

function closeBookmarkMenu(restoreFocus = false) {
  window.clearTimeout(bookmarkHoverTimer);
  closeBookmarkSubmenus(0);
  const trigger = bookmarkMenuTrigger;
  if (bookmarkMenuTrigger?.getAttribute('aria-haspopup') === 'menu') bookmarkMenuTrigger.setAttribute('aria-expanded', 'false');
  bookmarkMenuTrigger = null;
  bookmarkMenuContext = null;
  if (bookmarkMenu) bookmarkMenu.hidden = true;
  if (restoreFocus) {
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    else bookmarkBar?.focus({ preventScroll: true });
  }
}

function openBookmarkFolder(folderId, trigger = null) {
  const bounds = trigger?.getBoundingClientRect?.() || bookmarkMenu?.getBoundingClientRect?.();
  const x = bounds?.left ?? 12;
  const y = bookmarkMenu?.hidden === false && !trigger ? (bounds?.top ?? 50) : (bounds?.bottom ?? 50);
  showBookmarkMenu({ type: 'folder', id: folderId, showContents: true }, x, y, trigger);
}

function bookmarkOpensInNewTab(event) {
  return event?.button === 1 || event?.ctrlKey === true || event?.metaKey === true;
}

function openBookmarkEntry(item, { newTab = false, activate = true } = {}) {
  if (!item || item.type !== 'bookmark') return false;
  const url = bookmarkableUrl(item.url);
  if (!url) {
    closeBookmarkMenu();
    setShellStatus('收藏地址无效，无法打开', 'error');
    return false;
  }
  closeBookmarkMenu();
  if (newTab) {
    const created = createTab(url, { activate });
    if (!created) {
      setShellStatus('无法创建新标签页', 'error');
      return false;
    }
    return true;
  }
  navigateAddress(url);
  return true;
}

function handleBookmarkEntryClick(event, item, button) {
  if (!item) return;
  event.preventDefault();
  event.stopPropagation();
  if (item.type === 'folder') {
    if (button?.closest('.bookmark-menu')) {
      openBookmarkSubmenu(item.id, button);
      return;
    }
    if (bookmarkMenu?.hidden === false && bookmarkMenuTrigger === button) {
      closeBookmarkMenu();
      return;
    }
    openBookmarkFolder(item.id, button);
    return;
  }
  openBookmarkEntry(item, { newTab: bookmarkOpensInNewTab(event), activate: event.shiftKey === true });
}

function showBookmarkContextMenu(event, item) {
  event.preventDefault();
  event.stopPropagation();
  const type = item.type === 'folder' ? 'folder' : 'bookmark';
  showBookmarkMenu({ type, id: item.id, showContents: false }, event.clientX, event.clientY, event.target.closest('[data-bookmark-entry-id]'));
}

function showBookmarkRootMenu(event, parentId = '') {
  event.preventDefault();
  event.stopPropagation();
  showBookmarkMenu({ type: parentId ? 'create' : 'root', parentId }, event.clientX, event.clientY);
}

async function toggleBookmarkBar() {
  const next = !Boolean(browserSettings.bookmarkBarAlwaysVisible);
  try {
    const result = await window.shellApi?.saveSettings?.({ bookmarkBarAlwaysVisible: next });
    if (result?.ok === false) throw new Error(result.error || '收藏栏设置保存失败');
    renderBrowserSettings(result?.settings || { bookmarkBarAlwaysVisible: next });
    setShellStatus(next ? '收藏栏已在所有页面显示' : '收藏栏仅在新标签页显示');
  } catch (error) {
    setShellStatus(`收藏栏设置失败：${error.message || '未知错误'}`, 'error');
  }
}

function hideAddressSuggestions() {
  addressSuggestionIndex = -1;
  if (!addressSuggestions) return;
  addressSuggestions.hidden = true;
  address?.setAttribute('aria-expanded', 'false');
}

function addressValueForNavigation() {
  const value = String(address?.value || '');
  if (addressHiddenScheme && value && !ADDRESS_SCHEME_PATTERN.test(value)) return `${addressHiddenScheme}${value}`;
  return value;
}

function hideAddressSchemeForEditing() {
  if (!address || addressEditing) return;
  addressEditing = true;
  const value = address.value;
  const match = value.match(ADDRESS_SCHEME_PATTERN);
  if (!match) {
    addressHiddenScheme = '';
    return;
  }
  addressHiddenScheme = match[0];
  const prefixLength = addressHiddenScheme.length;
  const selectionStart = address.selectionStart;
  const selectionEnd = address.selectionEnd;
  const selectionDirection = address.selectionDirection;
  address.value = value.slice(prefixLength);
  if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
    address.setSelectionRange(
      Math.max(0, selectionStart - prefixLength),
      Math.max(0, selectionEnd - prefixLength),
      selectionDirection,
    );
  }
}

function revealAddressScheme() {
  if (!address || !addressHiddenScheme) return;
  const prefix = addressHiddenScheme;
  const value = address.value;
  const selectionStart = address.selectionStart;
  const selectionEnd = address.selectionEnd;
  const selectionDirection = address.selectionDirection;
  address.value = `${prefix}${value}`;
  if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
    const start = selectionStart === 0 ? 0 : selectionStart + prefix.length;
    const end = selectionEnd === 0 ? 0 : selectionEnd + prefix.length;
    address.setSelectionRange(start, end, selectionDirection);
  }
  addressHiddenScheme = '';
}

function finishAddressEditing() {
  if (!addressEditing) return;
  const value = address?.value || '';
  if (addressHiddenScheme) {
    if (ADDRESS_SCHEME_PATTERN.test(value)) addressHiddenScheme = '';
    else if (value && looksLikeAddress(value)) address.value = `${addressHiddenScheme}${value}`;
    else addressHiddenScheme = '';
  }
  addressHiddenScheme = '';
  addressEditing = false;
  addressPointerDown = null;
}

function beginAddressPointer(event) {
  if (!address || event.button !== 0) return;
  hideAddressSchemeForEditing();
  if (!addressHiddenScheme) return;
  addressPointerDown = { x: event.clientX, movedLeft: false };
}

function trackAddressPointer(event) {
  if (!addressPointerDown || !addressHiddenScheme || !(event.buttons & 1)) return;
  if (event.clientX < addressPointerDown.x - 2) addressPointerDown.movedLeft = true;
  const bounds = address.getBoundingClientRect();
  if (addressPointerDown.movedLeft && (event.clientX <= bounds.left + 3 || address.selectionStart === 0)) revealAddressScheme();
}

function endAddressPointer() {
  addressPointerDown = null;
}

function suggestionRecords(query) {
  const normalized = String(query || '').trim().toLocaleLowerCase();
  const records = [];
  const seen = new Set();
  const add = (record) => {
    if (!record?.url || seen.has(record.url)) return;
    if (normalized && !`${record.title} ${record.url}`.toLocaleLowerCase().includes(normalized)) return;
    seen.add(record.url);
    records.push(record);
  };
  for (const item of bookmarks) {
    if (item.type === 'bookmark') add({ kind: 'bookmark', title: item.title || '收藏', url: item.url });
  }
  for (const item of navigationHistory) add({ kind: 'history', title: item.title || '最近访问', url: item.url });
  const trimmed = String(query || '').trim();
  if (trimmed) {
    const direct = looksLikeAddress(trimmed) || /^(?:https?:|about:)/i.test(trimmed);
    add({
      kind: direct ? 'address' : 'search',
      title: direct ? '打开地址' : `搜索“${trimmed}”`,
      url: normalizedUrl(trimmed),
    });
  }
  return records.slice(0, 14);
}

function suggestionIcon(kind) {
  if (kind === 'bookmark') return 'bookmark';
  if (kind === 'search') return 'search';
  return kind === 'history' ? 'refresh' : 'open';
}

function renderAddressSuggestions() {
  if (!addressSuggestions || !address) return;
  const records = suggestionRecords(addressValueForNavigation());
  addressSuggestions.textContent = '';
  addressSuggestionIndex = Math.min(addressSuggestionIndex, records.length - 1);
  records.forEach((record, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `address-suggestion${index === addressSuggestionIndex ? ' is-active' : ''}`;
    button.dataset.suggestionIndex = String(index);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === addressSuggestionIndex ? 'true' : 'false');
    const icon = document.createElement('span');
    icon.className = 'address-suggestion-icon';
    icon.innerHTML = `<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-${suggestionIcon(record.kind)}"></use></svg>`;
    const copy = document.createElement('span');
    copy.className = 'address-suggestion-copy';
    const title = document.createElement('span');
    title.className = 'address-suggestion-title';
    title.textContent = record.title;
    const url = document.createElement('span');
    url.className = 'address-suggestion-url';
    url.textContent = record.url;
    copy.append(title, url);
    button.append(icon, copy);
    button.addEventListener('click', () => {
      addressSuggestionIndex = index;
      address.value = record.url;
      hideAddressSuggestions();
      navigateAddress(record.url);
    });
    addressSuggestions.append(button);
  });
  const open = records.length > 0;
  addressSuggestions.hidden = !open;
  address.setAttribute('aria-expanded', open ? 'true' : 'false');
  addressSuggestions.querySelector('.address-suggestion.is-active')?.scrollIntoView?.({ block: 'nearest' });
}

function showAddressSuggestions() {
  addressSuggestionIndex = -1;
  renderAddressSuggestions();
}

function selectAddressSuggestion(direction) {
  const count = addressSuggestions?.querySelectorAll('.address-suggestion').length || 0;
  if (!count) return false;
  addressSuggestionIndex = addressSuggestionIndex < 0
    ? direction > 0 ? 0 : count - 1
    : (addressSuggestionIndex + direction + count) % count;
  renderAddressSuggestions();
  return true;
}

function chooseActiveAddressSuggestion() {
  const item = addressSuggestions?.querySelectorAll('.address-suggestion')?.[addressSuggestionIndex];
  if (!item) return false;
  item.click();
  return true;
}

function applyBrowsingHistory(history) {
  historyRevision += 1;
  navigationHistory = Array.isArray(history) ? history : [];
  for (const item of tabItems) if (item.isHistory) renderHistoryPage(item, item.historyQuery || '');
}

async function refreshBrowsingHistory() {
  const revision = historyRevision;
  try {
    const result = await window.shellApi?.getHistory?.();
    if (result?.ok && revision === historyRevision) applyBrowsingHistory(result.history);
  } catch { /* A failed history read must not interrupt navigation. */ }
}

function recordNavigation() {
  void refreshBrowsingHistory();
}

function tabFallbackTitle(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'about:') return '新标签页';
    return parsed.hostname || '新标签页';
  } catch {
    return '新标签页';
  }
}

function mediaKindForBanner(banner) {
  const type = String(banner?.type || 'auto').toLowerCase();
  if (type === 'image' || type === 'video') return type;
  const source = String(banner?.source || '').toLowerCase();
  if (source.startsWith('data:video/')) return 'video';
  return /\.(?:mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(source) ? 'video' : 'image';
}

function bannerSourceValid(source) {
  return /^https?:\/\/[^\s]+$/i.test(source) || /^data:(?:image|video)\/[a-z0-9.+-]+;base64,/i.test(source);
}

function normalizeNewTabDisplayMode(value) {
  return String(value || '').trim().toLowerCase() === 'minimal' ? 'minimal' : DEFAULT_NEW_TAB_DISPLAY_MODE;
}

function normalizeNewTabBackgroundOpacity(value, fallback = DEFAULT_NEW_TAB_BACKGROUND_OPACITY) {
  const inherited = Number.isFinite(Number(fallback))
    ? Math.round(Math.min(1, Math.max(0, Number(fallback))) * 100) / 100
    : DEFAULT_NEW_TAB_BACKGROUND_OPACITY;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.round(Math.min(1, Math.max(0, number)) * 100) / 100
    : inherited;
}

function normalizeNewTabBackgroundBlur(value, fallback = DEFAULT_NEW_TAB_BACKGROUND_BLUR) {
  const inherited = Number.isFinite(Number(fallback))
    ? Math.round(Math.min(40, Math.max(0, Number(fallback))))
    : DEFAULT_NEW_TAB_BACKGROUND_BLUR;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.round(Math.min(40, Math.max(0, number)))
    : inherited;
}

function newTabBackgroundValues(settings = browserSettings) {
  const theme = settings?.theme && typeof settings.theme === 'object' ? settings.theme : {};
  const opacityFallback = normalizeNewTabBackgroundOpacity(theme.backgroundOpacity, DEFAULT_NEW_TAB_BACKGROUND_OPACITY);
  const blurFallback = normalizeNewTabBackgroundBlur(theme.blur, DEFAULT_NEW_TAB_BACKGROUND_BLUR);
  return {
    opacity: normalizeNewTabBackgroundOpacity(settings?.newTabBackgroundOpacity, opacityFallback),
    blur: normalizeNewTabBackgroundBlur(settings?.newTabBackgroundBlur, blurFallback),
  };
}

function syncNewTabDisplayControls() {
  for (const control of document.querySelectorAll('.new-tab-display-controls')) {
    control.syncAppearance?.();
  }
}

function applyNewTabAppearance() {
  const values = newTabBackgroundValues();
  const root = document.documentElement;
  root.style.setProperty('--shell-new-tab-opacity', String(values.opacity));
  root.style.setProperty('--shell-new-tab-blur', `${values.blur}px`);
  syncNewTabDisplayControls();
}

async function saveNewTabDisplayMode(value) {
  const nextMode = normalizeNewTabDisplayMode(value);
  const previousMode = normalizeNewTabDisplayMode(browserSettings.newTabDisplayMode);
  if (nextMode === previousMode) return;
  browserSettings.newTabDisplayMode = nextMode;
  for (const item of tabItems) if (item.isNewTab) renderNewTabPage(item);
  try {
    const result = await window.shellApi?.saveSettings?.({ newTabDisplayMode: nextMode });
    if (result?.ok === false) throw new Error(result.error || '显示模式保存失败');
    if (result?.settings) renderBrowserSettings(result.settings);
    setShellStatus(nextMode === 'immersive' ? '已切换到沉浸背景' : '已切换到简约指纹');
  } catch (error) {
    browserSettings.newTabDisplayMode = previousMode;
    for (const item of tabItems) if (item.isNewTab) renderNewTabPage(item);
    setShellStatus(`显示模式保存失败：${error.message || '未知错误'}`, 'error');
  }
}

let newTabBackgroundSaveQueue = Promise.resolve();

function saveNewTabBackgroundSettings() {
  const values = newTabBackgroundValues();
  browserSettings.newTabBackgroundOpacity = values.opacity;
  browserSettings.newTabBackgroundBlur = values.blur;
  newTabBackgroundSaveQueue = newTabBackgroundSaveQueue
    .catch(() => {})
    .then(async () => {
      try {
        const result = await window.shellApi?.saveSettings?.({
          newTabBackgroundOpacity: values.opacity,
          newTabBackgroundBlur: values.blur,
        });
        if (result?.ok === false) throw new Error(result.error || '背景效果保存失败');
        if (result?.settings) renderBrowserSettings(result.settings);
      } catch (error) {
        setShellStatus(`背景效果保存失败：${error.message || '未知错误'}`, 'error');
      }
    });
  return newTabBackgroundSaveQueue;
}

function createNewTabDisplayControl(controlId = '') {
  const control = document.createElement('div');
  control.className = 'new-tab-display-controls';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'new-tab-display-toggle';
  button.title = '切换显示模式';
  button.setAttribute('aria-label', '切换显示模式');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-layout"></use></svg>';
  const menu = document.createElement('div');
  menu.className = 'new-tab-display-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '新标签页显示模式');
  menu.hidden = true;
  const modes = [
    { id: 'immersive', label: '沉浸背景', icon: 'shell-icon-image' },
    { id: 'minimal', label: '简约指纹', icon: 'shell-icon-layout' },
  ];
  for (const mode of modes) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'new-tab-display-option';
    option.dataset.newTabDisplayMode = mode.id;
    option.setAttribute('role', 'menuitemradio');
    option.innerHTML = `<svg class="shell-icon" aria-hidden="true"><use href="#${mode.icon}"></use></svg><span>${mode.label}</span>`;
    menu.append(option);
  }
  const appearanceSettings = document.createElement('div');
  appearanceSettings.className = 'new-tab-display-settings';
  appearanceSettings.setAttribute('role', 'group');
  appearanceSettings.setAttribute('aria-label', '沉浸背景效果');
  const createAppearanceField = ({ key, label, min, max, step, format }) => {
    const field = document.createElement('label');
    field.className = 'new-tab-display-field';
    const heading = document.createElement('span');
    const title = document.createElement('span');
    title.textContent = label;
    const output = document.createElement('output');
    const inputId = `new-tab-display-${key}-${controlId || 'current'}`;
    output.htmlFor = inputId;
    heading.append(title, output);
    const input = document.createElement('input');
    input.id = inputId;
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.dataset.newTabAppearance = key;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => {
      const values = newTabBackgroundValues();
      const next = Number(input.value);
      if (key === 'newTabBackgroundOpacity') values.opacity = normalizeNewTabBackgroundOpacity(next);
      if (key === 'newTabBackgroundBlur') values.blur = normalizeNewTabBackgroundBlur(next);
      browserSettings.newTabBackgroundOpacity = values.opacity;
      browserSettings.newTabBackgroundBlur = values.blur;
      applyNewTabAppearance();
    });
    input.addEventListener('change', () => { void saveNewTabBackgroundSettings(); });
    field.append(heading, input);
    appearanceSettings.append(field);
    return { input, output, format };
  };
  const opacityControl = createAppearanceField({
    key: 'newTabBackgroundOpacity',
    label: '背景不透明度',
    min: 0,
    max: 1,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)}%`,
  });
  const blurControl = createAppearanceField({
    key: 'newTabBackgroundBlur',
    label: '背景模糊',
    min: 0,
    max: 40,
    step: 1,
    format: (value) => `${value}px`,
  });
  menu.append(appearanceSettings);
  const sync = () => {
    const activeMode = normalizeNewTabDisplayMode(browserSettings.newTabDisplayMode);
    button.dataset.mode = activeMode;
    for (const option of menu.querySelectorAll('[data-new-tab-display-mode]')) {
      const selected = option.dataset.newTabDisplayMode === activeMode;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  };
  const syncAppearance = () => {
    const values = newTabBackgroundValues();
    opacityControl.input.value = String(values.opacity);
    opacityControl.output.textContent = opacityControl.format(values.opacity);
    blurControl.input.value = String(values.blur);
    blurControl.output.textContent = blurControl.format(values.blur);
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    sync();
  });
  menu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-new-tab-display-mode]');
    if (!option) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    void saveNewTabDisplayMode(option.dataset.newTabDisplayMode);
  });
  control.syncAppearance = syncAppearance;
  control.append(button, menu);
  sync();
  syncAppearance();
  return control;
}

function createNewTabSiteButton(site) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'new-tab-site';
  button.title = site.url;
  const icon = document.createElement('span');
  icon.className = 'new-tab-site-icon';
  const image = document.createElement('img');
  image.className = 'new-tab-site-favicon';
  image.alt = '';
  image.decoding = 'async';
  image.loading = 'eager';
  image.hidden = true;
  const fallback = document.createElement('span');
  fallback.className = 'new-tab-site-fallback';
  fallback.textContent = site.icon || '↗';
  image.addEventListener('load', () => {
    image.hidden = false;
    fallback.hidden = true;
    icon.classList.add('has-image');
  });
  let faviconRetryRequested = false;
  let displayedFavicon = '';
  image.addEventListener('error', () => {
    image.hidden = true;
    fallback.hidden = false;
    icon.classList.remove('has-image');
    if (faviconRetryRequested || !displayedFavicon || newTabSiteFaviconCache.get(site.url) !== displayedFavicon) return;
    faviconRetryRequested = true;
    newTabSiteFaviconCache.delete(site.url);
    void loadNewTabSiteFavicon(site).then((favicon) => {
      if (!favicon || !image.isConnected) return;
      displayedFavicon = favicon;
      image.src = favicon;
    });
  });
  icon.append(image, fallback);
  const name = document.createElement('span');
  name.className = 'new-tab-site-name';
  name.textContent = site.name || site.url;
  button.append(icon, name);
  void loadNewTabSiteFavicon(site).then((favicon) => {
    if (!favicon || !image.isConnected) return;
    displayedFavicon = favicon;
    image.src = favicon;
  });
  button.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey) createTab(site.url, { activate: event.shiftKey === true });
    else navigateAddress(site.url);
  });
  button.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    createTab(site.url, { activate: event.shiftKey === true });
  });
  return button;
}

async function loadNewTabSiteFavicon(site) {
  if (!site || !window.shellApi?.getPageFavicon) return '';
  const url = String(site.url || '').trim();
  if (!url) return '';
  if (newTabSiteFaviconCache.has(url)) return newTabSiteFaviconCache.get(url);
  const pending = newTabSiteFaviconRequests.get(url);
  if (pending) return pending;
  const request = window.shellApi.getPageFavicon({
    url,
    favicon: typeof site.favicon === 'string' ? site.favicon : '',
  }).then((result) => {
    const favicon = /^data:image\//i.test(result?.favicon || '') ? result.favicon : '';
    if (favicon && newTabSitesForRender().some((site) => String(site.url || '').trim() === url)) {
      newTabSiteFaviconCache.set(url, favicon);
    }
    return favicon;
  }).catch(() => '');
  newTabSiteFaviconRequests.set(url, request);
  try {
    return await request;
  } finally {
    if (newTabSiteFaviconRequests.get(url) === request) newTabSiteFaviconRequests.delete(url);
  }
}

function newTabSiteHost(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function newTabSitesForRender() {
  const configured = Array.isArray(browserSettings.newTabSites) ? browserSettings.newTabSites : [];
  const configuredHosts = new Set(configured.map((site) => newTabSiteHost(site.url)).filter(Boolean));
  const seen = new Set();
  const sites = [];
  const add = (site) => {
    const host = newTabSiteHost(site.url);
    if (!host || seen.has(host)) return;
    seen.add(host);
    sites.push(site);
  };
  for (const site of recognizedNewTabSites) {
    if (!configuredHosts.has(newTabSiteHost(site.url))) add(site);
  }
  for (const site of configured) add(site);
  return sites;
}

function pruneRemovedNewTabSiteFavicons() {
  if (!browserSettingsLoaded || !recognizedNewTabSitesLoaded) return;
  newTabSiteFaviconCache.retain(newTabSitesForRender().map((site) => String(site.url || '').trim()));
}

async function refreshRecognizedNewTabSites() {
  if (!window.shellApi?.getCommonSites) return;
  try {
    const result = await window.shellApi.getCommonSites();
    if (result?.ok === false) return;
    recognizedNewTabSites = Array.isArray(result?.sites) ? result.sites : [];
    recognizedNewTabSitesLoaded = true;
    pruneRemovedNewTabSiteFavicons();
    for (const item of tabItems) if (item.isNewTab) renderNewTabPage(item);
  } catch {
    recognizedNewTabSites = [];
  }
}

async function recordCommonSiteVisit(url) {
  if (!window.shellApi?.recordCommonSiteVisit) return;
  try {
    const result = await window.shellApi.recordCommonSiteVisit(url);
    if (result?.ok !== true) return;
    recognizedNewTabSites = Array.isArray(result.sites) ? result.sites : [];
    for (const item of tabItems) if (item.isNewTab) renderNewTabPage(item);
  } catch {
    // Visit tracking must not interrupt page navigation.
  }
}

async function refreshNewTabSearchHistory() {
  if (!window.shellApi?.getSearchHistory) return;
  try {
    const result = await window.shellApi.getSearchHistory();
    if (result?.ok !== true) return;
    recentNewTabSearches = Array.isArray(result.searchHistory) ? result.searchHistory : [];
    for (const item of tabItems) if (item.isNewTab) item.refreshNewTabSearchSuggestions?.();
  } catch {
    recentNewTabSearches = [];
  }
}

async function recordNewTabSearch(query) {
  if (!window.shellApi?.recordSearchQuery) return;
  try {
    const result = await window.shellApi.recordSearchQuery(query);
    if (result?.ok !== true) return;
    recentNewTabSearches = Array.isArray(result.searchHistory) ? result.searchHistory : [];
    for (const item of tabItems) if (item.isNewTab) item.refreshNewTabSearchSuggestions?.();
  } catch {
    // Search must remain available if profile history cannot be saved.
  }
}

async function refreshNewTabPage(item) {
  if (!item?.isNewTab) return;
  renderNewTabPage(item);
  await Promise.allSettled([
    refreshRecognizedNewTabSites(),
    refreshNewTabSearchHistory(),
  ]);
}

function renderNewTabPage(item) {
  if (!item?.newTabView) return;
  const root = item.newTabView;
  root.replaceChildren();
  const displayMode = normalizeNewTabDisplayMode(browserSettings.newTabDisplayMode);
  root.dataset.displayMode = displayMode;
  const banner = browserSettings.newTabBanner || {};
  const bannerSource = String(banner.source || '').trim();
  const themeSource = String(browserSettings.theme?.backgroundImage || '').trim();
  const backgroundSource = themeSource || bannerSource;
  const displayControl = createNewTabDisplayControl(item.id);
  root.append(displayControl);
  if (displayMode === 'immersive' && backgroundSource && bannerSourceValid(backgroundSource)) {
    const media = document.createElement(mediaKindForBanner({ type: themeSource ? 'image' : banner.type, source: backgroundSource }) === 'video' ? 'video' : 'img');
    media.className = 'new-tab-media';
    media.src = backgroundSource;
    media.alt = '';
    if (media.tagName === 'VIDEO') {
      media.autoplay = true;
      media.loop = true;
      media.muted = true;
      media.playsInline = true;
    }
    media.addEventListener('error', () => { media.hidden = true; });
    root.append(media);
  }
  const scrim = document.createElement('div');
  scrim.className = 'new-tab-media-scrim';
  root.append(scrim);
  const content = document.createElement('div');
  content.className = 'new-tab-content';
  const brand = document.createElement('div');
  brand.className = 'new-tab-brand';
  brand.textContent = brandName;
  content.append(brand);
  if (displayMode === 'minimal' && bannerSource && bannerSourceValid(bannerSource)) {
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'new-tab-banner';
    const media = document.createElement(mediaKindForBanner(banner) === 'video' ? 'video' : 'img');
    media.className = 'new-tab-banner-media';
    media.src = bannerSource;
    if (media.tagName === 'VIDEO') {
      media.autoplay = true;
      media.loop = true;
      media.muted = true;
      media.playsInline = true;
    }
    media.addEventListener('error', () => { mediaWrap.hidden = true; });
    mediaWrap.append(media);
    content.append(mediaWrap);
  }
  const searchForm = document.createElement('form');
  searchForm.className = 'new-tab-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.placeholder = '搜索或输入网址';
  searchInput.setAttribute('aria-label', '搜索或输入网址');
  searchInput.setAttribute('aria-autocomplete', 'list');
  searchInput.setAttribute('aria-expanded', 'false');
  const searchSuggestions = document.createElement('div');
  searchSuggestions.className = 'new-tab-search-suggestions';
  searchSuggestions.id = `new-tab-search-suggestions-${item.id}`;
  searchSuggestions.setAttribute('role', 'listbox');
  searchSuggestions.setAttribute('aria-label', '最近搜索');
  searchSuggestions.hidden = true;
  searchInput.setAttribute('aria-controls', searchSuggestions.id);
  const searchSelect = document.createElement('select');
  searchSelect.setAttribute('aria-label', '搜索引擎');
  const engines = searchEngines.some((engine) => engine.url === searchEngineUrl)
    ? searchEngines
    : [...searchEngines, { id: 'current', name: '当前自定义', url: searchEngineUrl }];
  for (const engine of engines) {
    const option = document.createElement('option');
    option.value = engine.url;
    option.textContent = engine.name;
    option.selected = engine.url === searchEngineUrl;
    searchSelect.append(option);
  }
  searchSelect.addEventListener('change', () => {
    const nextEngine = searchSelect.value;
    if (!nextEngine || nextEngine === searchEngineUrl) return;
    searchEngineUrl = nextEngine;
    browserSettings.searchEngineUrl = nextEngine;
    void (async () => {
      try {
        const result = await window.shellApi?.saveSettings?.({ searchEngineUrl: nextEngine });
        if (result?.ok === false) throw new Error(result.error || '搜索引擎保存失败');
        renderBrowserSettings(result?.settings || { searchEngineUrl: nextEngine });
      } catch (error) {
        setShellStatus(`搜索引擎保存失败：${error.message || '未知错误'}`, 'error');
      }
    })();
  });
  const searchButton = document.createElement('button');
  searchButton.type = 'submit';
  searchButton.title = '搜索';
  searchButton.setAttribute('aria-label', '搜索');
  searchButton.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-search"></use></svg>';
  searchForm.append(searchInput, searchSelect, searchButton, searchSuggestions);
  const sites = document.createElement('div');
  sites.className = 'new-tab-sites';
  for (const site of newTabSitesForRender()) {
    sites.append(createNewTabSiteButton(site));
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'new-tab-site-add';
  add.title = '添加常用网站';
  add.setAttribute('aria-label', '添加常用网站');
  add.innerHTML = '<span class="new-tab-site-icon">+</span><span class="new-tab-site-name">添加</span>';
  add.addEventListener('click', () => void promptNewTabSite());
  sites.append(add);
  content.append(searchForm, sites);

  let selectedSearchIndex = -1;
  let searchInputFocused = false;
  let searchSuggestionsDismissed = false;
  const matchingSearches = () => {
    const needle = searchInput.value.trim().toLocaleLowerCase();
    return recentNewTabSearches.filter((query) => (
      !needle || String(query).toLocaleLowerCase().includes(needle)
    ));
  };
  const renderSearchSuggestions = () => {
    const matches = matchingSearches();
    if (selectedSearchIndex >= matches.length) selectedSearchIndex = -1;
    searchSuggestions.replaceChildren();
    matches.forEach((query, index) => {
      const suggestion = document.createElement('button');
      suggestion.type = 'button';
      suggestion.className = `new-tab-search-suggestion${index === selectedSearchIndex ? ' is-active' : ''}`;
      suggestion.id = `${searchSuggestions.id}-${index}`;
      suggestion.setAttribute('role', 'option');
      suggestion.setAttribute('aria-selected', index === selectedSearchIndex ? 'true' : 'false');
      const icon = document.createElement('span');
      icon.className = 'new-tab-search-suggestion-icon';
      icon.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-history"></use></svg>';
      const label = document.createElement('span');
      label.className = 'new-tab-search-suggestion-label';
      label.textContent = query;
      suggestion.append(icon, label);
      suggestion.addEventListener('pointerdown', (event) => event.preventDefault());
      suggestion.addEventListener('click', () => submitSearch(query));
      searchSuggestions.append(suggestion);
    });
    const open = searchInputFocused && !searchSuggestionsDismissed && matches.length > 0;
    searchSuggestions.hidden = !open;
    searchForm.classList.toggle('has-search-suggestions', open);
    searchInput.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && selectedSearchIndex >= 0) {
      searchInput.setAttribute('aria-activedescendant', `${searchSuggestions.id}-${selectedSearchIndex}`);
    } else {
      searchInput.removeAttribute('aria-activedescendant');
    }
    searchSuggestions.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' });
  };
  const updateSearchPresentation = () => {
    sites.hidden = Boolean(searchInput.value.trim());
    renderSearchSuggestions();
  };
  const submitSearch = (input) => {
    const value = String(input || '').trim();
    if (!value) return;
    const isDirectNavigation = looksLikeAddress(value) || /^(?:https?:|about:)/i.test(value);
    if (!isDirectNavigation) void recordNewTabSearch(value);
    navigateAddress(value, searchSelect.value);
  };
  searchInput.addEventListener('focus', () => {
    searchInputFocused = true;
    searchSuggestionsDismissed = false;
    updateSearchPresentation();
  });
  searchInput.addEventListener('blur', () => {
    searchInputFocused = false;
    searchSuggestionsDismissed = false;
    selectedSearchIndex = -1;
    renderSearchSuggestions();
  });
  searchInput.addEventListener('input', () => {
    selectedSearchIndex = -1;
    searchSuggestionsDismissed = false;
    updateSearchPresentation();
  });
  searchInput.addEventListener('keydown', (event) => {
    const matches = matchingSearches();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!searchInputFocused || !matches.length) return;
      event.preventDefault();
      searchSuggestionsDismissed = false;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      selectedSearchIndex = selectedSearchIndex < 0
        ? (direction > 0 ? 0 : matches.length - 1)
        : (selectedSearchIndex + direction + matches.length) % matches.length;
      renderSearchSuggestions();
      return;
    }
    if (event.key === 'Escape' && !searchSuggestions.hidden) {
      event.preventDefault();
      searchSuggestionsDismissed = true;
      selectedSearchIndex = -1;
      renderSearchSuggestions();
      return;
    }
    if (event.key === 'Enter' && selectedSearchIndex >= 0 && matches[selectedSearchIndex]) {
      event.preventDefault();
      submitSearch(matches[selectedSearchIndex]);
    }
  });
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitSearch(searchInput.value);
  });
  item.refreshNewTabSearchSuggestions = updateSearchPresentation;
  updateSearchPresentation();
  root.append(content);
}

function renderHistoryPage(item, query = '') {
  if (!item?.isHistory || !item.newTabView) return;
  const root = item.newTabView;
  const focused = root.contains(document.activeElement) && document.activeElement?.matches('input');
  const selection = focused ? document.activeElement.selectionStart : null;
  item.historyQuery = query;
  root.replaceChildren();
  root.className = 'history-view';
  root.setAttribute('aria-label', '历史记录');

  const header = document.createElement('header');
  header.className = 'history-view-header';
  const heading = document.createElement('div');
  heading.className = 'history-view-heading';
  const title = document.createElement('h1');
  title.textContent = '历史记录';
  const summary = document.createElement('p');
  summary.textContent = '当前浏览器环境最近访问的页面';
  heading.append(title, summary);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'history-view-clear';
  clear.textContent = '清空历史记录';
  clear.addEventListener('click', async () => {
    if (!await requestShellConfirmation({ title: '清空历史记录', message: '清空当前环境的全部浏览历史？' })) return;
    const result = await window.shellApi?.clearHistory?.();
    if (result?.ok) { applyBrowsingHistory(result.history); setShellStatus('历史记录已清空', 'success'); }
  });
  header.append(heading, clear);

  const controls = document.createElement('label');
  controls.className = 'history-view-search';
  const searchIcon = createShellIcon('shell-icon-search');
  const input = document.createElement('input');
  input.type = 'search';
  input.autocomplete = 'off';
  input.placeholder = '搜索历史记录';
  input.setAttribute('aria-label', '搜索历史记录');
  input.value = query;
  controls.append(searchIcon, input);

  const list = document.createElement('div');
  list.className = 'history-view-list';
  const needle = String(query || '').trim().toLocaleLowerCase();
  const records = navigationHistory.filter((record) => (
    !needle || `${record.title || ''} ${record.url || ''}`.toLocaleLowerCase().includes(needle)
  ));
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'history-view-empty';
    empty.textContent = navigationHistory.length ? '没有匹配的历史记录' : '暂无历史记录';
    list.append(empty);
  }
  for (const record of records) {
    const row = document.createElement('article');
    row.className = 'history-view-row';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'history-view-entry';
    open.title = record.url;
    open.addEventListener('click', () => navigateAddress(record.url));
    const icon = createShellIcon('shell-icon-history', 'history-view-icon');
    const copy = document.createElement('span');
    copy.className = 'history-view-copy';
    const recordTitle = document.createElement('strong');
    recordTitle.textContent = record.title || tabFallbackTitle(record.url);
    const recordUrl = document.createElement('span');
    recordUrl.textContent = record.url;
    copy.append(recordTitle, recordUrl);
    open.append(icon, copy);
    row.append(open);
    const time = document.createElement('time');
    const date = new Date(record.visitedAt);
    time.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.title = '删除此记录';
    remove.setAttribute('aria-label', `删除 ${record.title || record.url}`);
    remove.append(createShellIcon('shell-icon-close'));
    remove.addEventListener('click', async () => {
      const result = await window.shellApi?.deleteHistory?.(record.url);
      if (result?.ok) applyBrowsingHistory(result.history);
    });
    row.append(time, remove);
    list.append(row);
  }
  input.addEventListener('input', () => renderHistoryPage(item, input.value));
  root.append(header, controls, list);
  if (focused) { input.focus(); try { input.setSelectionRange(selection, selection); } catch {} }
}

function openHistoryPage() {
  const item = activeTab();
  if (!item) return;
  if (item.isHistory) {
    renderHistoryPage(item);
    activateTab(item.id);
    return;
  }
  resetTabToHistory(item);
  renderHistoryPage(item);
  activateTab(item.id);
}

function resetTabToHistory(item) {
  if (!item) return;
  if (passwordPromptState?.itemId === item.id) hidePasswordSavePrompt();
  clearPageLoadTimer(item);
  closePageFindFor(item);
  item.view?.remove?.();
  item.view = null;
  item.isNewTab = false;
  item.isHistory = true;
  item.loading = false;
  item.audible = false;
  item.muted = false;
  item.url = 'about:history';
  item.title = '历史记录';
  item.agentView = null;
  clearTabFavicon(item);
  resetPageDominantColor(item);
  item.accentSource = '';
  if (!item.newTabView) {
    item.newTabView = document.createElement('section');
    pages?.append(item.newTabView);
  }
  item.newTabView.className = 'history-view';
  item.newTabView.setAttribute('aria-label', '历史记录');
}

function newTabAgentRoot(item) {
  return item?.isNewTab ? item.newTabView : null;
}

function newTabAgentRect(item) {
  const root = newTabAgentRoot(item);
  const rect = typeof root?.getBoundingClientRect === 'function' ? root.getBoundingClientRect() : null;
  return {
    x: Number(rect?.x || 0),
    y: Number(rect?.y || 0),
    width: Math.max(0, Math.round(Number(rect?.width || root?.clientWidth || 0))),
    height: Math.max(0, Math.round(Number(rect?.height || root?.clientHeight || 0))),
  };
}

function newTabAgentText(value, max = 12000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function newTabAgentRead(item) {
  const root = newTabAgentRoot(item);
  const input = root?.querySelector?.('.new-tab-search input');
  const searchValue = input?.value ? ` 搜索框当前内容：${newTabAgentText(input.value, 500)}` : '';
  return {
    title: '新标签页',
    url: 'about:newtab',
    description: '',
    text: newTabAgentText(`${root?.innerText || root?.textContent || ''}${searchValue}`),
  };
}

function newTabAgentLinks(item) {
  const root = newTabAgentRoot(item);
  if (!root) return [];
  const records = [];
  for (const node of root.querySelectorAll('a[href], [title]')) {
    const href = node.href || node.getAttribute('title') || '';
    if (!/^(https?|mailto):/i.test(href)) continue;
    records.push({ text: newTabAgentText(node.innerText || node.textContent || href, 200), href });
  }
  return records.slice(0, 80);
}

function newTabAgentScroll(item, position) {
  const root = newTabAgentRoot(item);
  const content = root?.querySelector?.('.new-tab-content') || root;
  if (typeof content?.scrollTo === 'function') {
    content.scrollTo({ top: position === 'bottom' ? content.scrollHeight : 0, behavior: 'auto' });
  }
  return { ok: true, position: position === 'bottom' ? 'bottom' : 'top' };
}

function newTabAgentNode(item, selector) {
  const root = newTabAgentRoot(item);
  if (!root) return null;
  try { return root.querySelector(String(selector || '')); } catch { return null; }
}

function newTabAgentClick(item, selector) {
  const node = newTabAgentNode(item, selector);
  if (!node) return { ok: false, error: '未找到匹配元素' };
  if (typeof node.click !== 'function') return { ok: false, error: '元素不可点击' };
  node.click();
  return { ok: true, tag: node.tagName, text: newTabAgentText(node.innerText || node.value, 160) };
}

function newTabAgentFill(item, selector, value) {
  const node = newTabAgentNode(item, selector);
  if (!node) return { ok: false, error: '未找到匹配元素' };
  const nextValue = String(value || '');
  if ('value' in node) {
    node.focus();
    node.value = nextValue;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (node.isContentEditable) {
    node.focus();
    node.textContent = nextValue;
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: nextValue }));
  } else {
    return { ok: false, error: '元素不支持填写' };
  }
  return { ok: true, tag: node.tagName, valueLength: nextValue.length };
}

function newTabAgentSelect(item, selector, value) {
  const node = newTabAgentNode(item, selector);
  if (!node) return { ok: false, error: '未找到匹配元素' };
  if (node.tagName !== 'SELECT') return { ok: false, error: '元素不是下拉选择框' };
  const wanted = String(value || '');
  const option = Array.from(node.options || []).find((candidate) => candidate.value === wanted || String(candidate.textContent || '').trim() === wanted);
  if (!option) return { ok: false, error: '未找到匹配选项' };
  node.focus();
  node.value = option.value;
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, tag: node.tagName, value: node.value, label: newTabAgentText(option.textContent, 160) };
}

function executeNewTabAgentOperation(item, operation = {}) {
  const root = newTabAgentRoot(item);
  if (!root) throw new Error('当前页面暂不可操作');
  switch (String(operation.type || '')) {
    case 'read': return newTabAgentRead(item);
    case 'human-verification': return { required: false, reason: '', title: '新标签页', url: 'about:newtab' };
    case 'links': return newTabAgentLinks(item);
    case 'tables': return [];
    case 'scroll': return newTabAgentScroll(item, operation.position);
    case 'click': return newTabAgentClick(item, operation.selector);
    case 'fill': return newTabAgentFill(item, operation.selector, operation.value);
    case 'select': return newTabAgentSelect(item, operation.selector, operation.value);
    default: throw new Error('当前新标签页动作暂不支持');
  }
}

function newTabAgentElementAt(item, point) {
  const root = newTabAgentRoot(item);
  const rect = newTabAgentRect(item);
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!root || !Number.isFinite(x) || !Number.isFinite(y)
    || x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
  const node = document.elementFromPoint(rect.x + x, rect.y + y);
  return node && (node === root || root.contains(node)) ? node : null;
}

function newTabAgentKey(keyCode) {
  const value = String(keyCode || '');
  return ({
    Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp',
    Backspace: 'Backspace', Capslock: 'CapsLock', Control: 'Control', Delete: 'Delete',
    End: 'End', Enter: 'Enter', Escape: 'Escape', Home: 'Home', Meta: 'Meta',
    PageDown: 'PageDown', PageUp: 'PageUp', Shift: 'Shift', Space: ' ', Tab: 'Tab',
  })[value] || value;
}

function newTabAgentInsertText(item, value) {
  const root = newTabAgentRoot(item);
  const focused = root?.querySelector?.(':focus');
  const node = focused && ('value' in focused || focused.isContentEditable)
    ? focused
    : root?.querySelector?.('.new-tab-search input');
  if (!node) throw new Error('当前页面没有可输入的文本框');
  const text = String(value || '');
  if ('value' in node) {
    const start = Number.isInteger(node.selectionStart) ? node.selectionStart : node.value.length;
    const end = Number.isInteger(node.selectionEnd) ? node.selectionEnd : start;
    node.value = `${node.value.slice(0, start)}${text}${node.value.slice(end)}`;
    node.setSelectionRange?.(start + text.length, start + text.length);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    node.textContent = `${node.textContent || ''}${text}`;
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }
  return { ok: true, type: 'type', textLength: text.length };
}

function createNewTabAgentView(item) {
  const state = { pointerDown: null, modifiers: new Set() };
  const view = {
    get clientWidth() { return newTabAgentRect(item).width; },
    get clientHeight() { return newTabAgentRect(item).height; },
    getBoundingClientRect() {
      const rect = newTabAgentRect(item);
      return { ...rect, top: rect.y, left: rect.x, right: rect.x + rect.width, bottom: rect.y + rect.height };
    },
    getURL: () => 'about:newtab',
    getTitle: () => '新标签页',
    executeAgentOperation: (operation) => Promise.resolve(executeNewTabAgentOperation(item, operation)),
    focus: () => {
      const root = newTabAgentRoot(item);
      (root?.querySelector?.(':focus') || root?.querySelector?.('.new-tab-search input'))?.focus?.();
    },
    insertText: (value) => Promise.resolve(newTabAgentInsertText(item, value)),
    sendInputEvent: async (event = {}) => {
      const root = newTabAgentRoot(item);
      const target = newTabAgentElementAt(item, event);
      const button = ({ left: 0, middle: 1, right: 2 })[String(event.button || 'left')] ?? 0;
      const rect = newTabAgentRect(item);
      const clientX = rect.x + Number(event.x || 0);
      const clientY = rect.y + Number(event.y || 0);
      if (event.type === 'mouseWheel') {
        const content = root?.querySelector?.('.new-tab-content') || root;
        content?.dispatchEvent?.(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: event.deltaX || 0, deltaY: event.deltaY || 0, clientX, clientY }));
        content?.scrollBy?.({ left: -(event.deltaX || 0), top: -(event.deltaY || 0), behavior: 'auto' });
        return;
      }
      if (event.type === 'mouseMove' || event.type === 'mouseDown' || event.type === 'mouseUp') {
        if (!target) return;
        const mouseType = event.type === 'mouseMove' ? 'mousemove' : event.type === 'mouseDown' ? 'mousedown' : 'mouseup';
        target.dispatchEvent(new MouseEvent(mouseType, {
          bubbles: true, cancelable: true, view: window, button, buttons: event.type === 'mouseUp' ? 0 : 1,
          clientX, clientY, movementX: Number(event.movementX || 0), movementY: Number(event.movementY || 0),
        }));
        if (event.type === 'mouseDown') state.pointerDown = { node: target, button };
        if (event.type === 'mouseUp') {
          const down = state.pointerDown;
          state.pointerDown = null;
          if (button === 0 && down?.node === target) {
            if (Number(event.clickCount) === 2) target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window, button, clientX, clientY }));
            target.click?.();
          }
        }
        return;
      }
      if (event.type === 'rawKeyDown' || event.type === 'char' || event.type === 'keyUp') {
        const rootTarget = newTabAgentRoot(item);
        const focused = rootTarget?.querySelector?.(':focus') || rootTarget?.querySelector?.('.new-tab-search input');
        if (!focused) return;
        const key = newTabAgentKey(event.keyCode);
        if (event.type === 'rawKeyDown' && ['Alt', 'Control', 'Meta', 'Shift'].includes(String(event.keyCode))) state.modifiers.add(String(event.keyCode));
        focused.dispatchEvent(new KeyboardEvent(event.type === 'rawKeyDown' ? 'keydown' : event.type === 'keyUp' ? 'keyup' : 'keypress', {
          bubbles: true, cancelable: true, key, code: key, ctrlKey: state.modifiers.has('Control'), altKey: state.modifiers.has('Alt'), metaKey: state.modifiers.has('Meta'), shiftKey: state.modifiers.has('Shift'),
        }));
        if (event.type === 'char' && key.length === 1) newTabAgentInsertText(item, key);
        if (event.type === 'keyUp') {
          state.modifiers.delete(String(event.keyCode));
          if (key === 'Enter') {
            const form = focused.form || focused.closest?.('form');
            if (form?.requestSubmit) form.requestSubmit();
            else form?.dispatchEvent?.(new Event('submit', { bubbles: true, cancelable: true }));
            if (!form && focused.tagName === 'BUTTON') focused.click?.();
          }
        }
      }
    },
    capturePage: async () => {
      const result = await window.shellApi?.captureAgentPage?.(newTabAgentRect(item));
      if (!result || result.ok === false) throw new Error(result?.error || '新标签页截图失败');
      return result;
    },
  };
  return view;
}

function requestShellInput({ eyebrow = '浏览器操作', title = '输入内容', message = '', detail = '', label = '内容', value = '', confirmLabel = '确定', cancelLabel = '取消', isConfirmation = false, isDangerous = false } = {}) {
  if (!shellInputModal || !shellInputModalValue) return Promise.resolve(null);
  if (activeShellInput) closeShellInput(null);
  shellInputModalEyebrow.textContent = eyebrow;
  shellInputModalTitle.textContent = title;
  shellInputModalMessage.textContent = message;
  shellInputModalDetail.textContent = detail;
  shellInputModalDetail.hidden = !detail;
  shellInputModalField.hidden = isConfirmation;
  shellInputModalLabel.textContent = label;
  shellInputModalValue.value = value;
  shellInputModalSubmit.textContent = confirmLabel;
  shellInputModalSubmit.classList.toggle('is-danger', isDangerous);
  shellInputModalCancel.textContent = cancelLabel;
  shellInputModal.hidden = false;
  window.setTimeout(() => {
    const focusTarget = isConfirmation ? shellInputModalSubmit : shellInputModalValue;
    focusTarget.focus();
    if (!isConfirmation) shellInputModalValue.select();
  }, 0);
  return new Promise((resolve) => {
    activeShellInput = { resolve, previousActiveElement: document.activeElement, isConfirmation };
  });
}

function requestShellConfirmation(options = {}) {
  return requestShellInput({ ...options, isConfirmation: true, value: '' }).then((confirmed) => confirmed === true);
}

function closeShellInput(value = null) {
  const pending = activeShellInput;
  if (!pending) return;
  activeShellInput = null;
  if (shellInputModal) shellInputModal.hidden = true;
  window.setTimeout(() => pending.previousActiveElement?.focus?.(), 0);
  pending.resolve(value);
}

async function promptNewTabSite() {
  const name = await requestShellInput({ title: '添加常用网站', message: '为新标签页添加一个常用网站。', label: '网站名称', value: '新网站' });
  if (name === null) return;
  const url = await requestShellInput({ title: '添加常用网站', message: '输入要打开的网站地址。', label: '网站地址', value: 'https://' });
  if (url === null) return;
  const trimmedUrl = url.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(trimmedUrl)) {
    setShellStatus('网站地址必须是 HTTP(S) URL', 'error');
    return;
  }
  let hostname = '新网站';
  try { hostname = new URL(trimmedUrl).hostname || hostname; } catch {
    setShellStatus('网站地址无效', 'error');
    return;
  }
  const icon = await requestShellInput({ title: '添加常用网站', message: '可选：设置一个简短的图标文字。', label: '图标文字', value: String(name).trim().slice(0, 2) || '↗' });
  const next = [...(browserSettings.newTabSites || []), {
    id: `site-${Date.now()}`,
    name: String(name).trim().slice(0, 40) || hostname,
    url: trimmedUrl,
    icon: String(icon || '↗').trim().slice(0, 8) || '↗',
  }];
  try {
    const result = await window.shellApi?.saveSettings?.({ newTabSites: next });
    if (result?.ok === false) throw new Error(result.error || '常用网站保存失败');
    renderBrowserSettings(result?.settings || { newTabSites: next });
    setShellStatus('常用网站已添加');
  } catch (error) {
    setShellStatus(`常用网站保存失败：${error.message || '未知错误'}`, 'error');
  }
}

function setShellStatus(label, kind = '') {
  if (!status) return;
  status.title = label;
  status.setAttribute('aria-label', label);
  status.dataset.state = kind;
  const hiddenLabel = status.querySelector('.sr-only');
  if (hiddenLabel) hiddenLabel.textContent = label;
}

async function refreshConnection() {
  if (connectionRefreshInFlight) return;
  if (!profileId) {
    const message = '当前浏览器环境标识缺失，请关闭后重新打开环境';
    setConnectionRefreshNotice(message, 'error', 5000);
    setShellStatus(message, 'error');
    return;
  }
  if (typeof window.shellApi?.refreshConnection !== 'function') {
    const message = '连接检测服务未就绪，请重启应用后重试';
    setConnectionRefreshNotice(message, 'error', 5000);
    setShellStatus(message, 'error');
    return;
  }
  connectionRefreshInFlight = true;
  setConnectionRefreshState(true);
  setConnectionRefreshNotice('正在检测连接…', 'busy', 0);
  setShellStatus('正在检测连接', 'busy');
  try {
    const response = await window.shellApi.refreshConnection();
    if (!response || typeof response !== 'object') throw new Error('连接检测服务未返回结果，请重启应用后重试');
    if (response?.ok === false) throw new Error(response.error || '连接检测失败');
    const result = response?.result;
    if (response?.mode === 'subscription') {
      if (response.available !== true) {
        setConnectionRefreshNotice('订阅暂无可用线路', 'error', 5000);
        setShellStatus('订阅暂无可用线路', 'error');
      } else if (response.switched) {
        const route = response.nodeName ? `“${response.nodeName}”` : '热节点';
        const latency = Number.isFinite(Number(response.latencyMs)) ? ` · ${Math.round(Number(response.latencyMs))} ms` : '';
        const message = `已切换到 ${route}${latency}；出口 IP 可能变化`;
        setConnectionRefreshNotice(message, 'success', 5000);
        setShellStatus(message, 'success');
      } else {
        setConnectionRefreshNotice('订阅线路已重新测速', 'success');
        setShellStatus('订阅线路已重新测速', 'success');
      }
    } else if (result?.ok === false) {
      const message = response?.mode === 'node' ? '当前节点不可达' : '直连不可达';
      setConnectionRefreshNotice(message, 'error', 5000);
      setShellStatus(message, 'error');
    } else {
      const message = response?.mode === 'node' ? '当前节点延迟已更新' : '直连延迟已更新';
      setConnectionRefreshNotice(message, 'success');
      setShellStatus(message, 'success');
    }
  } catch (error) {
    const errorMessage = error?.message || '';
    const message = errorMessage.includes('No handler registered')
      && errorMessage.includes('browser-shell:refresh-connection')
      ? '连接检测服务未就绪，请重启应用后重试'
      : errorMessage || '连接检测失败';
    setConnectionRefreshNotice(message, 'error', 5000);
    setShellStatus(message, 'error');
  } finally {
    connectionRefreshInFlight = false;
    setConnectionRefreshState(false);
  }
}

function syncTabActiveSurface() {
  const activeSurface = tabActiveSurface || tabs?.querySelector('.tab-active-surface');
  const active = tabs?.querySelector('.browser-tab.is-active');
  if (!activeSurface || !active) return;
  activeSurface.style.setProperty('--tab-accent', active.dataset.tabAccent || '#6d96ff');
  activeSurface.style.setProperty('--tab-page-color', active.dataset.pageColor || '');
  activeSurface.style.width = `${active.offsetWidth}px`;
  activeSurface.style.transform = `translate3d(${active.offsetLeft}px, -50%, 0)`;
}

function fallbackTabAccent(seed = '') {
  let hash = 0;
  for (const character of String(seed)) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 58%)`;
}

function tabTextColor(color) {
  const match = String(color || '').match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
  if (!match) return '#eef4ff';
  const channels = match.slice(1, 4).map((value) => Math.max(0, Math.min(255, Number(value))));
  if (channels.some((value) => !Number.isFinite(value))) return '#eef4ff';
  const [red, green, blue] = channels.map((value) => {
    const normalized = value / 255;
    return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  });
  return .2126 * red + .7152 * green + .0722 * blue > .179 ? '#000000' : '#ffffff';
}

function resetPageDominantColor(item) {
  if (!item) return;
  item.pageColor = '';
  item.pageColorRequestKey = '';
  item.pageColorRequestId = (item.pageColorRequestId || 0) + 1;
  item.pageColorGeneration = (item.pageColorGeneration || 0) + 1;
  item.accent = item.faviconAccent || fallbackTabAccent(item.faviconSource || item.favicon || item.url || item.id);
}

function dominantColorFromNativeImage(image) {
  if (!image || typeof image.toDataURL !== 'function' || typeof Image !== 'function') return Promise.resolve('');
  let dataUrl = '';
  try { dataUrl = image.toDataURL(); } catch { return Promise.resolve(''); }
  if (!/^data:image\//i.test(dataUrl)) return Promise.resolve('');
  return new Promise((resolve) => {
    const source = new Image();
    source.onload = () => {
      try {
        const width = 48;
        const height = 32;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve('');
          return;
        }
        context.drawImage(source, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        const buckets = new Map();
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3] / 255;
          if (alpha < .18) continue;
          const quantize = (value) => Math.max(0, Math.min(255, Math.round(value / 24) * 24));
          const red = quantize(pixels[index]);
          const green = quantize(pixels[index + 1]);
          const blue = quantize(pixels[index + 2]);
          const key = `${red},${green},${blue}`;
          const bucket = buckets.get(key) || { weight: 0, red: 0, green: 0, blue: 0 };
          bucket.weight += alpha;
          bucket.red += pixels[index] * alpha;
          bucket.green += pixels[index + 1] * alpha;
          bucket.blue += pixels[index + 2] * alpha;
          buckets.set(key, bucket);
        }
        let bestKey = '';
        let bestWeight = 0;
        for (const [key, bucket] of buckets) {
          if (bucket.weight > bestWeight) {
            bestKey = key;
            bestWeight = bucket.weight;
          }
        }
        if (!bestKey) {
          resolve('');
          return;
        }
        const best = buckets.get(bestKey);
        resolve(`rgb(${['red', 'green', 'blue'].map((channel) => Math.round(best[channel] / best.weight)).join(' ')})`);
      } catch {
        resolve('');
      } finally {
        source.onload = null;
        source.onerror = null;
      }
    };
    source.onerror = () => resolve('');
    source.src = dataUrl;
  });
}

async function refreshPageDominantColor(item) {
  if (!item || item.isNewTab || !item.domReady || !item.view || item.view.hidden || typeof item.view.capturePage !== 'function') return;
  const view = item.view;
  try {
    if (typeof view.isLoading === 'function' && view.isLoading()) return;
  } catch {
    return;
  }
  const pageUrl = String(item.url || '').trim();
  const generation = Number(item.pageColorGeneration || 0);
  const requestKey = `${pageUrl}\n${generation}`;
  if (!pageUrl || item.pageColorRequestKey === requestKey) return;
  item.pageColorRequestKey = requestKey;
  const requestId = (item.pageColorRequestId || 0) + 1;
  item.pageColorRequestId = requestId;
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 48));
    if (item.view !== view || view.hidden || !tabItems.includes(item) || item.pageColorRequestId !== requestId) return;
    const image = await view.capturePage();
    const color = await dominantColorFromNativeImage(image);
    if (!color || item.view !== view || !tabItems.includes(item) || item.pageColorRequestId !== requestId || item.pageColorGeneration !== generation || item.url !== pageUrl) return;
    item.pageColor = color;
    item.accent = color;
    renderTabs();
  } catch {
    // Page screenshots are best-effort; the favicon/theme fallback remains active.
  } finally {
    if (item.pageColorRequestId === requestId && !item.pageColor) item.pageColorRequestKey = '';
  }
}

function tabIconSource(item) {
  return String(item?.faviconData || item?.favicon || '').trim();
}

function clearTabFavicon(item) {
  if (!item) return;
  item.favicon = '';
  item.faviconData = '';
  item.faviconSource = '';
  item.faviconAccent = '';
  item.faviconRequestKey = '';
  item.faviconRequestId = (item.faviconRequestId || 0) + 1;
}

async function refreshTabFavicon(item, candidate = '') {
  if (!item || item.isNewTab || !window.shellApi?.getPageFavicon) return;
  const pageUrl = String(item.url || '').trim();
  const sourceCandidate = String(candidate || item.faviconSource || '').trim();
  const requestKey = `${pageUrl}\n${sourceCandidate}`;
  if (!pageUrl || item.faviconRequestKey === requestKey) return;
  item.faviconRequestKey = requestKey;
  const requestId = (item.faviconRequestId || 0) + 1;
  item.faviconRequestId = requestId;
  try {
    const result = await window.shellApi.getPageFavicon({ url: pageUrl, favicon: sourceCandidate });
    if (!item.view || item.url !== pageUrl || item.faviconRequestId !== requestId) return;
    if (!/^data:image\//i.test(result?.favicon || '')) return;
    item.faviconData = result.favicon;
    item.faviconSource = result.source || sourceCandidate;
    item.favicon = item.faviconSource || item.favicon;
    item.accentSource = '';
    renderTabs();
    extractFaviconAccent(item);
  } catch {
    // A missing favicon must not affect page navigation or the tab itself.
  }
}

function extractFaviconAccent(item) {
  const source = tabIconSource(item);
  if (!item || !source || item.accentSource === source || typeof Image !== 'function') return;
  item.accentSource = source;
  item.faviconAccent = fallbackTabAccent(source);
  if (!item.pageColor) item.accent = item.faviconAccent;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      let weight = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3] / 255;
        if (alpha < 0.2) continue;
        const channelMax = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]);
        const channelMin = Math.min(pixels[index], pixels[index + 1], pixels[index + 2]);
        if (channelMax - channelMin < 12 && channelMax > 238) continue;
        const pixelWeight = alpha * (0.5 + (channelMax - channelMin) / 255);
        red += pixels[index] * pixelWeight;
        green += pixels[index + 1] * pixelWeight;
        blue += pixels[index + 2] * pixelWeight;
        weight += pixelWeight;
      }
      if (!weight || tabIconSource(item) !== source) return;
      item.faviconAccent = `rgb(${Math.round(red / weight)} ${Math.round(green / weight)} ${Math.round(blue / weight)})`;
      if (!item.pageColor) {
        item.accent = item.faviconAccent;
        renderTabs();
      }
    } catch {
      // Cross-origin favicons can taint the canvas; keep the deterministic fallback.
    }
  };
  image.onerror = () => {};
  image.src = source;
}

function renderFallbackTabIcon(container) {
  container.textContent = '';
  container.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-tab"></use></svg>';
}

function renderTabIcon(container, item) {
  if (item?.isHistory) {
    container.textContent = '';
    container.append(createShellIcon('shell-icon-history'));
    return;
  }
  const source = tabIconSource(item);
  if (!source) {
    renderFallbackTabIcon(container);
    return;
  }
  container.textContent = '';
  const image = document.createElement('img');
  image.className = 'browser-tab-favicon';
  image.alt = '';
  image.draggable = false;
  image.src = source;
  image.addEventListener('error', () => {
    if (image.isConnected) renderFallbackTabIcon(container);
  }, { once: true });
  container.append(image);
}

function tabSwitcherUrlLabel(value) {
  const url = String(value || '');
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function createTabSwitcherRow(item, kind) {
  const row = document.createElement('div');
  row.className = `tab-switcher-row${kind === 'open' && item.id === activeTabId ? ' is-active' : ''}`;
  const select = document.createElement('button');
  select.type = 'button';
  select.className = 'tab-switcher-select';
  select.dataset.tabSwitcherAction = kind === 'open' ? 'switch' : 'restore';
  if (kind === 'open') {
    select.dataset.tabId = item.id;
    if (item.id === activeTabId) select.setAttribute('aria-current', 'page');
  } else {
    select.dataset.closedTabId = item.id;
  }
  select.setAttribute('aria-label', `${kind === 'open' ? '切换到' : '重新打开'} ${item.title || '新标签页'}，${item.url || ''}`);
  const icon = document.createElement('span');
  icon.className = 'tab-switcher-icon';
  renderTabIcon(icon, item);
  const copy = document.createElement('span');
  copy.className = 'tab-switcher-copy';
  const title = document.createElement('span');
  title.className = 'tab-switcher-title';
  title.textContent = item.title || '新标签页';
  const url = document.createElement('span');
  url.className = 'tab-switcher-url';
  url.textContent = tabSwitcherUrlLabel(item.url);
  copy.append(title, url);
  select.append(icon, copy);
  row.append(select);
  if (kind === 'open') {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-switcher-close';
    close.dataset.tabSwitcherAction = 'close';
    close.dataset.tabId = item.id;
    close.title = `关闭 ${item.title || '标签页'}`;
    close.setAttribute('aria-label', `关闭 ${item.title || '标签页'}`);
    close.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-close"></use></svg>';
    row.append(close);
  }
  return row;
}

function renderTabSwitcher() {
  if (!tabSwitcherOpenList || !tabSwitcherClosedList) return;
  const query = String(tabSwitcherSearch?.value || '').trim().toLocaleLowerCase();
  const matching = (item) => !query || `${item.title || ''} ${item.url || ''}`.toLocaleLowerCase().includes(query);
  const openItems = tabItems.filter(matching);
  const closedItems = recentlyClosedTabs.filter(matching);
  tabSwitcherOpenList.replaceChildren(...openItems.map((item) => createTabSwitcherRow(item, 'open')));
  tabSwitcherClosedList.replaceChildren(...closedItems.map((item) => createTabSwitcherRow(item, 'closed')));
  if (!openItems.length) {
    const empty = document.createElement('div');
    empty.className = 'tab-switcher-empty';
    empty.textContent = '没有匹配的打开标签';
    tabSwitcherOpenList.append(empty);
  }
  if (!closedItems.length) {
    const empty = document.createElement('div');
    empty.className = 'tab-switcher-empty';
    empty.textContent = recentlyClosedTabs.length ? '没有匹配的最近关闭标签' : '暂无最近关闭的标签页';
    tabSwitcherClosedList.append(empty);
  }
}

function setTabSwitcherOpen(open, focusSearch = false) {
  if (!tabSwitcherPanel) return;
  const isOpen = Boolean(open);
  tabSwitcherPanel.hidden = !isOpen;
  tabMenuButton?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen) {
    renderTabSwitcher();
    if (focusSearch) tabSwitcherSearch?.focus();
  }
}

function toggleTabSwitcher() {
  setTabSwitcherOpen(tabSwitcherPanel?.hidden !== false, true);
}

function rememberClosedTab(item) {
  if (!item || isShellPage(item) || isNewTabUrl(item.url)) return;
  updateActiveTabUrlFor(item);
  recentlyClosedTabs.unshift({
    id: `closed-tab-${nextClosedTabId++}`,
    title: item.title || tabFallbackTitle(item.url),
    url: item.url || '',
    favicon: item.favicon || '',
    accent: item.accent || fallbackTabAccent(item.favicon || item.url || item.id),
    index: tabItems.indexOf(item),
    pinned: item.pinned === true,
  });
  recentlyClosedTabs.length = Math.min(recentlyClosedTabs.length, 20);
}

function applyTabDragShifts(state) {
  if (!tabs || !state?.started) return;
  const gap = Number.parseFloat(window.getComputedStyle(tabs).columnGap) || TAB_GAP;
  const distance = state.tab.offsetWidth + gap;
  for (const candidate of tabs.querySelectorAll('.browser-tab')) {
    if (candidate === state.tab) continue;
    const index = tabItems.findIndex((item) => item.id === candidate.dataset.tabId);
    let shift = 0;
    if (state.targetIndex > state.originIndex && index > state.originIndex && index <= state.targetIndex) {
      shift = -distance;
    } else if (state.targetIndex < state.originIndex && index >= state.targetIndex && index < state.originIndex) {
      shift = distance;
    }
    candidate.classList.toggle('tab-reorder-shift', shift !== 0);
    if (shift) candidate.style.setProperty('--tab-shift-x', `${shift}px`);
    else candidate.style.removeProperty('--tab-shift-x');
  }
}

function beginTabDrag(event, item, tab) {
  if (event.button !== 0 || event.target?.closest?.('.browser-tab-close')) return;
  tabDrag = {
    itemId: item.id,
    tab,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originIndex: tabItems.findIndex((candidate) => candidate.id === item.id),
    targetIndex: tabItems.findIndex((candidate) => candidate.id === item.id),
    started: false,
  };
}

function updateTabDrag(event) {
  const state = tabDrag;
  if (!state || state.pointerId !== event.pointerId || !tabs) return;
  const deltaX = event.clientX - state.startX;
  const deltaY = event.clientY - state.startY;
  if (!state.started) {
    if (Math.hypot(deltaX, deltaY) < TAB_DRAG_THRESHOLD) return;
    state.started = true;
    tabs.classList.add('is-dragging-tab');
    state.tab.classList.add('is-dragging');
    state.tab.style.setProperty('--tab-drag-x', `${deltaX}px`);
    try { state.tab.setPointerCapture(event.pointerId); } catch {}
  }
  event.preventDefault();
  state.tab.style.setProperty('--tab-drag-x', `${deltaX}px`);
  const tabsLeft = tabs.getBoundingClientRect().left;
  const targetIndex = [...tabs.querySelectorAll('.browser-tab')]
    .filter((candidate) => candidate !== state.tab)
    .reduce((index, candidate) => {
      const center = tabsLeft + candidate.offsetLeft - tabs.scrollLeft + candidate.offsetWidth / 2;
      return index + (event.clientX >= center ? 1 : 0);
    }, 0);
    const pinnedCount = tabItems.filter((item) => item.pinned).length;
    const dragged = tabItems.find((item) => item.id === state.itemId);
    const boundedTarget = dragged?.pinned
      ? Math.max(0, Math.min(pinnedCount - 1, targetIndex))
      : Math.max(pinnedCount, Math.min(tabItems.length - 1, targetIndex));
  if (boundedTarget === state.targetIndex) return;
  state.targetIndex = boundedTarget;
  applyTabDragShifts(state);
}

function resetTabDragPresentation() {
  if (!tabs) return;
  for (const tab of tabs.querySelectorAll('.browser-tab')) {
    tab.classList.remove('is-dragging', 'tab-reorder-shift');
    tab.style.removeProperty('--tab-drag-x');
    tab.style.removeProperty('--tab-shift-x');
  }
  tabs.classList.remove('is-dragging-tab');
  void tabs.offsetWidth;
}

function finishTabDrag(cancelled = false) {
  const state = tabDrag;
  if (!state) return;
  tabDrag = null;
  if (!state.started) return;
  try { state.tab.releasePointerCapture(state.pointerId); } catch {}
  resetTabDragPresentation();
  if (!cancelled) {
    const currentIndex = tabItems.findIndex((item) => item.id === state.itemId);
    if (currentIndex >= 0 && currentIndex !== state.targetIndex) {
      const [moved] = tabItems.splice(currentIndex, 1);
      tabItems.splice(state.targetIndex, 0, moved);
    }
    suppressedTabClickId = state.itemId;
    window.setTimeout(() => {
      if (suppressedTabClickId === state.itemId) suppressedTabClickId = '';
    }, 0);
    const movedItem = tabItems.find((item) => item.id === state.itemId);
    if (movedItem) activateTab(movedItem.id);
    else renderTabs();
  } else {
    renderTabs();
  }
}

function renderTabs() {
  if (!tabs) return;
  if (tabDrag?.started) return;
  const previousRects = new Map([...tabs.querySelectorAll('.browser-tab')].map((tab) => [
    tab.dataset.tabId,
    tab.getBoundingClientRect(),
  ]));
  const previousActiveId = tabs.querySelector('.browser-tab.is-active')?.dataset.tabId || '';
  const activeSurface = tabActiveSurface || tabs.querySelector('.tab-active-surface');
  if (activeSurface && activeSurface.parentElement !== tabs) tabs.prepend(activeSurface);
  tabs.textContent = '';
  if (activeSurface) tabs.append(activeSurface);
  tabs.style.removeProperty('width');
  for (const item of tabItems) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `browser-tab${item.id === activeTabId ? ' is-active' : ''}${item.pinned ? ' is-pinned' : ''}${item.loading ? ' is-loading' : ''}`;
    tab.tabIndex = item.id === activeTabId ? 0 : -1;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', item.id === activeTabId ? 'true' : 'false');
    tab.dataset.tabId = item.id;
    tab.dataset.tabAccent = item.accent || fallbackTabAccent(item.favicon || item.url || item.id);
    tab.dataset.pageColor = item.pageColor || '';
    tab.dataset.tabText = item.pageColor ? tabTextColor(item.pageColor) : '#eef4ff';
    tab.style.setProperty('--tab-accent', tab.dataset.tabAccent);
    tab.style.setProperty('--tab-text', tab.dataset.tabText);
    tab.title = item.title;
    tab.setAttribute('aria-label', item.title);
    const icon = document.createElement('span');
    icon.className = 'browser-tab-icon';
    renderTabIcon(icon, item);
    const label = document.createElement('span');
    label.className = 'browser-tab-title';
    label.textContent = item.title;
    const close = document.createElement('span');
    close.className = 'browser-tab-close';
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', `关闭 ${item.title}`);
    close.title = '关闭标签页';
    close.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-close"></use></svg>';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(item.id);
    });
    tab.append(icon, label, close);
    if (item.audible || item.muted) {
      const sound = createShellIcon(item.muted ? 'shell-icon-muted' : 'shell-icon-volume', 'shell-icon tab-sound');
      sound.setAttribute('aria-label', item.muted ? '网站已静音' : '正在播放声音');
      tab.append(sound);
    }
    tab.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const index = tabItems.indexOf(item);
      void window.shellApi?.showTabMenu?.({ tabId: item.id, pinned: item.pinned, muted: item.muted,
        canMute: Boolean(tabSiteHost(item)), hasOthers: tabItems.some((entry) => entry !== item && !entry.pinned),
        hasRight: tabItems.slice(index + 1).some((entry) => !entry.pinned) });
    });
    tab.addEventListener('click', () => {
      if (suppressedTabClickId === item.id) {
        suppressedTabClickId = '';
        return;
      }
      activateTab(item.id, item.isNewTab);
    });
    tab.addEventListener('pointerdown', (event) => beginTabDrag(event, item, tab));
    tab.addEventListener('dragstart', (event) => event.preventDefault());
    tab.addEventListener('auxclick', (event) => {
      if (event.button === 1) closeTab(item.id);
    });
    tabs.append(tab);
  }
  const active = tabs.querySelector('.browser-tab.is-active');
  active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  renderTabSwitcher();
  if (!activeSurface || !active) return;
  if (!activeSurface.dataset.ready) {
    syncTabActiveSurface();
    activeSurface.dataset.ready = 'true';
  } else {
    window.cancelAnimationFrame(tabActiveSurfaceFrame);
    tabActiveSurfaceFrame = window.requestAnimationFrame(syncTabActiveSurface);
  }
  const nextTabs = [...tabs.querySelectorAll('.browser-tab')];
  window.requestAnimationFrame(() => {
    for (const tab of nextTabs) {
      const previous = previousRects.get(tab.dataset.tabId);
      let moved = false;
      if (previous) {
        const current = tab.getBoundingClientRect();
        const fromX = previous.left - current.left;
        const fromY = previous.top - current.top;
        if (Math.abs(fromX) > 0.5 || Math.abs(fromY) > 0.5) {
          moved = true;
          tab.style.setProperty('--tab-from-x', `${fromX}px`);
          tab.style.setProperty('--tab-from-y', `${fromY}px`);
          tab.classList.add('tab-layout-motion');
          tab.addEventListener('animationend', () => {
            tab.classList.remove('tab-layout-motion');
            tab.style.removeProperty('--tab-from-x');
            tab.style.removeProperty('--tab-from-y');
          }, { once: true });
        }
      } else if (previousRects.size > 0) {
        tab.classList.add('tab-enter-motion');
        tab.addEventListener('animationend', () => tab.classList.remove('tab-enter-motion'), { once: true });
      }
      if (previousActiveId && previousActiveId !== activeTabId && tab.dataset.tabId === activeTabId && previous && !moved) {
        tab.classList.add('tab-active-motion');
        tab.addEventListener('animationend', () => tab.classList.remove('tab-active-motion'), { once: true });
      }
    }
  });
}

function activeTab() {
  return tabItems.find((item) => item.id === activeTabId) || null;
}

function clearPasswordPromptTimer() {
  if (passwordPromptTimer) window.clearTimeout(passwordPromptTimer);
  passwordPromptTimer = 0;
}

function hidePasswordSavePrompt() {
  clearPasswordPromptTimer();
  passwordPromptState = null;
  if (!passwordVaultPrompt) return;
  passwordVaultPrompt.hidden = true;
  passwordVaultPrompt.innerHTML = '';
}

function positionPasswordSavePrompt() {
  if (!passwordVaultPrompt || passwordVaultPrompt.hidden || !passwordPromptState || !pageViewport) return;
  const item = tabItems.find((candidate) => candidate.id === passwordPromptState.itemId);
  if (!item?.view || item.id !== activeTabId || typeof item.view.getBoundingClientRect !== 'function') return;
  const anchor = passwordPromptState.rect || {};
  const viewRect = item.view.getBoundingClientRect();
  const viewportRect = pageViewport.getBoundingClientRect();
  const width = passwordVaultPrompt.offsetWidth || 320;
  const margin = 8;
  const maxLeft = Math.max(margin, pageViewport.clientWidth - width - margin);
  const relativeLeft = viewRect.left - viewportRect.left + (Number(anchor.left) || 0);
  const relativeTop = viewRect.top - viewportRect.top + (Number(anchor.top) || 0);
  const anchorHeight = Number(anchor.height) || 36;
  let left = Math.max(margin, Math.min(maxLeft, relativeLeft));
  let top = relativeTop + anchorHeight + 8;
  const promptHeight = passwordVaultPrompt.offsetHeight || 110;
  let above = false;
  if (top + promptHeight > pageViewport.clientHeight - margin && relativeTop > promptHeight + margin) {
    top = relativeTop - promptHeight - 8;
    above = true;
  }
  top = Math.max(margin, Math.min(Math.max(margin, pageViewport.clientHeight - promptHeight - margin), top));
  passwordVaultPrompt.style.left = `${Math.round(left)}px`;
  passwordVaultPrompt.style.top = `${Math.round(top)}px`;
  passwordVaultPrompt.classList.toggle('is-above', above);
}

function schedulePasswordPromptClose() {
  clearPasswordPromptTimer();
  passwordPromptTimer = window.setTimeout(() => hidePasswordSavePrompt(), 12000);
}

async function showPasswordSavePrompt(item, input) {
  if (!passwordVaultPrompt || !item || item.id !== activeTabId) return;
  const account = typeof input.account === 'string' ? input.account.trim().slice(0, 256) : '';
  const password = typeof input.password === 'string' ? input.password.slice(0, 4096) : '';
  const website = typeof input.website === 'string' ? input.website.trim().slice(0, 2048) : '';
  if (!account || !password || !/^https?:\/\//i.test(website)) return;
  hidePasswordSavePrompt();
  const prompt = {
    itemId: item.id,
    requestId: String(input.requestId || ''),
    service: typeof input.service === 'string' ? input.service.trim().slice(0, 120) : '网页登录',
    account,
    password,
    website,
    rect: input.rect && typeof input.rect === 'object' ? input.rect : null,
    isUpdate: false,
  };
  passwordPromptState = prompt;
  try {
    const result = await window.shellApi?.getPasswordSuggestions?.({ url: website });
    if (passwordPromptState !== prompt || item.id !== activeTabId) return;
    prompt.isUpdate = result?.ok === true
      && (result.suggestions || []).some((entry) => entry?.account === account);
  } catch {
    if (passwordPromptState !== prompt || item.id !== activeTabId) return;
  }
  passwordVaultPrompt.setAttribute('aria-label', prompt.isUpdate ? '更新密码' : '保存登录信息');
  passwordVaultPrompt.innerHTML = '';
  const heading = document.createElement('strong');
  heading.className = 'password-vault-prompt-heading';
  heading.textContent = prompt.isUpdate ? '更新已保存的密码？' : '保存此登录信息？';
  const detail = document.createElement('span');
  detail.className = 'password-vault-prompt-detail';
  detail.textContent = `${prompt.service || '网页登录'} · ${account}`;
  const actions = document.createElement('div');
  actions.className = 'password-vault-prompt-actions';
  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'password-vault-prompt-button';
  no.textContent = '取消';
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'password-vault-prompt-button is-primary';
  yes.textContent = prompt.isUpdate ? '更新' : '保存';
  no.addEventListener('click', (event) => {
    event.stopPropagation();
    hidePasswordSavePrompt();
  });
  yes.addEventListener('click', async (event) => {
    event.stopPropagation();
    const current = passwordPromptState;
    if (!current) return;
    yes.disabled = true;
    no.disabled = true;
    yes.textContent = current.isUpdate ? '更新中' : '保存中';
    try {
      const result = await window.shellApi?.savePasswordEntry?.({
        requestId: current.requestId,
        service: current.service,
        account: current.account,
        password: current.password,
        website: current.website,
      });
      if (passwordPromptState !== current) return;
      if (result?.ok === false) {
        yes.disabled = false;
        no.disabled = false;
        yes.textContent = current.isUpdate ? '更新' : '保存';
        detail.textContent = result.error || '密码保存失败';
        detail.classList.add('is-error');
        schedulePasswordPromptClose();
        return;
      }
      hidePasswordSavePrompt();
      const created = result?.created === undefined ? !current.isUpdate : result.created;
      setShellStatus(created ? '密码已保存' : '密码已更新', 'success');
    } catch (error) {
      if (passwordPromptState !== current) return;
      yes.disabled = false;
      no.disabled = false;
      yes.textContent = current.isUpdate ? '更新' : '保存';
      detail.textContent = error?.message || '密码保存失败';
      detail.classList.add('is-error');
      schedulePasswordPromptClose();
    }
  });
  actions.append(no, yes);
  passwordVaultPrompt.append(heading, detail, actions);
  passwordVaultPrompt.hidden = false;
  positionPasswordSavePrompt();
  schedulePasswordPromptClose();
}

function activateTab(tabId, focusAddress = false) {
  const item = tabItems.find((candidate) => candidate.id === tabId);
  if (!item) return;
  if (activeTabId !== item.id) closePageFind(false);
  if (passwordPromptState && passwordPromptState.itemId !== item.id) hidePasswordSavePrompt();
  activeTabId = item.id;
  if (item.isNewTab && !item.agentView) item.agentView = createNewTabAgentView(item);
  webview = item.isNewTab ? item.agentView : item.view;
  if (item.isHistory) webview = null;
  syncGuestZoomFactor();
  agentPointer = null;
  lastPageTitle = item.title === '新标签页' ? '' : item.title;
  for (const candidate of tabItems) {
    if (candidate.view) candidate.view.hidden = candidate.id !== activeTabId;
    if (candidate.newTabView) candidate.newTabView.hidden = candidate.id !== activeTabId;
  }
  renderTabs();
  if (!isShellPage(item)) void refreshPageDominantColor(item);
  syncAddress();
  syncAgentContext();
  renderBookmarkToggle();
  renderBookmarkBar();
  syncNavigationControls();
  document.title = `${item.title} · ${profileName} · ${brandName}`;
  if (focusAddress) {
    address.focus();
    address.select();
  } else if (!isShellPage(item)) {
    if (item.domReady) item.view?.focus();
    else item.focusOnReady = true;
  }
}

function setGuestZoomFactor(view, factor) {
  if (!view || typeof view.setZoomFactor !== 'function' || !Number.isFinite(factor)) return;
  try {
    void Promise.resolve(view.setZoomFactor(factor)).catch(() => {});
  } catch {
    // The guest may be navigating or closing while the shell handles input.
  }
}

function setNewTabZoomFactor(view, factor) {
  if (!view || !Number.isFinite(factor)) return;
  const bounded = Math.max(.5, Math.min(2, factor));
  view.style.setProperty('--new-tab-zoom', String(bounded));
}

function syncGuestZoomFactor(view = webview) {
  const percentage = shellInterfaceZoom?.getPercentage?.();
  if (!Number.isFinite(percentage)) return;
  const item = activeTab();
  if (item?.isNewTab) {
    setNewTabZoomFactor(item.newTabView, percentage / 100);
    return;
  }
  if (item?.isHistory) return;
  setGuestZoomFactor(view, percentage / 100);
}

function guestPageUrl(item) {
  try {
    const current = item?.view?.getURL?.();
    if (typeof current === 'string' && /^https?:\/\//i.test(current)) return current;
  } catch {
    // The guest may be navigating or closing.
  }
  return typeof item?.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url : '';
}

function sendGuestPasswordMessage(item, channel, payload) {
  try {
    if (item?.view && typeof item.view.send === 'function') item.view.send(channel, payload);
  } catch {
    // The guest may have navigated away before the response was delivered.
  }
}

async function handleGuestPasswordMessage(item, event) {
  const channel = event?.channel;
  const input = event?.args?.[0] && typeof event.args[0] === 'object' ? event.args[0] : {};
  if (!channel || !channel.startsWith('password-vault:') || isShellPage(item)) return;
  const url = guestPageUrl(item);
  if (channel === 'password-vault:dismiss') {
    if (passwordPromptState?.itemId === item.id) hidePasswordSavePrompt();
    return;
  }
  if (channel === 'password-vault:login') {
    void showPasswordSavePrompt(item, input);
    return;
  }
  if (channel === 'password-vault:query') {
    try {
      const result = await window.shellApi?.getPasswordSuggestions?.({ url });
      sendGuestPasswordMessage(item, 'password-vault:suggestions', {
        requestId: String(input.requestId || ''),
        suggestions: result?.ok === false ? [] : (result?.suggestions || []),
      });
    } catch {
      sendGuestPasswordMessage(item, 'password-vault:suggestions', {
        requestId: String(input.requestId || ''),
        suggestions: [],
      });
    }
    return;
  }
  if (channel === 'password-vault:reveal') {
    try {
      const result = await window.shellApi?.revealPasswordEntry?.({
        requestId: String(input.requestId || ''),
        entryId: String(input.entryId || ''),
        url,
      });
      sendGuestPasswordMessage(item, 'password-vault:secret', {
        requestId: String(input.requestId || ''),
        ok: result?.ok === true,
        password: result?.password,
      });
    } catch {
      sendGuestPasswordMessage(item, 'password-vault:secret', {
        requestId: String(input.requestId || ''),
        ok: false,
      });
    }
    return;
  }
}

function bindTabEvents(item) {
  const view = item.view;
  view.addEventListener('focus', () => {
    if (item.id !== activeTabId) return;
    finishAddressEditing();
    hideAddressSuggestions();
    dismissBrowserPopovers();
  });
  view.addEventListener('dom-ready', () => {
    item.domReady = true;
    syncTabAudio(item);
    if (item.id === activeTabId) {
      if (item.focusOnReady) { item.focusOnReady = false; view.focus(); }
      syncGuestZoomFactor(view);
      syncAddress();
    }
  });
  view.addEventListener('ipc-message', (event) => {
    if (event?.channel === 'browser-shell:interface-zoom') {
      const command = event.args?.[0];
      if (typeof command?.leftControlDown === 'boolean') shellInterfaceZoom?.setLeftControlDown(command.leftControlDown);
      else if (command?.reset === true) shellInterfaceZoom?.reset();
      else if (command?.direction === 1 || command?.direction === -1) shellInterfaceZoom?.step(command.direction);
      return;
    }
    if (typeof event?.channel === 'string' && event.channel.startsWith('password-vault:')) {
      void handleGuestPasswordMessage(item, event);
    }
  });
  view.addEventListener('did-start-loading', () => {
    item.loading = true;
    closePageFindFor(item);
    item.loadTimedOut = false;
    item.domReady = false;
    clearTabFavicon(item);
    resetPageDominantColor(item);
    item.accentSource = '';
    renderTabs();
    if (item.id === activeTabId) syncNavigationControls();
    schedulePageLoadTimeout(item);
    if (item.id !== activeTabId) return;
    lastPageTitle = '';
    setShellStatus('加载中', 'busy');
  });
  view.addEventListener('did-frame-finish-load', (event) => {
    if (event.isMainFrame === false || item.loadTimedOut) return;
    markPageLoadReady(item);
    void refreshTabFavicon(item);
    void refreshPageDominantColor(item);
  });
  view.addEventListener('did-stop-loading', () => {
    if (item.loadTimedOut) {
      item.loadTimedOut = false;
      return;
    }
    markPageLoadReady(item);
    void refreshPageDominantColor(item);
  });
  view.addEventListener('did-navigate', (event) => {
    item.url = event.url || item.url;
    syncTabAudio(item);
    resetPageDominantColor(item);
    item.accentSource = '';
    item.title = item.title === '新标签页' ? tabFallbackTitle(item.url) : item.title;
    recordNavigation(item.url, item.title);
    void recordCommonSiteVisit(item.url);
    renderTabs();
    if (item.id !== activeTabId) return;
    lastPageTitle = '';
    syncAddress();
    syncNavigationControls();
    syncAgentContext();
  });
  view.addEventListener('did-navigate-in-page', (event) => {
    if (event.isMainFrame === false) return;
    item.url = event.url || item.url;
    syncTabAudio(item);
    resetPageDominantColor(item);
    renderTabs();
    void refreshPageDominantColor(item);
    if (item.id === activeTabId) { syncAddress(); syncNavigationControls(); }
  });
  view.addEventListener('page-title-updated', (event) => {
    if (event.title) item.title = event.title.slice(0, 120);
    renderTabs();
    if (item.id !== activeTabId) return;
    lastPageTitle = event.title || '';
    document.title = `${item.title} · ${profileName} · ${brandName}`;
    syncAgentContext();
    renderBookmarkToggle();
  });
  view.addEventListener('page-favicon-updated', (event) => {
    const favicons = Array.isArray(event.favicons) ? event.favicons : [];
    const favicon = favicons.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
    if (favicon) {
      item.favicon = favicon;
      item.faviconData = '';
      item.faviconSource = favicon;
    }
    if (!item.pageColor) {
      item.accent = item.faviconAccent || fallbackTabAccent(tabIconSource(item) || item.url || item.id);
    }
    renderTabs();
    item.accentSource = '';
    extractFaviconAccent(item);
    void refreshTabFavicon(item, favicon);
    if (item.favicon) void saveBookmarkFavicon(item.url, item.favicon);
  });
  view.addEventListener('did-fail-load', (event) => {
    item.loading = false;
    if (item.id === activeTabId) syncNavigationControls();
    clearPageLoadTimer(item);
    if (item.loadTimedOut) {
      item.loadTimedOut = false;
      return;
    }
    if (event.errorCode === -3 || item.id !== activeTabId) return;
    loading.hidden = true;
    setShellStatus(`加载失败：${event.errorDescription || event.errorCode}`, 'error');
    syncAgentContext();
  });
  view.addEventListener('render-process-gone', (event) => {
    item.loading = false;
    if (item.id === activeTabId) syncNavigationControls();
    clearPageLoadTimer(item);
    item.loadTimedOut = false;
    if (item.id !== activeTabId) return;
    loading.hidden = true;
    setShellStatus(`页面进程退出：${event.details?.reason || '未知原因'}`, 'error');
    syncAgentContext();
  });
  for (const name of ['media-started-playing', 'media-paused']) {
    view.addEventListener(name, () => {
      try { item.audible = view.isCurrentlyAudible(); } catch { item.audible = false; }
      renderTabs();
    });
  }
}

function clearPageLoadTimer(item) {
  if (!item?.loadTimer) return;
  window.clearTimeout(item.loadTimer);
  item.loadTimer = null;
}

function schedulePageLoadTimeout(item) {
  clearPageLoadTimer(item);
  item.loadTimer = window.setTimeout(() => {
    item.loadTimer = null;
    item.loading = false;
    if (item.loadTimedOut) return;
    let isLoading = true;
    try {
      if (typeof item.view.isLoading === 'function') isLoading = item.view.isLoading();
    } catch {
      // The guest may be tearing down.
    }
    if (!isLoading) return;
    item.loadTimedOut = true;
    try { item.view.stop(); } catch {
      // The guest may reject stop while the network request is being torn down.
    }
    if (item.id !== activeTabId) return;
    loading.hidden = true;
    syncNavigationControls();
    setShellStatus('加载超时：代理或目标站点无响应', 'error');
    syncAgentContext();
  }, PAGE_LOAD_TIMEOUT_MS);
}

function markPageLoadReady(item) {
  item.loading = false;
  renderTabs();
  clearPageLoadTimer(item);
  updateActiveTabUrlFor(item);
  recordNavigation(item.url, item.title);
  if (item.id !== activeTabId) return;
  loading.hidden = true;
  syncNavigationControls();
  setShellStatus('就绪');
  syncAddress();
  syncAgentContext();
}

function updateActiveTabUrlFor(item) {
  try {
    const current = typeof item.view.getURL === 'function' ? item.view.getURL() : '';
    if (current) item.url = current;
  } catch {
    // The guest may be tearing down.
  }
}

function tabSiteHost(item) {
  try { const url = new URL(item.url); return ['http:', 'https:'].includes(url.protocol) ? url.hostname : ''; } catch { return ''; }
}

function syncTabAudio(item) {
  item.muted = mutedSiteHosts.has(tabSiteHost(item));
  try { item.view?.setAudioMuted(item.muted); } catch { /* The guest is not ready yet. */ }
}

function restoreClosedTab(closedId) {
  const index = closedId ? recentlyClosedTabs.findIndex((item) => item.id === closedId) : 0;
  if (index < 0 || !recentlyClosedTabs[index]) return;
  const [closed] = recentlyClosedTabs.splice(index, 1);
  const item = createTab(closed.url, { index: closed.index, pinned: closed.pinned });
  if (!item) { recentlyClosedTabs.splice(index, 0, closed); return; }
  item.title = closed.title;
  item.favicon = closed.favicon;
  item.accent = closed.accent;
  renderTabs();
}

function runTabAction(tabId, command) {
  const item = tabItems.find((entry) => entry.id === tabId);
  if (!item) return;
  const index = tabItems.indexOf(item);
  if (command === 'new-right') createTab('about:newtab', { index: index + 1 });
  else if (command === 'reload') {
    if (isShellPage(item)) { if (item.isHistory) renderHistoryPage(item); else void refreshNewTabPage(item); }
    else item.view?.reload();
  } else if (command === 'duplicate') createTab(item.url, { index: index + 1, pinned: item.pinned });
  else if (command === 'pin') {
    tabItems.splice(index, 1);
    item.pinned = !item.pinned;
    tabItems.splice(tabItems.filter((entry) => entry.pinned).length, 0, item);
    renderTabs();
  } else if (command === 'mute') {
    const host = tabSiteHost(item);
    if (!host) return;
    if (mutedSiteHosts.has(host)) mutedSiteHosts.delete(host); else mutedSiteHosts.add(host);
    for (const entry of tabItems) syncTabAudio(entry);
    renderTabs();
  } else if (command === 'close') closeTab(tabId);
  else if (command === 'close-others' || command === 'close-right') {
    const targets = tabItems.filter((entry, position) => entry !== item && !entry.pinned && (command === 'close-others' || position > index));
    for (const target of targets.reverse()) closeTab(target.id);
  }
}

function createTab(url = 'about:newtab', options = {}) {
  if (!pages) return null;
  const normalized = normalizedUrl(url);
  const item = {
    id: `tab-${nextTabId++}`,
    url: normalized,
    title: tabFallbackTitle(normalized),
    favicon: '',
    faviconData: '',
    faviconSource: '',
    faviconAccent: '',
    faviconRequestKey: '',
    faviconRequestId: 0,
    accent: fallbackTabAccent(normalized),
    accentSource: '',
    pageColor: '',
    pageColorRequestKey: '',
    pageColorRequestId: 0,
    pageColorGeneration: 0,
    isNewTab: isNewTabUrl(normalized),
    isHistory: isHistoryUrl(normalized),
    pinned: options.pinned === true,
    loading: false,
    muted: false,
    audible: false,
    findQuery: '',
    view: null,
    newTabView: null,
    agentView: null,
  };
  if (item.isHistory) item.title = '历史记录';
  if (item.isNewTab || item.isHistory) {
    item.newTabView = document.createElement('section');
    item.newTabView.className = 'new-tab-view';
    item.newTabView.setAttribute('aria-label', item.isHistory ? '历史记录' : '新标签页');
    pages.append(item.newTabView);
    if (item.isHistory) renderHistoryPage(item);
    else {
      renderNewTabPage(item);
      item.agentView = createNewTabAgentView(item);
    }
  } else {
    item.view = document.createElement('webview');
    item.view.className = 'page-webview';
    item.view.setAttribute('partition', partition);
    item.view.setAttribute('allowpopups', '');
    item.view.setAttribute('aria-label', item.title);
    item.view.hidden = options.activate === false;
    pages.append(item.view);
    bindTabEvents(item);
    item.view.setAttribute('src', item.url);
  }
  const pinnedCount = tabItems.filter((entry) => entry.pinned).length;
  const requestedIndex = Number.isInteger(options.index) ? options.index : tabItems.length;
  const insertIndex = item.pinned ? Math.min(pinnedCount, Math.max(0, requestedIndex))
    : Math.max(pinnedCount, Math.min(tabItems.length, requestedIndex));
  tabItems.splice(insertIndex, 0, item);
  if (options.activate !== false) activateTab(item.id, options.focusAddress ?? item.isNewTab);
  else { if (item.newTabView) item.newTabView.hidden = true; renderTabs(); }
  return item;
}

function ensureWebviewForTab(item) {
  if (!item) return null;
  if (!isShellPage(item) && item.view) return item.view;
  item.newTabView?.remove();
  item.newTabView = null;
  item.refreshNewTabSearchSuggestions = null;
  item.isNewTab = false;
  item.isHistory = false;
  item.view = document.createElement('webview');
  item.view.className = 'page-webview';
  item.view.setAttribute('partition', partition);
  item.view.setAttribute('allowpopups', '');
  item.view.setAttribute('aria-label', item.title);
  pages?.append(item.view);
  bindTabEvents(item);
  if (item.url && !isNewTabUrl(item.url)) item.view.setAttribute('src', item.url);
  return item.view;
}

function resetTabToNewTab(item) {
  if (!item) return;
  if (passwordPromptState?.itemId === item.id) hidePasswordSavePrompt();
  clearPageLoadTimer(item);
  closePageFindFor(item);
  item.loading = false;
  item.pinned = false;
  item.audible = false;
  item.muted = false;
  item.view?.remove?.();
  item.view = null;
  item.newTabView?.remove?.();
  item.newTabView = null;
  item.isHistory = false;
  item.isNewTab = true;
  item.url = 'about:newtab';
  item.title = '新标签页';
  clearTabFavicon(item);
  resetPageDominantColor(item);
  item.accentSource = '';
  item.newTabView = document.createElement('section');
  item.newTabView.className = 'new-tab-view';
  item.newTabView.setAttribute('aria-label', '新标签页');
  pages?.append(item.newTabView);
  renderNewTabPage(item);
  if (!item.agentView) item.agentView = createNewTabAgentView(item);
}

function closeTab(tabId) {
  const index = tabItems.findIndex((item) => item.id === tabId);
  if (index < 0) return;
  if (passwordPromptState?.itemId === tabId) hidePasswordSavePrompt();
  rememberClosedTab(tabItems[index]);
  if (tabItems.length === 1) {
    const item = tabItems[0];
    resetTabToNewTab(item);
    activateTab(item.id, true);
    return;
  }
  const wasActive = activeTabId === tabId;
  const [removed] = tabItems.splice(index, 1);
  closePageFindFor(removed);
  clearPageLoadTimer(removed);
  removed.view?.remove?.();
  removed.newTabView?.remove?.();
  if (wasActive) {
    const next = tabItems[Math.min(index, tabItems.length - 1)];
    activateTab(next.id);
  } else {
    renderTabs();
  }
}

function agentTabSnapshot(item) {
  if (!item) return null;
  let url = item.url || 'about:newtab';
  let loading = false;
  if (!isShellPage(item) && item.view && typeof item.view.getURL === 'function') {
    try { url = item.view.getURL() || url; } catch { /* The guest may be loading. */ }
  }
  if (!isShellPage(item) && item.view && typeof item.view.isLoading === 'function') {
    try { loading = Boolean(item.view.isLoading()); } catch { loading = true; }
  }
  return {
    tabId: item.id,
    title: item.title || tabFallbackTitle(url),
    url,
    active: item.id === activeTabId,
    isNewTab: Boolean(item.isNewTab),
    loading,
  };
}

function agentTabsSnapshot() {
  return {
    ok: true,
    type: 'tabs',
    activeTabId,
    tabs: tabItems.map(agentTabSnapshot).filter(Boolean),
  };
}

function agentTabFor(tabId) {
  const value = String(tabId || '').trim();
  return tabItems.find((item) => item.id === (value || activeTabId)) || null;
}

function agentOpenTab(input = {}) {
  const url = normalizedUrl(input.url || 'about:newtab');
  const item = createTab(url, { activate: input.focus !== false });
  if (!item) throw new Error('无法创建新标签页');
  return { ok: true, type: 'open-tab', tab: agentTabSnapshot(item), tabs: agentTabsSnapshot().tabs };
}

function agentSwitchTab(tabId) {
  const item = agentTabFor(tabId);
  if (!item) throw new Error('标签页不存在');
  activateTab(item.id);
  return { ok: true, type: 'switch-tab', tab: agentTabSnapshot(item), tabs: agentTabsSnapshot().tabs };
}

function agentCloseTab(tabId) {
  const item = agentTabFor(tabId);
  if (!item) throw new Error('标签页不存在');
  closeTab(item.id);
  return { ok: true, type: 'close-tab', closedTabId: item.id, activeTabId, tabs: agentTabsSnapshot().tabs };
}

async function agentNavigate(input = {}) {
  const item = agentTabFor(input.tabId);
  if (!item) throw new Error('标签页不存在');
  activateTab(item.id);
  const url = normalizedUrl(input.url);
  if (isHistoryUrl(url)) {
    resetTabToHistory(item);
    renderHistoryPage(item);
    activateTab(item.id);
    return { ok: true, type: 'navigate', tab: agentTabSnapshot(item), tabs: agentTabsSnapshot().tabs };
  }
  if (isNewTabUrl(url)) {
    resetTabToNewTab(item);
    activateTab(item.id);
    return { ok: true, type: 'navigate', tab: agentTabSnapshot(item), tabs: agentTabsSnapshot().tabs };
  }
  const hadView = Boolean(item.view && !item.isNewTab);
  item.url = url;
    item.title = tabFallbackTitle(url);
  clearTabFavicon(item);
  resetPageDominantColor(item);
  item.accentSource = '';
  const targetView = ensureWebviewForTab(item);
  renderTabs();
  recordNavigation(url, item.title);
  webview = targetView;
  if (typeof targetView?.loadURL !== 'function') throw new Error('当前页面暂不可导航');
  if (hadView) await targetView.loadURL(url);
  return { ok: true, type: 'navigate', tab: agentTabSnapshot(item), tabs: agentTabsSnapshot().tabs };
}

async function agentTabControl(input = {}) {
  const item = agentTabFor(input.tabId);
  if (!item) throw new Error('标签页不存在');
  activateTab(item.id);
  const action = String(input.action || '').trim().toLowerCase();
  const targetView = item.view;
  if (!targetView || item.isNewTab || item.isHistory) {
    if (action === 'reload') {
      if (item.isHistory) renderHistoryPage(item);
      else void refreshNewTabPage(item);
    }
    return { ok: true, type: 'tab-control', action, tab: agentTabSnapshot(item), tabs: agentTabsSnapshot().tabs };
  }
  if (action === 'back') {
    if (targetView.canGoBack?.()) targetView.goBack();
  } else if (action === 'forward') {
    if (targetView.canGoForward?.()) targetView.goForward();
  } else if (action === 'reload') {
    targetView.reload?.();
  } else if (action === 'stop') {
    targetView.stop?.();
  } else if (action === 'devtools') {
    toggleActiveDevTools();
  } else {
    throw new Error('不支持的标签页控制动作');
  }
  return { ok: true, type: 'tab-control', action, tab: agentTabSnapshot(item), tabs: agentTabsSnapshot().tabs };
}

function cycleTab(direction) {
  if (tabItems.length < 2) return;
  const index = tabItems.findIndex((item) => item.id === activeTabId);
  const nextIndex = (index + direction + tabItems.length) % tabItems.length;
  activateTab(tabItems[nextIndex].id);
}

function syncNavigationControls() {
  const item = activeTab();
  const view = isShellPage(item) ? null : item?.view;
  let canBack = false;
  let canForward = false;
  try { canBack = view?.canGoBack() === true; canForward = view?.canGoForward() === true; } catch {}
  if (backButton) backButton.disabled = !canBack;
  if (forwardButton) forwardButton.disabled = !canForward;
  if (reloadButton) {
    const busy = item?.loading === true;
    reloadButton.title = busy ? '停止加载' : '刷新';
    reloadButton.setAttribute('aria-label', busy ? '停止加载' : '刷新');
    reloadButton.querySelector('use')?.setAttribute('href', busy ? '#shell-icon-close' : '#shell-icon-refresh');
  }
  if (loading) loading.hidden = true;
}

function closePageFindFor(item) {
  if (!item) return;
  const hadRequest = Boolean(item.findToken);
  item.findToken = 0;
  if (hadRequest && item.domReady && item.view) {
    try { void window.shellApi?.findPage?.({ webContentsId: item.view.getWebContentsId(), query: '' }).catch(() => {}); } catch {}
  }
  if (item.id === activeTabId && pageFind) pageFind.hidden = true;
}

function closePageFind(focusPage = true) {
  closePageFindFor(activeTab());
  if (focusPage) activeTab()?.view?.focus();
}

function openPageFind() {
  const item = activeTab();
  if (!item || !pageFind) return;
  if (isShellPage(item)) {
    item.newTabView?.querySelector('input[type="search"], input')?.focus();
    return;
  }
  pageFind.hidden = false;
  pageFindInput.value = item.findQuery || '';
  pageFindCount.textContent = '0/0';
  pageFindInput.focus();
  pageFindInput.select();
  if (item.findQuery) runPageFind(true, true);
}

async function runPageFind(forward = true, newSession = false) {
  const item = activeTab();
  if (!item?.view || isShellPage(item)) return;
  const query = pageFindInput.value;
  const changed = query !== item.findQuery;
  item.findQuery = query;
  item.findToken = ++nextFindToken;
  const token = item.findToken;
  if (!query) pageFindCount.textContent = '0/0';
  try {
    const result = await window.shellApi?.findPage?.({ webContentsId: item.view.getWebContentsId(), query, token, forward, findNext: changed || newSession });
    if (item.findToken === token && result?.ok === false) pageFindCount.textContent = '0/0';
  } catch { if (item.findToken === token) pageFindCount.textContent = '0/0'; }
}

function runBrowserShortcut(command) {
  const item = activeTab();
  if (command === 'new-tab') createTab('about:newtab');
  else if (command === 'dismiss-popovers') dismissBrowserPopovers();
  else if (command === 'restore-closed-tab') restoreClosedTab();
  else if (command === 'close-tab') closeTab(activeTabId);
  else if (command === 'next-tab' || command === 'previous-tab') cycleTab(command === 'next-tab' ? 1 : -1);
  else if (command.startsWith('activate-tab-')) {
    const target = tabItems[Number(command.slice('activate-tab-'.length)) - 1];
    if (target) activateTab(target.id);
  } else if (command === 'activate-last-tab' && tabItems.length) activateTab(tabItems.at(-1).id);
  else if (command === 'focus-address') { address.focus(); address.select(); }
  else if (command === 'find') openPageFind();
  else if (command === 'find-next' || command === 'find-previous') {
    if (pageFind?.hidden) openPageFind(); else runPageFind(command === 'find-next');
  } else if (command === 'history') openHistoryPage();
  else if (command === 'clear-data') void runBrowserCommand('clear-data');
  else if (command === 'downloads') { if (downloadsPanel?.hidden) downloadsToggle?.click(); }
  else if (command === 'toggle-bookmark-bar') void toggleBookmarkBar();
  else if (command === 'toggle-tab-switcher') toggleTabSwitcher();
  else if (command === 'reload') reloadActivePage();
  else if (command === 'reload-ignoring-cache') {
    if (isShellPage(item)) reloadActivePage(); else item?.view?.reloadIgnoringCache();
  } else if (command === 'back' && !backButton?.disabled) item?.view?.goBack();
  else if (command === 'forward' && !forwardButton?.disabled) item?.view?.goForward();
  else if (command === 'bookmark') void toggleBookmark();
  else if (command === 'print') item?.view?.print?.({});
  else if (command === 'fullscreen') void window.shellApi?.toggleFullscreen?.();
  else if (command === 'zoom-reset') shellInterfaceZoom?.reset();
  else if (command === 'zoom-in' || command === 'zoom-out') shellInterfaceZoom?.step(command === 'zoom-in' ? 1 : -1);
  else if (command === 'escape') {
    if (pageFind?.hidden === false) closePageFind();
    else if (downloadsPanel?.hidden === false) { downloadsPanel.hidden = true; downloadsToggle?.setAttribute('aria-expanded', 'false'); }
    else if (extensionsPanel?.hidden === false) { extensionsPanel.hidden = true; extensionsToggle?.setAttribute('aria-expanded', 'false'); }
    else if (browserMoreMenu?.hidden === false) closeBrowserMoreMenu();
    else if (browserSettingsPanel?.hidden === false) setBrowserSettingsOpen(false);
    else if (item?.loading) { item.view?.stop(); item.loading = false; syncNavigationControls(); renderTabs(); }
  }
}

function syncAddress() {
  if (tornDown || !address) return;
  const item = activeTab();
  const value = currentWebviewUrl() || item?.url || startUrl;
  finishAddressEditing();
  address.value = value === 'about:blank' ? '' : (isNewTabUrl(value) ? '' : value);
  if (document.activeElement === address) hideAddressSchemeForEditing();
  renderBookmarkToggle();
  syncAgentContext();
}

function navigateAddress(value, template) {
  const raw = String(value ?? '').trim();
  if (isHistoryUrl(raw)) {
    openHistoryPage();
    return;
  }
  if (/^chrome:\/\//i.test(raw)) {
    setShellStatus('此浏览器不支持 chrome:// 内部页面', 'error');
    return;
  }
  const url = looksLikeAddress(raw) || /^(?:https?|about:|file:|data:|blob:|chrome-extension:|view-source:)/i.test(raw)
    ? normalizedUrl(raw)
    : searchUrlFor(raw, template);
  const item = activeTab();
  if (!item) return;
  if (isNewTabUrl(url)) {
    resetTabToNewTab(item);
    activateTab(item.id, false);
    return;
  }
  const hadView = Boolean(item.view && !isShellPage(item));
  item.url = url;
  item.title = tabFallbackTitle(url);
  clearTabFavicon(item);
  resetPageDominantColor(item);
  item.accentSource = '';
  const targetView = ensureWebviewForTab(item);
  renderTabs();
  recordNavigation(url, tabFallbackTitle(url));
  webview = targetView;
  if (hadView && typeof targetView?.loadURL === 'function') {
    void targetView.loadURL(url).catch((error) => {
      if (item.id === activeTabId) setShellStatus(`导航失败：${error.message || '未知错误'}`, 'error');
    });
  }
  if (item.id === activeTabId) {
    item.loading = true;
    syncNavigationControls();
    setShellStatus('加载中', 'busy');
    renderBookmarkBar();
  }
  renderBookmarkToggle();
}

function reloadActivePage() {
  if (activeTabIsNewTab()) {
    const item = activeTab();
    void refreshNewTabPage(item);
    return;
  }
  if (activeTab()?.isHistory) {
    renderHistoryPage(activeTab());
    return;
  }
  if (webview && typeof webview.reload === 'function') webview.reload();
}

function toggleActiveDevTools() {
  if (!webview || activeTabIsNewTab()) return;
  try {
    if (typeof webview.isDevToolsOpened === 'function' && webview.isDevToolsOpened()) webview.closeDevTools?.();
    else webview.openDevTools?.({ mode: 'detach' });
  } catch {
    setShellStatus('开发者工具暂不可用', 'error');
  }
}

function eventShortcutKey(event) {
  const value = String(event?.key || '').trim();
  if (/^f\d{1,2}$/i.test(value)) return value.toUpperCase();
  if (/^[a-z]$/i.test(value) || /^\d$/.test(value)) return value.toUpperCase();
  const aliases = { Esc: 'Escape', Spacebar: 'Space', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown' };
  return aliases[value] || value;
}

function browserShortcutMatches(event, shortcut) {
  const parts = String(shortcut || '').split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return false;
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));
  return eventShortcutKey(event) === key
    && Boolean(event.ctrlKey) === modifiers.has('Ctrl')
    && Boolean(event.altKey) === modifiers.has('Alt')
    && Boolean(event.shiftKey) === modifiers.has('Shift')
    && Boolean(event.metaKey) === modifiers.has('Meta');
}

function currentWebviewUrl() {
  try {
    const item = activeTab();
    if (item?.isHistory) return 'about:history';
    if (item?.isNewTab) return 'about:newtab';
    return item?.domReady && webview && typeof webview.getURL === 'function'
      ? webview.getURL()
      : item?.url || address.value || startUrl;
  } catch {
    return address.value || 'about:newtab';
  }
}

async function refreshBookmarks() {
  if (!window.shellApi?.getBookmarks) return;
  try {
    const result = await window.shellApi.getBookmarks();
    if (result?.ok === false) throw new Error(result.error || '读取收藏失败');
    applyBookmarkState(Array.isArray(result?.bookmarks) ? result.bookmarks : []);
  } catch (error) {
    setShellStatus(`收藏同步失败：${error.message || '未知错误'}`, 'error');
  }
}

async function refreshDownloads() {
  if (!window.shellApi?.getDownloads) return;
  try {
    const result = await window.shellApi.getDownloads();
    if (result?.ok !== false) renderDownloads(result?.downloads || []);
  } catch {
    // Download state is informational; a failed refresh must not interrupt page use.
  }
}

function closeLocalListeners() {
  if (localListenersPanel) localListenersPanel.hidden = true;
  localListenersToggle?.setAttribute('aria-expanded', 'false');
}

function renderLocalListeners() {
  if (!localListenersList) return;
  const scheme = localListenersScheme?.value === 'https' ? 'https' : 'http';
  localListenersList.textContent = '';
  for (const [index, listener] of localListeners.entries()) {
    const item = document.createElement('div');
    item.className = 'local-listener-item';
    const targetUrl = `${scheme}://${listener.urlHost}:${listener.port}/`;
    const heading = document.createElement('div');
    heading.className = 'local-listener-heading';
    const open = document.createElement('button');
    open.className = 'local-listener-open';
    open.type = 'button';
    open.dataset.localListenerIndex = String(index);
    open.textContent = targetUrl;
    open.setAttribute('aria-label', `打开 ${targetUrl}，项目 ${listener.projectName}`);
    const projectName = document.createElement('span');
    projectName.className = 'local-listener-project-name';
    projectName.textContent = listener.projectName;
    projectName.title = listener.projectName;
    const stop = document.createElement('button');
    stop.className = 'local-listener-stop';
    stop.type = 'button';
    stop.dataset.localListenerStopIndex = String(index);
    stop.title = '停止此服务';
    stop.setAttribute('aria-label', `停止 ${listener.projectName}，端口 ${listener.port}`);
    stop.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-stop"></use></svg>';
    heading.append(open, projectName, stop);
    const bind = document.createElement('span');
    bind.className = 'local-listener-bind';
    const addresses = Array.isArray(listener.addresses) && listener.addresses.length
      ? listener.addresses
      : [listener.address];
    const bindAddresses = addresses.map((address) => {
      const bindAddress = address.includes(':') ? `[${address}]` : address;
      return `${bindAddress}:${listener.port}`;
    });
    bind.textContent = `监听 ${bindAddresses.join('、')}`;
    item.append(heading, bind);
    localListenersList.append(item);
  }
  if (localListenersEmpty) {
    localListenersEmpty.hidden = localListeners.length > 0 || localListenersStatus?.dataset.error === 'true';
  }
}

async function refreshLocalListeners() {
  const request = ++localListenersRequest;
  if (localListenersStatus) {
    localListenersStatus.dataset.error = 'false';
    localListenersStatus.textContent = '正在读取本地监听端口…';
  }
  if (localListenersRefresh) localListenersRefresh.disabled = true;
  try {
    const result = await window.shellApi?.getLocalListeners?.();
    if (request !== localListenersRequest) return;
    if (result?.ok === false) throw new Error(result.error || '读取本地监听端口失败');
    if (!result) throw new Error('当前窗口不支持读取本地监听端口');
    localListeners = Array.isArray(result.listeners) ? result.listeners : [];
    if (localListenersStatus) localListenersStatus.textContent = `找到 ${localListeners.length} 个前端项目端口`;
    renderLocalListeners();
  } catch (error) {
    if (request !== localListenersRequest) return;
    localListeners = [];
    if (localListenersStatus) {
      localListenersStatus.dataset.error = 'true';
      localListenersStatus.textContent = error?.message || '读取本地监听端口失败';
    }
    renderLocalListeners();
  } finally {
    if (request === localListenersRequest && localListenersRefresh) localListenersRefresh.disabled = false;
  }
}

function openLocalListener(index) {
  const listener = localListeners[index];
  if (!listener) return;
  const scheme = localListenersScheme?.value === 'https' ? 'https' : 'http';
  closeLocalListeners();
  navigateAddress(`${scheme}://${listener.urlHost}:${listener.port}/`);
}

async function stopLocalListener(index, button) {
  const listener = localListeners[index];
  if (!listener) return;
  const pid = Number(listener.pid);
  const port = Number(listener.port);
  if (!Number.isSafeInteger(pid) || pid < 1 || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    setShellStatus('本地服务信息无效，请刷新后重试', 'error');
    return;
  }

  if (button) button.disabled = true;
  try {
    const scheme = localListenersScheme?.value === 'https' ? 'https' : 'http';
    const targetUrl = `${scheme}://${listener.urlHost}:${listener.port}/`;
    const confirmed = await requestShellConfirmation({
      eyebrow: '本地服务',
      title: '停止本地服务？',
      message: `确定要停止“${listener.projectName}”吗？`,
      detail: `${targetUrl} · PID ${pid}`,
      confirmLabel: '停止服务',
      cancelLabel: '取消',
      isDangerous: true,
    });
    if (!confirmed) return;

    const result = await window.shellApi?.stopLocalListener?.({ pid, port, projectName: listener.projectName });
    if (result?.ok === false) throw new Error(result.error || '停止本地服务失败');
    if (!result) throw new Error('当前窗口不支持停止本地服务');
    await refreshLocalListeners();
    setShellStatus(`已停止 ${listener.projectName}`);
  } catch (error) {
    setShellStatus(`停止本地服务失败：${error?.message || '未知错误'}`, 'error');
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

async function handleDownloadAction(action, downloadId) {
  if (!downloadId || !window.shellApi) return;
  try {
    const result = action === 'cancel' ? await window.shellApi.cancelDownload(downloadId)
      : action === 'pause' || action === 'resume' ? await window.shellApi.controlDownload({ id: downloadId, action })
        : await window.shellApi.openDownload({ id: downloadId, action });
    if (result?.ok === false) throw new Error(result.error || '下载操作失败');
    if (['cancel', 'pause', 'resume'].includes(action)) await refreshDownloads();
  } catch (error) {
    setShellStatus(`下载操作失败：${error.message || '未知错误'}`, 'error');
  }
}

async function clearCompletedDownloads() {
  if (!window.shellApi?.clearDownloads) return;
  try {
    const result = await window.shellApi.clearDownloads();
    if (result?.ok === false) throw new Error(result.error || '清除下载记录失败');
    renderDownloads(result.downloads || []);
  } catch (error) {
    setShellStatus(`清除下载记录失败：${error.message || '未知错误'}`, 'error');
  }
}

async function toggleBookmark() {
  const url = bookmarkableUrl(currentWebviewUrl());
  if (!url || !window.shellApi) {
    setShellStatus('空白页不能收藏', 'error');
    return;
  }
  const existing = bookmarks.find((item) => item.type === 'bookmark' && item.url === url);
  try {
    const result = existing
      ? await window.shellApi.deleteBookmark({ id: existing.id, url })
      : await window.shellApi.saveBookmark({
        url,
        title: lastPageTitle || tabFallbackTitle(url),
        favicon: activeTab()?.favicon || '',
      });
    if (result?.ok === false) throw new Error(result.error || '收藏操作失败');
    applyBookmarkState(Array.isArray(result?.bookmarks) ? result.bookmarks : bookmarks.filter((item) => item.id !== existing?.id));
    setShellStatus(existing ? '已移除收藏' : '已添加收藏');
  } catch (error) {
    setShellStatus(`收藏操作失败：${error.message || '未知错误'}`, 'error');
  }
}

async function saveBookmarkFavicon(value, favicon) {
  const url = bookmarkableUrl(value);
  const bookmark = bookmarks.find((item) => item.type === 'bookmark' && item.url === url);
  if (!bookmark || bookmark.favicon === favicon || !window.shellApi?.getBookmarkFavicon) return;
  try {
    const result = await window.shellApi.getBookmarkFavicon({ id: bookmark.id, favicon });
    if (result?.ok === false) return;
    if (Array.isArray(result?.bookmarks)) applyBookmarkState(result.bookmarks);
  } catch {
    // Favicon persistence is opportunistic; the page and bookmark remain usable.
  }
}

function bookmarkPageTitle(url) {
  return lastPageTitle || activeTab()?.title || tabFallbackTitle(url);
}

function setBookmarksFromResult(result, fallbackMessage = '收藏操作失败') {
  if (result?.ok === false) throw new Error(result.error || fallbackMessage);
  if (Array.isArray(result?.bookmarks)) applyBookmarkState(result.bookmarks);
}

async function addCurrentBookmark(parentId = '') {
  const url = bookmarkableUrl(currentWebviewUrl());
  if (!url || !window.shellApi?.saveBookmark) return;
  closeBookmarkMenu();
  try {
    const result = await window.shellApi.saveBookmark({
      url,
      title: bookmarkPageTitle(url),
      favicon: activeTab()?.favicon || '',
      parentId,
    });
    setBookmarksFromResult(result);
    setShellStatus('已添加收藏');
  } catch (error) {
    setShellStatus(`收藏操作失败：${error.message || '未知错误'}`, 'error');
  }
}

async function addBookmarkFolder(parentId = '') {
  closeBookmarkMenu(true);
  const title = await requestShellInput({
    eyebrow: '收藏栏',
    title: '新建文件夹',
    message: '输入文件夹名称。',
    label: '文件夹名称',
    value: '新建文件夹',
  });
  if (title === null) return;
  if (!String(title).trim()) {
    setShellStatus('文件夹名称不能为空', 'error');
    return;
  }
  try {
    const result = await window.shellApi?.createBookmarkFolder?.({ title: String(title).trim(), parentId });
    setBookmarksFromResult(result, '创建文件夹失败');
    setShellStatus('已创建文件夹');
  } catch (error) {
    setShellStatus(`创建文件夹失败：${error.message || '未知错误'}`, 'error');
  }
}

async function editBookmark(item) {
  closeBookmarkMenu(true);
  const title = await requestShellInput({
    eyebrow: '收藏栏',
    title: '编辑收藏',
    message: '修改收藏名称。',
    label: '名称',
    value: item.title,
  });
  if (title === null) return;
  const url = await requestShellInput({
    eyebrow: '收藏栏',
    title: '编辑收藏',
    message: '修改要打开的网站地址。',
    label: '地址',
    value: item.url,
  });
  if (url === null) return;
  const normalizedUrl = bookmarkableUrl(url);
  if (!String(title).trim() || !normalizedUrl) {
    setShellStatus(!String(title).trim() ? '收藏名称不能为空' : '收藏地址必须是有效的 HTTP(S) URL', 'error');
    return;
  }
  try {
    const result = await window.shellApi?.updateBookmark?.({ id: item.id, title: String(title).trim(), url: normalizedUrl });
    setBookmarksFromResult(result, '编辑收藏失败');
    setShellStatus('收藏已更新');
  } catch (error) {
    setShellStatus(`编辑收藏失败：${error.message || '未知错误'}`, 'error');
  }
}

async function renameBookmarkFolder(folder) {
  closeBookmarkMenu(true);
  const title = await requestShellInput({
    eyebrow: '收藏栏',
    title: '重命名文件夹',
    message: '输入文件夹名称。',
    label: '文件夹名称',
    value: folder.title,
  });
  if (title === null) return;
  if (!String(title).trim()) {
    setShellStatus('文件夹名称不能为空', 'error');
    return;
  }
  try {
    const result = await window.shellApi?.updateBookmark?.({ id: folder.id, title: String(title).trim() });
    setBookmarksFromResult(result, '重命名文件夹失败');
    setShellStatus('文件夹已重命名');
  } catch (error) {
    setShellStatus(`重命名文件夹失败：${error.message || '未知错误'}`, 'error');
  }
}

function bookmarkDescendantCount(folderId) {
  const descendants = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of bookmarks) {
      if (item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) {
        descendants.add(item.id);
        changed = true;
      }
    }
  }
  return descendants.size - 1;
}

async function deleteBookmarkEntry(item) {
  closeBookmarkMenu(true);
  if (item.type === 'folder') {
    const count = bookmarkDescendantCount(item.id);
    if (count) {
      const confirmed = await requestShellConfirmation({
        eyebrow: '收藏栏',
        title: '删除文件夹？',
        message: `“${item.title}”及其中的 ${count} 项内容都会删除。`,
        confirmLabel: '删除',
        isDangerous: true,
      });
      if (!confirmed) return;
    }
  }
  try {
    const result = await window.shellApi?.deleteBookmark?.({ id: item.id });
    setBookmarksFromResult(result, '删除收藏内容失败');
    setShellStatus(item.type === 'folder' ? '文件夹已删除' : '收藏已删除');
  } catch (error) {
    setShellStatus(`删除收藏内容失败：${error.message || '未知错误'}`, 'error');
  }
}

async function runBookmarkMenuAction(action) {
  const context = bookmarkMenuContext;
  const item = context?.id ? bookmarkById(context.id) : null;
  if (!context) return;
  switch (action) {
    case 'add-current': await addCurrentBookmark(context.parentId || ''); break;
    case 'new-bookmark': await addCurrentBookmark(context.id); break;
    case 'new-folder': await addBookmarkFolder(context.type === 'folder' ? context.id : (context.parentId || '')); break;
    case 'open-current':
      openBookmarkEntry(item);
      break;
    case 'open-new-tab':
      openBookmarkEntry(item, { newTab: true });
      break;
    case 'open-folder':
      if (item?.type === 'folder') openBookmarkFolder(item.id);
      break;
    case 'open-all':
      if (item?.type === 'folder') openAllBookmarksInFolder(item.id);
      break;
    case 'edit-bookmark':
      if (item?.type === 'bookmark') await editBookmark(item);
      break;
    case 'rename-folder':
      if (item?.type === 'folder') await renameBookmarkFolder(item);
      break;
    case 'delete-bookmark': case 'delete-folder':
      if (item) await deleteBookmarkEntry(item);
      break;
    default: closeBookmarkMenu(); break;
  }
}

function syncAgentContext() {
  if (!agentContextTitle || !agentContextUrl) return;
  const url = currentWebviewUrl() || 'about:newtab';
  let title = lastPageTitle;
  try {
    if (!title && webview && typeof webview.getTitle === 'function') title = webview.getTitle();
  } catch {
    // The guest may be tearing down while the navigation bar is being updated.
  }
  agentContextTitle.textContent = title || (isNewTabUrl(url) ? '新标签页' : '当前页面');
  agentContextUrl.textContent = url;
}

function setBrowserSettingsStatus(message, isError = false) {
  if (!browserSettingsStatus) return;
  browserSettingsStatus.textContent = message || '';
  browserSettingsStatus.classList.toggle('is-error', Boolean(isError));
}

function applySharedTheme(theme = {}) {
  const root = document.documentElement;
  const value = (key, fallback) => typeof theme[key] === 'string' && theme[key] ? theme[key] : fallback;
  const numberValue = (key, fallback, min, max) => {
    const number = Number(theme[key]);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  root.style.setProperty('--shell-bg', value('background', '#0f1423'));
  root.style.setProperty('--shell-surface', value('surface', '#101f30'));
  root.style.setProperty('--shell-surface-soft', value('surfaceSoft', '#144a74'));
  root.style.setProperty('--shell-primary', value('primary', '#2474b5'));
  root.style.setProperty('--shell-primary-hover', value('primaryHover', '#10aec2'));
  root.style.setProperty('--shell-secondary', value('secondary', '#0eb0c9'));
  root.style.setProperty('--shell-text', value('text', '#f1f0ed'));
  root.style.setProperty('--shell-muted', value('textMuted', '#9fa39a'));
  root.style.setProperty('--shell-image', theme.backgroundImage ? `url(${theme.backgroundImage})` : 'none');
  const imageOpacity = numberValue('backgroundOpacity', .72, 0, 1);
  const blur = numberValue('blur', 18, 0, 40);
  root.style.setProperty('--shell-image-opacity', String(imageOpacity));
  root.style.setProperty('--shell-blur', `${blur}px`);
  applyNewTabAppearance();
}

function renderSearchEnginePresets() {
  if (searchEnginePresetInput) {
    searchEnginePresetInput.replaceChildren();
    for (const engine of searchEngines) {
      const option = document.createElement('option');
      option.value = engine.url;
      option.textContent = engine.name;
      option.selected = engine.url === searchEngineUrl;
      searchEnginePresetInput.append(option);
    }
    const custom = document.createElement('option');
    custom.value = '__custom__';
    custom.textContent = '自定义 URL';
    custom.selected = !searchEngines.some((engine) => engine.url === searchEngineUrl);
    searchEnginePresetInput.append(custom);
  }
}

function renderNewTabSitesEditor() {
  if (!newTabSitesEditor) return;
  newTabSitesEditor.textContent = '';
  draftNewTabSites = (Array.isArray(browserSettings.newTabSites) ? browserSettings.newTabSites : DEFAULT_NEW_TAB_SITES)
    .map((site) => ({ ...site }));
  draftNewTabSites.forEach((site, index) => {
    const row = document.createElement('div');
    row.className = 'new-tab-site-editor-row';
    const icon = document.createElement('input');
    icon.type = 'text';
    icon.maxLength = 8;
    icon.placeholder = '图标';
    icon.value = site.icon || '';
    icon.dataset.siteField = 'icon';
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 40;
    name.placeholder = '名称';
    name.value = site.name || '';
    name.dataset.siteField = 'name';
    const url = document.createElement('input');
    url.type = 'url';
    url.placeholder = 'https://';
    url.value = site.url || '';
    url.dataset.siteField = 'url';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'new-tab-site-remove';
    remove.title = '移除常用网站';
    remove.setAttribute('aria-label', `移除 ${site.name || '常用网站'}`);
    remove.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-close"></use></svg>';
    remove.addEventListener('click', () => {
      draftNewTabSites.splice(index, 1);
      renderNewTabSitesEditor();
    });
    [icon, name, url].forEach((input) => input.addEventListener('input', () => {
      draftNewTabSites[index][input.dataset.siteField] = input.value;
    }));
    row.append(icon, name, url, remove);
    newTabSitesEditor.append(row);
  });
}

function renderBrowserSettings(nextSettings) {
  browserSettingsLoaded = true;
  browserSettings = {
    ...browserSettings,
    ...(nextSettings && typeof nextSettings === 'object' ? nextSettings : {}),
  };
  browserSettings.newTabDisplayMode = normalizeNewTabDisplayMode(browserSettings.newTabDisplayMode);
  pruneRemovedNewTabSiteFavicons();
  applySharedTheme(browserSettings.theme);
  searchEngineUrl = String(browserSettings.searchEngineUrl || DEFAULT_SEARCH_ENGINE_URL);
  searchEngines = Array.isArray(browserSettings.searchEngines) && browserSettings.searchEngines.length
    ? browserSettings.searchEngines.map((item) => ({ ...item }))
    : DEFAULT_SEARCH_ENGINES.map((item) => ({ ...item }));
  if (Array.isArray(browserSettings.newTabSites)) draftNewTabSites = browserSettings.newTabSites.map((site) => ({ ...site }));
  selectedBannerSource = String(browserSettings.newTabBanner?.source || '');
  if (agentApiUrlInput && document.activeElement !== agentApiUrlInput) agentApiUrlInput.value = String(browserSettings.agentApiUrl || '');
  if (agentProtocolSuffixInput && document.activeElement !== agentProtocolSuffixInput) agentProtocolSuffixInput.value = String(browserSettings.agentProtocolSuffix || '');
  if (agentApiInput && document.activeElement !== agentApiInput) agentApiInput.value = String(browserSettings.agentApi || '');
  if (searchEngineInput && document.activeElement !== searchEngineInput) searchEngineInput.value = searchEngineUrl;
  if (searchEnginePresetInput && document.activeElement !== searchEnginePresetInput) renderSearchEnginePresets();
  if (bookmarkBarAlwaysInput && document.activeElement !== bookmarkBarAlwaysInput) bookmarkBarAlwaysInput.checked = browserSettings.bookmarkBarAlwaysVisible === true;
  if (newTabBannerTypeInput && document.activeElement !== newTabBannerTypeInput) newTabBannerTypeInput.value = String(browserSettings.newTabBanner?.type || 'auto');
  if (newTabBannerSourceInput && document.activeElement !== newTabBannerSourceInput) newTabBannerSourceInput.value = selectedBannerSource;
  if (newTabBannerFileInput && document.activeElement !== newTabBannerFileInput) newTabBannerFileInput.value = '';
  if (document.activeElement !== newTabSitesEditor) renderNewTabSitesEditor();
  const shortcuts = browserSettings.browserShortcuts || {};
  const gesture = browserSettings.mouseGesture || {};
  if (shortcutReloadInput && document.activeElement !== shortcutReloadInput) shortcutReloadInput.value = String(shortcuts.reload || 'F5');
  if (shortcutDevtoolsInput && document.activeElement !== shortcutDevtoolsInput) shortcutDevtoolsInput.value = String(shortcuts.devtools || 'F12');
  if (gestureEnabledInput && document.activeElement !== gestureEnabledInput) gestureEnabledInput.checked = gesture.enabled !== false;
  if (gestureButtonInput && document.activeElement !== gestureButtonInput) gestureButtonInput.value = String(gesture.button || 'right');
  if (gestureSequenceInput && document.activeElement !== gestureSequenceInput) gestureSequenceInput.value = Array.isArray(gesture.sequence) ? gesture.sequence.join(',') : 'right,left';
  if (gestureActionInput && document.activeElement !== gestureActionInput) gestureActionInput.value = String(gesture.action || 'back');
  if (gestureThresholdInput && document.activeElement !== gestureThresholdInput) gestureThresholdInput.value = String(gesture.threshold ?? 80);
  if (agentKeyInput && document.activeElement !== agentKeyInput) agentKeyInput.value = '';
  if (agentKeyStatus) agentKeyStatus.textContent = browserSettings.agentKeySet ? '已保存密钥' : '未保存密钥';
  if (agentKeyClear) agentKeyClear.hidden = !browserSettings.agentKeySet;
  renderAgentSettings(browserSettings);
  for (const item of tabItems) if (item.isNewTab) renderNewTabPage(item);
  renderBookmarkBar();
}

async function refreshBrowserSettings() {
  if (!window.shellApi?.getSettings) return;
  try {
    const result = await window.shellApi.getSettings();
    if (result?.ok === false) throw new Error(result.error || '读取设置失败');
    clearAgentKeyRequested = false;
    renderBrowserSettings(result?.settings);
    setBrowserSettingsStatus('');
  } catch (error) {
    setBrowserSettingsStatus(`读取设置失败：${error.message || '未知错误'}`, true);
  }
}

function setBrowserSettingsOpen(nextOpen) {
  const open = Boolean(nextOpen);
  if (browserSettingsPanel) browserSettingsPanel.hidden = !open;
  document.body.classList.toggle('browser-settings-open', open);
  browserSettingsToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    closeLocalListeners();
    if (extensionsPanel) extensionsPanel.hidden = true;
    extensionsToggle?.setAttribute('aria-expanded', 'false');
    void refreshBrowserSettings();
    window.setTimeout(() => searchEngineInput?.focus(), 0);
  }
}

async function saveBrowserSettings(event) {
  event?.preventDefault();
  if (!window.shellApi?.saveSettings || !browserSettingsSave) return;
  const selectedSearchEngine = searchEngineInput?.value.trim() || DEFAULT_SEARCH_ENGINE_URL;
  const nextSearchEngines = searchEngines.map((engine) => ({ ...engine }));
  if (selectedSearchEngine.includes('%s') && /^https?:\/\//i.test(selectedSearchEngine)
    && !nextSearchEngines.some((engine) => engine.url === selectedSearchEngine)) {
    nextSearchEngines.push({ id: 'custom', name: '自定义', url: selectedSearchEngine });
  }
  const bannerSource = selectedBannerSource || newTabBannerSourceInput?.value.trim() || '';
  if (bannerSource && !bannerSourceValid(bannerSource)) {
    setBrowserSettingsStatus('Banner 只支持 HTTP(S) 地址或本地图片/视频文件', true);
    return;
  }
  const payload = {
    searchEngineUrl: selectedSearchEngine,
    searchEngines: nextSearchEngines,
    bookmarkBarAlwaysVisible: Boolean(bookmarkBarAlwaysInput?.checked),
    newTabSites: draftNewTabSites,
    newTabBanner: {
      type: newTabBannerTypeInput?.value || 'auto',
      source: bannerSource,
    },
    browserShortcuts: {
      reload: shortcutReloadInput?.value.trim() || 'F5',
      devtools: shortcutDevtoolsInput?.value.trim() || 'F12',
    },
    mouseGesture: {
      enabled: Boolean(gestureEnabledInput?.checked),
      button: gestureButtonInput?.value || 'right',
      sequence: String(gestureSequenceInput?.value || 'right,left').split(','),
      action: gestureActionInput?.value || 'back',
      threshold: gestureThresholdInput?.value || '80',
    },
  };
  browserSettingsSave.disabled = true;
  setBrowserSettingsStatus('保存中…');
  try {
    const result = await window.shellApi.saveSettings(payload);
    if (result?.ok === false) throw new Error(result.error || '保存设置失败');
    clearAgentKeyRequested = false;
    renderBrowserSettings(result?.settings);
    setBrowserSettingsStatus(result?.agentKeyStatus === 'not-retained' ? '其他设置已保存，密钥未保留' : '设置已保存');
  } catch (error) {
    setBrowserSettingsStatus(`保存失败：${error.message || '未知错误'}`, true);
  } finally {
    browserSettingsSave.disabled = false;
  }
}

function setAgentSettingsStatus(message, isError = false) {
  if (!agentSettingsStatus) return;
  agentSettingsStatus.textContent = message || '';
  agentSettingsStatus.classList.toggle('is-error', Boolean(isError));
}

const DEFAULT_AGENT_REASONING_OPTIONS = [
  { id: 'off', label: '关闭' },
  { id: 'minimal', label: '最少' },
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'xhigh', label: '很高' },
  { id: 'max', label: '最大' },
];

function agentReasoningChoices(settings = browserSettings) {
  return Array.isArray(settings?.agentReasoningEfforts) && settings.agentReasoningEfforts.length
    ? settings.agentReasoningEfforts
    : DEFAULT_AGENT_REASONING_OPTIONS;
}

function agentReasoningLabel(settings, value) {
  const selected = String(value || 'medium');
  return String(agentReasoningChoices(settings).find((option) => String(option?.id) === selected)?.label || selected);
}

function renderAgentSettings(nextSettings = browserSettings) {
  const settings = nextSettings && typeof nextSettings === 'object' ? nextSettings : browserSettings;
  if (agentSettingScope) {
    const source = settings.agentSource === 'profile'
      ? '当前环境专属配置'
      : settings.agentSource === 'selected'
        ? 'Agent 页面已选环境的全局配置'
        : 'Agent 页面全局配置';
    agentSettingScope.textContent = `${profileName} · ${source}`;
  }
  if (agentProtocolInput) {
    const options = Array.isArray(settings.agentProtocols) && settings.agentProtocols.length
      ? settings.agentProtocols
      : [
        { id: 'openai-chat-completions', label: 'OpenAI Chat Completions' },
        { id: 'openai-responses', label: 'OpenAI Responses' },
        { id: 'anthropic-messages', label: 'Anthropic Messages' },
        { id: 'google-gemini', label: 'Google Gemini' },
      ];
    const selected = String(settings.agentProtocol || 'openai-chat-completions');
    agentProtocolInput.replaceChildren(...options.map((option) => {
      const node = document.createElement('option');
      node.value = option.id;
      node.textContent = option.label;
      node.selected = option.id === selected;
      return node;
    }));
  }
  if (agentReasoningInput) {
    const options = agentReasoningChoices(settings);
    const selected = String(settings.agentReasoningEffort || 'medium');
    agentReasoningInput.replaceChildren(...options.map((option) => {
      const node = document.createElement('option');
      node.value = option.id;
      node.textContent = option.label;
      node.selected = option.id === selected;
      return node;
    }));
  }
  renderAgentReasoningOptions(settings);
  if (agentBaseUrlInput && document.activeElement !== agentBaseUrlInput) agentBaseUrlInput.value = String(settings.agentBaseUrl || settings.agentApiUrl || '');
  if (agentModelInput && document.activeElement !== agentModelInput) agentModelInput.value = String(settings.agentModel || settings.agentApi || '');
  if (agentTokenInput && document.activeElement !== agentTokenInput) agentTokenInput.value = '';
  if (agentContextInput && document.activeElement !== agentContextInput) agentContextInput.value = String(settings.agentContextBudgetTokens ?? 200000);
  if (agentOutputInput && document.activeElement !== agentOutputInput) agentOutputInput.value = String(settings.agentMaxOutputTokens ?? 8192);
  if (agentReasoningInput && document.activeElement !== agentReasoningInput) agentReasoningInput.value = String(settings.agentReasoningEffort ?? 'medium');
  if (agentTemperatureInput && document.activeElement !== agentTemperatureInput) agentTemperatureInput.value = settings.agentTemperature === null ? '' : String(settings.agentTemperature ?? 0.2);
  if (agentStepsInput && document.activeElement !== agentStepsInput) agentStepsInput.value = String(settings.agentMaxSteps ?? 0);
  const tokenSet = Boolean(settings.agentTokenSet || settings.agentKeySet);
  if (agentTokenStatus) agentTokenStatus.textContent = tokenSet ? '已保存 Token' : '未保存 Token';
  if (agentTokenClear) agentTokenClear.hidden = !tokenSet;
  if (agentModelSummary) {
    const model = String(settings.agentModel || settings.agentApi || '').trim();
    const reasoning = agentReasoningLabel(settings, settings.agentReasoningEffort);
    agentModelSummary.textContent = settings.agentEnabled === false
      ? '当前环境未启用'
      : model
        ? `${model} · ${reasoning}`
        : '未配置模型';
    agentModelSummary.title = settings.agentEnabled === false
      ? '请在 Agent 页面激活当前环境'
      : !browserSettingsLoaded
        ? '正在读取当前环境配置'
        : model
          ? `模型ID：${model} · 思考等级：${reasoning}，点击切换`
          : '点击拉取模型列表';
    agentModelSummary.disabled = !browserSettingsLoaded || settings.agentEnabled === false;
  }
}

function setAgentModelPickerStatus(message, isError = false) {
  if (!agentModelPickerStatus) return;
  agentModelPickerStatus.textContent = message || '';
  agentModelPickerStatus.classList.toggle('is-error', Boolean(isError));
}

function setAgentSettingModelStatus(message, isError = false) {
  if (!agentSettingModelStatus) return;
  agentSettingModelStatus.textContent = message || '';
  agentSettingModelStatus.classList.toggle('is-error', Boolean(isError));
}

function closeAgentModelPicker() {
  if (agentModelPicker) agentModelPicker.hidden = true;
  agentModelSummary?.setAttribute('aria-expanded', 'false');
}

function renderAgentModelOptions(models, selectedModel = '') {
  const selected = String(selectedModel || '').trim();
  if (agentModelOptions) agentModelOptions.replaceChildren();
  if (agentSettingModelOptions) agentSettingModelOptions.replaceChildren();
  for (const model of Array.isArray(models) ? models : []) {
    const id = String(model?.id || '').trim();
    if (!id) continue;
    if (agentModelOptions) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'agent-model-option';
      option.setAttribute('role', 'option');
      option.dataset.modelId = id;
      option.setAttribute('aria-selected', id === selected ? 'true' : 'false');
      option.textContent = String(model?.label || id);
      option.title = id;
      option.addEventListener('click', () => void selectAgentModel(id));
      agentModelOptions.append(option);
    }
    if (agentSettingModelOptions) {
      const option = document.createElement('option');
      option.value = id;
      if (model?.label && model.label !== id) option.label = String(model.label);
      agentSettingModelOptions.append(option);
    }
  }
}

function renderAgentReasoningOptions(settings = browserSettings) {
  if (!agentReasoningOptions) return;
  const selected = String(settings?.agentReasoningEffort || agentReasoningInput?.value || 'medium');
  agentReasoningOptions.replaceChildren();
  for (const optionValue of agentReasoningChoices(settings)) {
    const id = String(optionValue?.id || '').trim();
    if (!id) continue;
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'agent-reasoning-option';
    option.setAttribute('role', 'option');
    option.dataset.reasoningEffort = id;
    option.setAttribute('aria-selected', id === selected ? 'true' : 'false');
    option.textContent = String(optionValue?.label || id);
    option.addEventListener('click', () => void selectAgentReasoning(id));
    agentReasoningOptions.append(option);
  }
}

async function fetchAgentModels() {
  if (!window.shellApi?.fetchAgentModels) return;
  if (agentModelRequestId) return;
  const requestId = ++agentModelFetchSequence;
  const payload = {
    protocol: agentProtocolInput?.value || browserSettings.agentProtocol,
    baseUrl: agentBaseUrlInput?.value.trim() || browserSettings.agentBaseUrl,
  };
  if (!payload.baseUrl) {
    const message = '请先填写接口地址';
    setAgentModelPickerStatus(message, true);
    setAgentSettingModelStatus(message, true);
    return;
  }
  const token = agentTokenInput?.value.trim() || '';
  if (token) payload.token = token;
  setAgentModelPickerStatus('正在拉取模型列表…');
  setAgentSettingModelStatus('正在拉取模型列表…');
  for (const button of [agentModelRefresh, agentSettingModelRefresh]) {
    button?.classList.add('is-loading');
    button?.setAttribute('title', '取消模型列表请求');
    button?.setAttribute('aria-label', '取消模型列表请求');
  }
  try {
    const result = await window.shellApi.fetchAgentModels(payload, (id) => {
      if (requestId === agentModelFetchSequence) agentModelRequestId = id;
    });
    if (requestId !== agentModelFetchSequence) return;
    if (!result || result.ok === false) throw new Error(result?.error || '模型列表获取失败');
    const models = Array.isArray(result.models) ? result.models : [];
    renderAgentModelOptions(models, browserSettings.agentModel || agentModelInput?.value);
    const message = models.length ? `可用模型 ${models.length} 个` : '接口未返回模型，请手动填写模型';
    setAgentModelPickerStatus(message);
    setAgentSettingModelStatus(message);
  } catch (error) {
    if (requestId !== agentModelFetchSequence) return;
    renderAgentModelOptions([], browserSettings.agentModel || agentModelInput?.value);
    if (error.message === '请求已取消') {
      setAgentModelPickerStatus('模型列表请求已取消');
      setAgentSettingModelStatus('模型列表请求已取消');
    } else {
      const message = `获取失败：${error.message || '未知错误'}`;
      setAgentModelPickerStatus(message, true);
      setAgentSettingModelStatus(message, true);
    }
  } finally {
    if (requestId === agentModelFetchSequence) {
      agentModelRequestId = '';
      for (const button of [agentModelRefresh, agentSettingModelRefresh]) {
        button?.classList.remove('is-loading');
        button?.setAttribute('title', '刷新模型列表');
        button?.setAttribute('aria-label', '刷新模型列表');
      }
    }
  }
}

function cancelAgentModelFetch() {
  if (!agentModelRequestId) return false;
  window.shellApi?.cancelAgentRequest?.(agentModelRequestId);
  agentModelRequestId = '';
  agentModelFetchSequence += 1;
  setAgentModelPickerStatus('模型列表请求已取消');
  setAgentSettingModelStatus('模型列表请求已取消');
  for (const button of [agentModelRefresh, agentSettingModelRefresh]) {
    button?.classList.remove('is-loading');
    button?.setAttribute('title', '刷新模型列表');
    button?.setAttribute('aria-label', '刷新模型列表');
  }
  return true;
}

async function selectAgentModel(model) {
  const value = String(model || '').trim();
  if (!value) return;
  if (agentModelInput) agentModelInput.value = value;
  closeAgentModelPicker();
  if (!window.shellApi?.saveSettings) return;
  try {
    const result = await window.shellApi.saveSettings({
      agentOnly: true,
      agentProtocol: agentProtocolInput?.value || browserSettings.agentProtocol || 'openai-chat-completions',
      agentBaseUrl: agentBaseUrlInput?.value.trim() || browserSettings.agentBaseUrl || '',
      agentModel: value,
    });
    if (result?.ok === false) throw new Error(result.error || '模型切换失败');
    renderBrowserSettings(result?.settings);
    setShellStatus(`已切换 Agent 模型：${value}`);
  } catch (error) {
    setAgentModelPickerStatus(`切换失败：${error.message || '未知错误'}`, true);
  }
}

async function selectAgentReasoning(value) {
  const effort = String(value || '').trim();
  if (!effort) return;
  if (agentReasoningInput) agentReasoningInput.value = effort;
  renderAgentReasoningOptions({ ...browserSettings, agentReasoningEffort: effort });
  if (!window.shellApi?.saveSettings) return;
  try {
    const result = await window.shellApi.saveSettings({ agentOnly: true, agentReasoningEffort: effort });
    if (result?.ok === false) throw new Error(result.error || '思考等级切换失败');
    renderBrowserSettings(result?.settings);
    setAgentModelPickerStatus(`思考等级：${agentReasoningLabel(result?.settings || browserSettings, effort)}`);
  } catch (error) {
    setAgentModelPickerStatus(`切换失败：${error.message || '未知错误'}`, true);
  }
}

function setAgentSettingsOpen(nextOpen) {
  const open = Boolean(nextOpen);
  if (agentSettingsPanel) agentSettingsPanel.hidden = !open;
  agentSettingsToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    setBrowserSettingsOpen(false);
    clearAgentTokenRequested = false;
    void refreshBrowserSettings();
    window.setTimeout(() => agentProtocolInput?.focus(), 0);
  }
}

async function saveAgentSettings(event) {
  event?.preventDefault();
  if (!window.shellApi?.saveSettings || !agentSettingsSave) return;
  const payload = {
    agentOnly: true,
    agentProtocol: agentProtocolInput?.value || 'openai-chat-completions',
    agentBaseUrl: agentBaseUrlInput?.value.trim() || '',
    agentModel: agentModelInput?.value.trim() || '',
    agentContextBudgetTokens: agentContextInput?.value || '200000',
    agentMaxOutputTokens: agentOutputInput?.value || '8192',
    agentReasoningEffort: agentReasoningInput?.value || 'medium',
    agentTemperature: agentTemperatureInput?.value === '' ? null : agentTemperatureInput?.value,
    agentMaxSteps: agentStepsInput?.value || '0',
  };
  const token = agentTokenInput?.value.trim() || '';
  if (token || clearAgentTokenRequested) {
    payload.agentToken = token;
    if (clearAgentTokenRequested) payload.clearAgentToken = true;
  }
  agentSettingsSave.disabled = true;
  setAgentSettingsStatus('保存中…');
  try {
    const result = await window.shellApi.saveSettings(payload);
    if (result?.ok === false) throw new Error(result.error || '保存 Agent 设置失败');
    clearAgentTokenRequested = false;
    renderBrowserSettings(result?.settings);
    setAgentSettingsStatus(result?.agentKeyStatus === 'not-retained' ? '设置已保存，Token 未保留' : '设置已保存');
  } catch (error) {
    setAgentSettingsStatus(`保存失败：${error.message || '未知错误'}`, true);
  } finally {
    agentSettingsSave.disabled = false;
  }
}

function formatAgentValue(value) {
  if (typeof value === 'string') return value.slice(0, 20000);
  try {
    const formatted = JSON.stringify(value, null, 2) || '无可显示结果';
    return formatted.length > 20000 ? `${formatted.slice(0, 20000)}\n…结果已截断` : formatted;
  } catch {
    return String(value ?? '无可显示结果').slice(0, 20000);
  }
}

async function copyAgentText(value, button) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const helper = document.createElement('textarea');
      helper.value = value;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.append(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    if (button) {
      button.title = '已复制';
      window.setTimeout(() => { button.title = '复制结果'; }, 1200);
    }
  } catch {
    if (agentState) agentState.textContent = '复制失败';
  }
}

const AGENT_TOOL_LABELS = Object.freeze({
  browser_observe: '观察当前页面',
  browser_read_page: '读取页面内容',
  browser_collect_links: '收集页面链接',
  browser_collect_tables: '收集页面表格',
  browser_open: '打开网页',
  browser_tabs: '查看标签页',
  browser_new_tab: '新建标签页',
  browser_switch_tab: '切换标签页',
  browser_close_tab: '关闭标签页',
  browser_tab_control: '控制标签页',
  browser_click_selector: '点击页面元素',
  browser_fill_selector: '填写页面元素',
  browser_select_option: '选择下拉项',
  browser_downloads: '查看下载记录',
  browser_choose_files: '选择本地文件',
  browser_choose_folder: '选择本地文件夹',
  browser_list_files: '读取文件夹内容',
  browser_read_file: '读取本地文件',
  browser_upload_files: '上传本地文件',
  browser_click: '点击页面坐标',
  browser_type: '输入文字',
  browser_keypress: '发送键盘操作',
  browser_scroll: '滚动页面',
  browser_drag: '拖拽页面元素',
  browser_wait: '等待页面响应',
  browser_configure_shortcuts: '更新浏览器快捷键',
});

function agentToolLabel(name, rawArguments) {
  const value = String(name || '').trim();
  const args = rawArguments === undefined ? {} : parseModelToolArguments(rawArguments);
  const point = (x, y) => `（${Number(x)}, ${Number(y)}）`;
  if (value === 'browser_click' && Number.isFinite(Number(args.x)) && Number.isFinite(Number(args.y))) {
    const button = String(args.button || 'left').toLowerCase();
    const prefix = button === 'right' ? '右键点击' : button === 'middle' ? '中键点击' : Number(args.clickCount) > 1 ? '双击' : '点击';
    return `${prefix}页面坐标${point(args.x, args.y)}`;
  }
  if (value === 'browser_scroll' && Number.isFinite(Number(args.x)) && Number.isFinite(Number(args.y))) {
    const deltaX = Number(args.deltaX || 0);
    const deltaY = Number(args.deltaY || 0);
    const direction = deltaY ? (deltaY > 0 ? '向下' : '向上') : deltaX > 0 ? '向右' : '向左';
    return `在页面坐标${point(args.x, args.y)}${direction}滚动 ${Math.abs(deltaY || deltaX)}px`;
  }
  if (value === 'browser_keypress') {
    const keys = Array.isArray(args.keys) ? args.keys : String(args.keys || '').split('+');
    return `按键 ${keys.map((key) => key === 'Control' ? 'Ctrl' : String(key)).join('+')}`;
  }
  if (value === 'browser_type') return `输入文字（${String(args.text || '').length} 字）`;
  if (value === 'browser_wait') return `等待页面响应（${Math.max(0, Math.round(Number(args.ms) || 0))}ms）`;
  if (value === 'browser_click_selector') return `点击页面元素（${String(args.selector || '').slice(0, 90)}）`;
  if (value === 'browser_fill_selector') return `填写页面元素（${String(args.selector || '').slice(0, 90)}）`;
  if (value === 'browser_select_option') return `选择页面下拉项（${String(args.selector || '').slice(0, 90)}）`;
  if (value === 'browser_drag' && Array.isArray(args.path) && args.path.length >= 2) {
    const from = args.path[0] || {};
    const to = args.path[args.path.length - 1] || {};
    const coords = (item) => Array.isArray(item) ? point(item[0], item[1]) : point(item.x, item.y);
    return `拖拽页面坐标${coords(from)}到${coords(to)}`;
  }
  return AGENT_TOOL_LABELS[value] || value.slice(0, 120) || '网页操作';
}

function hideAgentThinking() {
  if (!agentThinkingRow) return;
  agentThinkingRow.remove();
  agentThinkingRow = null;
}

function showAgentThinking(label = '正在思考') {
  if (!agentTranscript) return;
  if (agentThinkingRow) {
    const text = agentThinkingRow.querySelector('.agent-thinking-label');
    if (text) text.textContent = label;
    agentTranscript.append(agentThinkingRow);
    agentTranscript.scrollTop = agentTranscript.scrollHeight;
    return;
  }
  const row = document.createElement('div');
  row.className = 'agent-message agent-message-thinking';
  row.setAttribute('aria-live', 'polite');
  const card = document.createElement('div');
  card.className = 'agent-thinking-card';
  const icon = document.createElement('span');
  icon.className = 'agent-thinking-icon';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'agent-thinking-label';
  text.textContent = label;
  const dots = document.createElement('span');
  dots.className = 'agent-thinking-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.innerHTML = '<i></i><i></i><i></i>';
  card.append(icon, text, dots);
  row.append(card);
  agentThinkingRow = row;
  agentTranscript.append(row);
  agentTranscript.scrollTop = agentTranscript.scrollHeight;
}

function appendAgentStreamingMessage(initialText = '') {
  if (!agentTranscript) return null;
  const row = document.createElement('div');
  row.className = 'agent-message agent-message-assistant agent-message-streaming';
  const bubble = document.createElement('div');
  bubble.className = 'agent-message-bubble';
  bubble.textContent = initialText;
  row.append(bubble);
  agentTranscript.append(row);
  agentTranscript.scrollTop = agentTranscript.scrollHeight;
  return {
    row,
    setText(text) {
      bubble.textContent = String(text || '');
      agentTranscript.scrollTop = agentTranscript.scrollHeight;
    },
  };
}

function appendAgentAction(name, state = '执行中', options = {}) {
  if (!agentTranscript) return null;
  const row = document.createElement('div');
  row.className = 'agent-message agent-message-assistant agent-message-action';
  const details = document.createElement('details');
  details.className = 'agent-action-details';
  const card = document.createElement('summary');
  card.className = 'agent-action-card';
  if (options.error) card.classList.add('is-error');
  const heading = document.createElement('div');
  heading.className = 'agent-action-heading';
  const icon = document.createElement('span');
  icon.className = 'agent-action-icon';
  icon.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-mouse"></use></svg>';
  const label = document.createElement('span');
  label.className = 'agent-action-label';
  label.textContent = agentToolLabel(name, options.arguments);
  const status = document.createElement('span');
  status.className = 'agent-action-status';
  status.textContent = state;
  heading.append(icon, label, status);
  card.append(heading);
  details.append(card);

  let resultView = null;
  const addResult = (value, resultLabel = '结果') => {
    if (value === undefined) return;
    resultView?.remove();
    const formatted = formatAgentValue(value);
    const result = document.createElement('div');
    result.className = 'agent-result agent-action-result';
    const heading = document.createElement('div');
    heading.className = 'agent-result-heading';
    const label = document.createElement('span');
    label.textContent = resultLabel;
    const copy = document.createElement('button');
    copy.className = 'agent-copy-result';
    copy.type = 'button';
    copy.title = '复制结果';
    copy.setAttribute('aria-label', '复制结果');
    copy.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-copy"></use></svg>';
    copy.addEventListener('click', () => void copyAgentText(formatted, copy));
    heading.append(label, copy);
    const pre = document.createElement('pre');
    pre.textContent = formatted;
    result.append(heading, pre);
    details.append(result);
    resultView = result;
  };
  addResult(options.result, options.resultLabel);
  row.append(details);
  agentTranscript.append(row);
  agentTranscript.scrollTop = agentTranscript.scrollHeight;
  return {
    setState(nextState, { error = false, result, resultLabel } = {}) {
      status.textContent = nextState;
      card.classList.toggle('is-error', Boolean(error));
      if (result !== undefined) addResult(result, resultLabel);
      agentTranscript.scrollTop = agentTranscript.scrollHeight;
    },
  };
}

function ensureAgentWelcome() {
  if (agentWelcomeShown || !agentTranscript) return;
  agentWelcomeShown = true;
  appendAgentMessage('你好，我是网页助手。可以和我聊天，也可以让我帮你查看或操作当前网页。告诉我你正在做什么就好。');
}

function appendAgentMessage(text, role = 'assistant', options = {}) {
  if (!agentTranscript) return;
  const row = document.createElement('div');
  row.className = `agent-message agent-message-${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'agent-message-bubble';
  if (options.error) bubble.classList.add('agent-error');
  if (text) bubble.textContent = text;

  if (Array.isArray(options.images) && options.images.length) {
    const images = document.createElement('div');
    images.className = 'agent-message-images';
    for (const [index, image] of options.images.entries()) {
      if (!image?.dataUrl) continue;
      const preview = document.createElement('img');
      preview.src = image.dataUrl;
      preview.alt = image.name || `消息图片 ${index + 1}`;
      images.append(preview);
    }
    if (images.childElementCount) bubble.append(images);
  }

  if (Object.prototype.hasOwnProperty.call(options, 'result')) {
    const formatted = formatAgentValue(options.result);
    const result = document.createElement('div');
    result.className = 'agent-result';
    const heading = document.createElement('div');
    heading.className = 'agent-result-heading';
    const label = document.createElement('span');
    label.textContent = options.label || '结果';
    const copy = document.createElement('button');
    copy.className = 'agent-copy-result';
    copy.type = 'button';
    copy.title = '复制结果';
    copy.setAttribute('aria-label', '复制结果');
    copy.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-copy"></use></svg>';
    copy.addEventListener('click', () => void copyAgentText(formatted, copy));
    heading.append(label, copy);
    const pre = document.createElement('pre');
    pre.textContent = formatted;
    result.append(heading, pre);
    bubble.append(result);
  }

  row.append(bubble);
  agentTranscript.append(row);
  agentTranscript.scrollTop = agentTranscript.scrollHeight;
}

function setAgentComposerAttachmentStatus(message, isError = false) {
  if (!agentComposerAttachmentStatus) return;
  agentComposerAttachmentStatus.textContent = message || '';
  agentComposerAttachmentStatus.hidden = !message;
  agentComposerAttachmentStatus.classList.toggle('is-error', Boolean(isError));
}

function renderAgentComposerImages() {
  if (!agentComposerAttachments) return;
  agentComposerAttachments.hidden = agentComposerImages.length === 0;
  agentComposerAttachments.replaceChildren(...agentComposerImages.map((image, index) => {
    const item = document.createElement('div');
    item.className = 'agent-composer-attachment';
    const preview = document.createElement('img');
    preview.src = image.dataUrl;
    preview.alt = image.name || `待发送图片 ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'agent-composer-attachment-remove';
    remove.dataset.removeAgentImage = String(image.id);
    remove.title = `移除图片 ${index + 1}`;
    remove.setAttribute('aria-label', `移除图片 ${index + 1}`);
    remove.innerHTML = '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-close"></use></svg>';
    item.append(preview, remove);
    return item;
  }));
}

function readAgentClipboardImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').toLowerCase().startsWith('image/')) {
      reject(new Error('剪贴板内容不是受支持的图片'));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl.startsWith('data:image/')) {
        reject(new Error('无法读取剪贴板图片'));
      } else if (dataUrl.length > AGENT_IMAGE_DATA_URL_LIMIT) {
        reject(new Error('图片超过 10,000,000 字符上限'));
      } else {
        resolve({ id: nextAgentComposerImageId++, dataUrl, name: file.name || '' });
      }
    });
    reader.addEventListener('error', () => reject(new Error('读取剪贴板图片失败')));
    reader.readAsDataURL(file);
  });
}

function insertAgentComposerText(text) {
  if (!agentComposer || !text) return;
  const start = agentComposer.selectionStart ?? agentComposer.value.length;
  const end = agentComposer.selectionEnd ?? start;
  agentComposer.setRangeText(text, start, end, 'end');
  agentComposer.dispatchEvent(new Event('input', { bubbles: true }));
}

function humanVerificationScript() {
  return agentActions.humanVerificationScript();
}

function sameAgentTarget(left, right) {
  return Boolean(left && right && left.tabId === right.tabId && left.view === right.view);
}

function showHumanVerification(details = {}) {
  if (agentHumanVerification) agentHumanVerification.hidden = false;
  if (agentHumanVerificationMessage) {
    agentHumanVerificationMessage.textContent = '检测到疑似人机验证。请在当前网页中手动完成验证；页面通过后 Agent 会自动继续。Agent 不会代替你识别或提交验证。';
  }
  if (agentState) agentState.textContent = '等待人工验证';
  if (details?.url && agentHumanVerification) agentHumanVerification.dataset.url = details.url;
}

function stopHumanVerificationPolling() {
  if (agentHumanVerificationPollTimer) window.clearInterval(agentHumanVerificationPollTimer);
  agentHumanVerificationPollTimer = null;
}

function startHumanVerificationPolling() {
  if (agentHumanVerificationPollTimer) return;
  agentHumanVerificationPollTimer = window.setInterval(() => {
    void resumeHumanVerification({ silent: true });
  }, 1000);
}

function hideHumanVerification() {
  stopHumanVerificationPolling();
  if (agentHumanVerification) {
    agentHumanVerification.hidden = true;
    delete agentHumanVerification.dataset.url;
  }
}

function formatAgentTaskDuration(durationMs) {
  const seconds = Math.floor(Math.max(0, Number(durationMs) || 0) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const padded = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${padded(minutes)}:${padded(remainder)}` : `${padded(minutes)}:${padded(remainder)}`;
}

function renderAgentTaskTimer() {
  if (!agentTaskTimer || !agentTaskStartedAt) return;
  const elapsed = agentTaskTimerActive
    ? Math.max(0, Date.now() - agentTaskStartedAt)
    : agentTaskElapsedMs;
  if (agentTaskTimerActive) agentTaskElapsedMs = elapsed;
  const duration = formatAgentTaskDuration(elapsed);
  const label = `用时 ${duration}`;
  agentTaskTimer.textContent = label;
  agentTaskTimer.hidden = false;
  agentTaskTimer.classList.toggle('is-active', agentTaskTimerActive);
  agentTaskTimer.title = agentTaskTimerActive ? `本次任务已处理 ${duration}` : `本次任务用时 ${duration}`;
  agentTaskTimer.setAttribute('aria-label', `任务处理${agentTaskTimerActive ? '中，已用时' : '用时'} ${duration}`);
}

function startAgentTaskTimer() {
  if (agentTaskTimerHandle) window.clearInterval(agentTaskTimerHandle);
  agentTaskStartedAt = Date.now();
  agentTaskElapsedMs = 0;
  agentTaskTimerActive = true;
  renderAgentTaskTimer();
  agentTaskTimerHandle = window.setInterval(renderAgentTaskTimer, 1000);
}

function stopAgentTaskTimer() {
  if (!agentTaskStartedAt) return;
  agentTaskElapsedMs = Math.max(0, Date.now() - agentTaskStartedAt);
  agentTaskTimerActive = false;
  if (agentTaskTimerHandle) window.clearInterval(agentTaskTimerHandle);
  agentTaskTimerHandle = null;
  renderAgentTaskTimer();
  agentTaskStartedAt = 0;
}

function clearAgentTaskTimer() {
  if (agentTaskTimerHandle) window.clearInterval(agentTaskTimerHandle);
  agentTaskTimerHandle = null;
  agentTaskStartedAt = 0;
  agentTaskElapsedMs = 0;
  agentTaskTimerActive = false;
  if (agentTaskTimer) {
    agentTaskTimer.hidden = true;
    agentTaskTimer.textContent = '';
    agentTaskTimer.removeAttribute('title');
    agentTaskTimer.removeAttribute('aria-label');
    agentTaskTimer.classList.remove('is-active');
  }
}

function waitForHumanVerification(details, target = currentAgentTarget()) {
  if (agentHumanVerificationWait) {
    showHumanVerification(details);
    return agentHumanVerificationWait.promise;
  }
  showHumanVerification(details);
  let resolveWait;
  const promise = new Promise((resolve) => { resolveWait = resolve; });
  agentHumanVerificationWait = { promise, resolve: resolveWait, target };
  startHumanVerificationPolling();
  return promise;
}

function cancelHumanVerificationWait() {
  const wait = agentHumanVerificationWait;
  agentHumanVerificationWait = null;
  hideHumanVerification();
  if (wait) wait.resolve({ ok: false, cancelled: true });
}

async function resumeHumanVerification({ silent = false } = {}) {
  const wait = agentHumanVerificationWait;
  if (!wait || (!agentHumanVerificationResume && !silent) || agentHumanVerificationCheckInFlight) return;
  if (!sameAgentTarget(wait.target, currentAgentTarget())) {
    if (!silent && agentHumanVerificationMessage) agentHumanVerificationMessage.textContent = '请切回出现验证的标签页。';
    return;
  }
  agentHumanVerificationCheckInFlight = true;
  if (!silent) agentHumanVerificationResume.disabled = true;
  try {
    const result = await executePageScript(humanVerificationScript(), { type: 'human-verification' });
    if (result?.required) {
      if (!silent) {
        showHumanVerification(result);
        if (agentHumanVerificationMessage) agentHumanVerificationMessage.textContent = '页面仍显示人机验证，请完成后等待 Agent 自动继续。';
      }
      return;
    }
    agentHumanVerificationWait = null;
    hideHumanVerification();
    if (agentState) agentState.textContent = '处理中';
    wait.resolve({ ok: true });
  } catch (error) {
    if (!silent && agentHumanVerificationMessage) agentHumanVerificationMessage.textContent = `无法确认验证状态：${error?.message || '页面暂不可用'}`;
  } finally {
    agentHumanVerificationCheckInFlight = false;
    if (!silent) agentHumanVerificationResume.disabled = false;
  }
}

function setAgentBusy(nextBusy) {
  agentBusy = Boolean(nextBusy);
  if (agentState) agentState.textContent = agentBusy ? '处理中' : '就绪';
  if (agentSend) {
    agentSend.disabled = false;
    agentSend.classList.toggle('is-busy', agentBusy);
    agentSend.title = agentBusy ? '停止 Agent 操作' : '发送';
    agentSend.setAttribute('aria-label', agentBusy ? '停止 Agent 操作' : '发送');
    agentSend.innerHTML = agentBusy
      ? '<span class="agent-send-progress" aria-hidden="true"><i></i><i></i><i></i></span><span class="agent-stop-glyph" aria-hidden="true"></span>'
      : '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-send"></use></svg>';
  }
  renderAgentContextUsage();
}

function pageReadScript() {
  return agentActions.pageReadScript();
}

function linksScript() {
  return agentActions.linksScript();
}

function tablesScript() {
  return agentActions.tablesScript();
}

function scrollScript(position) {
  return agentActions.scrollScript(position);
}

function clickScript(selector) {
  return agentActions.clickScript(selector);
}

function fillScript(selector, value) {
  return agentActions.fillScript(selector, value);
}

async function executePageScript(script, operation = null) {
  if (tornDown) throw new Error('浏览器环境正在关闭');
  if (activeTabIsNewTab()) {
    if (!webview || typeof webview.executeAgentOperation !== 'function' || !operation) throw new Error('当前新标签页动作暂不支持');
    return webview.executeAgentOperation(operation);
  }
  if (!webview || typeof webview.executeJavaScript !== 'function') throw new Error('当前页面暂不可操作');
  return webview.executeJavaScript(script, true);
}

function activeAgentWebContentsId() {
  if (tornDown || activeTabIsNewTab() || !webview || typeof webview.getWebContentsId !== 'function') {
    throw new Error('当前新标签页不支持文件上传');
  }
  const webContentsId = Number(webview.getWebContentsId());
  if (!Number.isSafeInteger(webContentsId) || webContentsId < 1) throw new Error('当前网页标签尚未就绪');
  return webContentsId;
}

function chooseAgentFiles(input = {}) {
  if (!window.shellApi?.chooseAgentFiles) throw new Error('本地文件选择接口暂不可用');
  return window.shellApi.chooseAgentFiles(input);
}

function chooseAgentDirectory(input = {}) {
  if (!window.shellApi?.chooseAgentDirectory) throw new Error('本地文件夹选择接口暂不可用');
  return window.shellApi.chooseAgentDirectory(input);
}

function listAgentFiles(input = {}) {
  if (!window.shellApi?.listAgentFiles) throw new Error('本地文件夹读取接口暂不可用');
  return window.shellApi.listAgentFiles(input);
}

function readAgentFile(input = {}) {
  if (!window.shellApi?.readAgentFile) throw new Error('本地文件读取接口暂不可用');
  return window.shellApi.readAgentFile(input);
}

function uploadAgentFiles(input = {}) {
  if (!window.shellApi?.uploadAgentFiles) throw new Error('网页文件上传接口暂不可用');
  const target = currentAgentTarget();
  return executeAgentTabOperation(async () => {
    assertAgentTarget(target);
    return window.shellApi.uploadAgentFiles({ ...input, webContentsId: activeAgentWebContentsId() });
  });
}

function agentViewport() {
  if (tornDown || !webview) throw new Error('当前页面暂不可操作');
  const rect = typeof webview.getBoundingClientRect === 'function' ? webview.getBoundingClientRect() : null;
  const width = Math.round(Number(webview.clientWidth || rect?.width || 0));
  const height = Math.round(Number(webview.clientHeight || rect?.height || 0));
  if (width < 1 || height < 1) throw new Error('当前网页区域尚未就绪');
  return { width, height };
}

function boundedAgentPoint(point, viewport, label = '坐标') {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) {
    throw new Error(`${label}超出当前网页区域（${viewport.width}×${viewport.height}）`);
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function focusAgentWebview() {
  if (typeof window.focus === 'function') window.focus();
  if (webview && typeof webview.focus === 'function') webview.focus();
}

async function sendAgentInputEvent(event, expectedView = null) {
  const inputView = expectedView || webview;
  if (!inputView || inputView !== webview) throw new Error('活动标签已切换，请重新观察页面');
  if (typeof inputView.sendInputEvent !== 'function') throw new Error('当前 Electron 不支持虚拟输入');
  await Promise.resolve(inputView.sendInputEvent(event));
}

function waitForAgentInput(delayMs) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function agentMousePath(from, to) {
  if (!from || (from.x === to.x && from.y === to.y)) return [to];
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.min(24, Math.ceil(distance / AGENT_HUMAN_CLICK.moveStepPixels)));
  const path = [];
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    // Ease in and out so the pointer approaches the target like a short
    // manual movement instead of teleporting in one renderer event.
    const eased = progress * progress * (3 - 2 * progress);
    path.push({
      x: Math.round(from.x + (to.x - from.x) * eased),
      y: Math.round(from.y + (to.y - from.y) * eased),
    });
  }
  return path;
}

async function moveAgentPointer(target, previous = null, inputView = null) {
  const path = agentMousePath(previous, target);
  let prior = previous || target;
  for (const point of path) {
    await sendAgentInputEvent({
      type: 'mouseMove',
      x: point.x,
      y: point.y,
      movementX: point.x - prior.x,
      movementY: point.y - prior.y,
    }, inputView);
    prior = point;
    if (path.length > 1) await waitForAgentInput(AGENT_HUMAN_CLICK.moveDelayMs);
  }
}

function rememberAgentPointer(point) {
  agentPointer = point ? { x: point.x, y: point.y } : null;
}

function usableAgentPointer(viewport) {
  if (!agentPointer) return null;
  return agentPointer.x >= 0 && agentPointer.y >= 0
    && agentPointer.x < viewport.width && agentPointer.y < viewport.height
    ? agentPointer
    : null;
}

function currentAgentTarget() {
  return { tabId: activeTabId, view: webview };
}

function assertAgentTarget(target) {
  if (target && (target.tabId !== activeTabId || target.view !== webview)) {
    throw new Error('活动标签已切换，请重新观察页面');
  }
}

async function captureAgentObservation(options = {}, target = null) {
  assertAgentTarget(target);
  const viewport = agentViewport();
  const includeText = options.includeText !== false;
  const includeScreenshot = options.includeScreenshot !== false;
  let page = null;
  if (includeText) {
    try {
      page = await executePageScript(pageReadScript(), { type: 'read' });
    } catch {
      page = null;
    }
  }

  let humanVerification = null;
  try {
    humanVerification = await executePageScript(humanVerificationScript(), { type: 'human-verification' });
  } catch {
    humanVerification = null;
  }
  if (!humanVerification?.required && !agentHumanVerificationWait) hideHumanVerification();

  let screenshot = null;
  let screenshotSize = null;
  let screenshotError = '';
  if (includeScreenshot && typeof webview.capturePage === 'function') {
    try {
      let image = await webview.capturePage();
      if (image?.dataUrl) {
        screenshot = image.dataUrl;
        screenshotSize = image.size || null;
      }
      if (image && typeof image.getSize === 'function') {
        const originalSize = image.getSize();
        // capturePage may return device pixels on a scaled display. Resize to
        // the CSS viewport so model coordinates map directly to input points.
        if ((originalSize.width !== viewport.width || originalSize.height !== viewport.height)
          && typeof image.resize === 'function') {
          image = image.resize({ width: viewport.width, height: viewport.height });
        }
        screenshotSize = image.getSize();
      }
      if (!screenshot && image && typeof image.toDataURL === 'function') screenshot = image.toDataURL();
    } catch (error) {
      screenshotError = error?.message || '截图失败';
    }
  }

  const currentUrl = currentWebviewUrl() || 'about:newtab';
  const title = page?.title || lastPageTitle || (() => {
    try { return webview?.getTitle?.() || ''; } catch { return ''; }
  })();
  return {
    ok: true,
    type: 'observation',
    tabId: activeTabId,
    title: title || (isNewTabUrl(currentUrl) ? '新标签页' : '当前页面'),
    url: page?.url || currentUrl,
    viewport,
    coordinateSpace: 'active-page-css-px',
    screenshot,
    screenshotSize,
    screenshotError: screenshotError || undefined,
    humanVerification: humanVerification || undefined,
    page: page || undefined,
    timestamp: new Date().toISOString(),
  };
}

function assertAgentActionActive(signal) {
  if (!signal?.aborted) return;
  const error = new Error('网页动作已取消');
  error.name = 'AbortError';
  throw error;
}

async function waitForAgentAction(ms, signal) {
  let remaining = ms;
  while (remaining > 0) {
    assertAgentActionActive(signal);
    const delay = Math.min(remaining, 2_147_483_647);
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => finish(Object.assign(new Error('网页动作已取消'), { name: 'AbortError' }));
      const timer = window.setTimeout(() => finish(), delay);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
    remaining -= delay;
  }
}

async function runNormalizedAgentInput(action, target = null, signal = null) {
  assertAgentActionActive(signal);
  assertAgentTarget(target);
  if (action.type === 'screenshot') {
    const result = await captureAgentObservation(action, target);
    assertAgentActionActive(signal);
    return result;
  }
  const viewport = agentViewport();
  const inputView = target?.view || webview;
  const pointFor = (value, label) => boundedAgentPoint(value, viewport, label);

  switch (action.type) {
    case 'mouse_move': {
      focusAgentWebview();
      const target = pointFor(action, '鼠标坐标');
      const previous = usableAgentPointer(viewport) || target;
      await moveAgentPointer(target, previous, inputView);
      rememberAgentPointer(target);
      return { ok: true, type: action.type, ...target };
    }
    case 'click': {
      focusAgentWebview();
      const target = pointFor(action, '鼠标坐标');
      const previous = usableAgentPointer(viewport) || target;
      await moveAgentPointer(target, previous, inputView);
      await waitForAgentAction(AGENT_HUMAN_CLICK.settleDelayMs, signal);
      for (let index = 1; index <= action.clickCount; index += 1) {
        assertAgentActionActive(signal);
        await sendAgentInputEvent({ type: 'mouseDown', x: target.x, y: target.y, button: action.button, clickCount: index }, inputView);
        try {
          await waitForAgentAction(AGENT_HUMAN_CLICK.pressDelayMs, signal);
        } finally {
          await sendAgentInputEvent({ type: 'mouseUp', x: target.x, y: target.y, button: action.button, clickCount: index }, inputView);
        }
        if (index < action.clickCount) await waitForAgentAction(AGENT_HUMAN_CLICK.clickGapDelayMs, signal);
      }
      rememberAgentPointer(target);
      return { ok: true, type: action.type, button: action.button, clickCount: action.clickCount, ...target };
    }
    case 'mouse_down':
    case 'mouse_up': {
      focusAgentWebview();
      const target = pointFor(action, '鼠标坐标');
      await sendAgentInputEvent({ type: action.type === 'mouse_down' ? 'mouseDown' : 'mouseUp', x: target.x, y: target.y, button: action.button, clickCount: 1 }, inputView);
      rememberAgentPointer(target);
      return { ok: true, type: action.type, button: action.button, ...target };
    }
    case 'scroll': {
      focusAgentWebview();
      const target = pointFor(action, '滚动坐标');
      await sendAgentInputEvent({
        type: 'mouseWheel',
        x: target.x,
        y: target.y,
        // Chromium reports wheel deltas with the opposite sign from the
        // model-facing convention: positive Y means scroll down here.
        deltaX: -action.deltaX,
        deltaY: -action.deltaY,
        wheelTicksX: -action.deltaX,
        wheelTicksY: -action.deltaY,
        canScroll: true,
        hasPreciseScrollingDeltas: true,
      }, inputView);
      rememberAgentPointer(target);
      return { ok: true, type: action.type, ...target, deltaX: action.deltaX, deltaY: action.deltaY };
    }
    case 'drag': {
      focusAgentWebview();
      const path = [];
      for (const [index, item] of action.path.entries()) {
        assertAgentActionActive(signal);
        path.push(pointFor(item, `拖拽点 ${index + 1}`));
      }
      const first = path[0];
      const previous = usableAgentPointer(viewport) || first;
      await moveAgentPointer(first, previous, inputView);
      assertAgentActionActive(signal);
      await sendAgentInputEvent({ type: 'mouseDown', x: first.x, y: first.y, button: action.button, clickCount: 1 }, inputView);
      let prior = first;
      try {
        for (const target of path.slice(1)) {
          assertAgentActionActive(signal);
          await sendAgentInputEvent({ type: 'mouseMove', x: target.x, y: target.y, movementX: target.x - prior.x, movementY: target.y - prior.y }, inputView);
          prior = target;
        }
      } finally {
        await sendAgentInputEvent({ type: 'mouseUp', x: prior.x, y: prior.y, button: action.button, clickCount: 1 }, inputView);
      }
      rememberAgentPointer(prior);
      return { ok: true, type: action.type, from: first, to: prior, points: path.length };
    }
    case 'keypress': {
      focusAgentWebview();
      for (const event of agentActions.keyPressEvents(action.keys)) {
        assertAgentActionActive(signal);
        await sendAgentInputEvent(event, inputView);
      }
      return { ok: true, type: action.type, keys: action.keys };
    }
    case 'key_down':
    case 'key_up': {
      focusAgentWebview();
      await sendAgentInputEvent({ type: action.type === 'key_down' ? 'rawKeyDown' : 'keyUp', keyCode: action.key }, inputView);
      return { ok: true, type: action.type, key: action.key };
    }
    case 'type':
      assertAgentActionActive(signal);
      focusAgentWebview();
      if (!webview || typeof webview.insertText !== 'function') throw new Error('当前 Electron 不支持文本输入');
      await webview.insertText(action.text);
      assertAgentActionActive(signal);
      return { ok: true, type: action.type, textLength: action.text.length };
    case 'wait':
      await waitForAgentAction(action.ms, signal);
      return { ok: true, type: action.type, ms: action.ms };
    default:
      throw new Error(`不支持的虚拟输入动作：${action.type}`);
  }
}

function queueAgentExecution(task) {
  const next = agentExecution.then(task, task);
  agentExecution = next.catch(() => {});
  return next;
}

function executeAgentTabOperation(operation) {
  return queueAgentExecution(async () => operation());
}

async function executeAgentProtocolAction(input, signal = null) {
  const target = currentAgentTarget();
  return queueAgentExecution(async () => {
    assertAgentActionActive(signal);
    assertAgentTarget(target);
    const action = agentActions.normalizeAgentAction(input);
    return runNormalizedAgentInput(action, target, signal);
  });
}

async function executeAgentProtocolBatch(inputs, signal = null) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('动作批次不能为空');
  const normalized = [];
  for (const input of inputs) {
    assertAgentActionActive(signal);
    normalized.push(agentActions.normalizeAgentAction(input));
    if (normalized.length % 32 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  const target = currentAgentTarget();
  return queueAgentExecution(async () => {
    assertAgentActionActive(signal);
    assertAgentTarget(target);
    const results = [];
    for (const action of normalized) {
      assertAgentActionActive(signal);
      results.push(await runNormalizedAgentInput(action, target, signal));
    }
    return { ok: true, count: results.length, results };
  });
}

function summarizeAgentObservation(observation) {
  if (!observation || typeof observation !== 'object') return observation;
  return {
    ok: observation.ok,
    type: observation.type,
    title: observation.title,
    url: observation.url,
    viewport: observation.viewport,
    coordinateSpace: observation.coordinateSpace,
    screenshotSize: observation.screenshotSize,
    screenshot: observation.screenshot ? '[已捕获截图]' : null,
    humanVerification: observation.humanVerification || { required: false },
    page: observation.page,
  };
}

function agentModelReady() {
  return Boolean(
    window.shellApi?.chatAgent
    && browserSettings.agentEnabled !== false
    && browserSettings.agentBaseUrl
    && browserSettings.agentModel
    && (browserSettings.agentTokenSet || browserSettings.agentKeySet),
  );
}

function agentModelSetupHint() {
  if (browserSettings.agentEnabled === false) return '当前环境未启用 Agent，请在插件管理中激活网页助手。';
  if (!browserSettings.agentBaseUrl) return '请先打开 Agent 设置填写接口地址。';
  if (!browserSettings.agentModel) return '请先打开 Agent 设置填写模型。';
  if (!(browserSettings.agentTokenSet || browserSettings.agentKeySet)) return '请先打开 Agent 设置保存 Token。';
  return '';
}

function modelObservationMessage(observation, prefix = '当前活动标签观察结果') {
  const summary = summarizeAgentObservation(observation);
  const images = [];
  if (observation?.screenshot && String(observation.screenshot).length <= 3_000_000) {
    images.push({ dataUrl: observation.screenshot });
  }
  return {
    role: 'user',
    content: `${prefix}：\n${formatAgentValue(summary)}`,
    images,
  };
}

function estimateAgentContextTokens(messages) {
  try {
    return (Array.isArray(messages) ? messages : []).reduce((total, message) => (
      total + Math.max(1, Math.ceil(JSON.stringify(message || {}).length / 4))
    ), 0);
  } catch {
    return 0;
  }
}

function agentContextUsagePercent() {
  const budget = Number(browserSettings.agentContextBudgetTokens);
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((estimateAgentContextTokens(agentConversation) / budget) * 100)));
}

function showAgentContextNotice(message) {
  if (!agentContextUsage) return;
  agentContextUsage.classList.remove('is-notice');
  void agentContextUsage.offsetWidth;
  agentContextUsage.classList.add('is-notice');
  if (agentContextNoticeTimer) window.clearTimeout(agentContextNoticeTimer);
  agentContextNoticeTimer = window.setTimeout(() => {
    agentContextUsage.classList.remove('is-notice');
    agentContextNoticeTimer = null;
    renderAgentContextUsage();
  }, 2400);
}

function renderAgentContextUsage() {
  if (!agentContextUsage) return;
  const percent = agentContextUsagePercent();
  const usedTokens = estimateAgentContextTokens(agentConversation);
  const budgetTokens = Number(browserSettings.agentContextBudgetTokens);
  const budgetFractionDigits = budgetTokens >= 1_000_000 ? 1 : 0;
  const usedDisplay = agentContextUsageUtils.formatTokenCount(usedTokens, 1);
  const budgetDisplay = Number.isFinite(budgetTokens) && budgetTokens > 0
    ? agentContextUsageUtils.formatTokenCount(budgetTokens, budgetFractionDigits)
    : '未设置';
  const tokenUsage = `${usedDisplay} / ${budgetDisplay}`;
  const remainingPercent = Math.max(0, 100 - percent);
  agentContextUsage.textContent = `${percent}%`;
  agentContextUsage.dataset.percent = `${percent}%`;
  const angle = Math.round(percent * 3.6);
  const color = percent >= 90 ? '#f08080' : percent >= 75 ? '#f1c75b' : 'var(--agent-accent)';
  agentContextUsage.style.setProperty('--agent-context-color', color);
  agentContextUsage.style.setProperty('--agent-context-angle', `${angle}deg`);
  agentContextUsage.dataset.level = percent >= 90 ? 'critical' : percent >= 75 ? 'warning' : 'normal';
  agentContextUsage.setAttribute('aria-label', `上下文使用量 ${tokenUsage}，${percent}%，点击压缩`);
  if (agentContextTooltipPercent) agentContextTooltipPercent.textContent = `${percent}% 已用（剩余 ${remainingPercent}%）`;
  if (agentContextTooltipTokens) {
    agentContextTooltipTokens.textContent = Number.isFinite(budgetTokens) && budgetTokens > 0
      ? `已用 ${usedDisplay} 标记，共 ${budgetDisplay}`
      : `已用 ${usedDisplay} 标记，预算未设置`;
  }
}

function compressAgentConversationIfNeeded(force = false) {
  const budget = Number(browserSettings.agentContextBudgetTokens);
  if (!Number.isFinite(budget) || budget <= 0) return false;
  const currentTokens = estimateAgentContextTokens(agentConversation);
  if (!force && currentTokens < budget * AGENT_CONTEXT_COMPRESSION_RATIO) return false;
  if (agentContextLastCompressionTokens > 0 && currentTokens <= agentContextLastCompressionTokens) return false;
  const system = agentConversation.find((message) => message?.role === 'system');
  const currentTask = [...agentConversation].reverse().find((message) => message?.role === 'user');
  const preserved = new Set([system, currentTask]);
  const history = agentConversation.filter((message) => message && !preserved.has(message));
  if (!history.length) return false;
  const latestToolPair = (() => {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const assistant = history[index];
      if (assistant?.role !== 'assistant' || !Array.isArray(assistant.toolCalls) || !assistant.toolCalls.length) continue;
      const pair = [assistant];
      for (let next = index + 1; next < history.length && history[next]?.role === 'tool'; next += 1) pair.push(history[next]);
      return pair;
    }
    return [];
  })();
  const pairSet = new Set(latestToolPair);
  const summary = history
    .filter((message) => !pairSet.has(message))
    .map((message) => `${message.role}: ${formatAgentValue(message.content).slice(0, 1200)}`)
    .join('\n');
  const compacted = [
    system,
    {
      role: 'user',
      content: `以下是本任务较早的对话摘要，保留用于继续执行。\n${summary.slice(-12000)}`,
    },
    ...latestToolPair,
    currentTask,
  ].filter(Boolean);
  agentConversation = compacted;
  agentContextLastCompressionTokens = estimateAgentContextTokens(agentConversation);
  renderAgentContextUsage();
  appendAgentMessage('上下文已接近预算，已自动压缩早期对话并继续当前任务。', 'assistant');
  return true;
}

function requestAgentContextCompression() {
  const percent = agentContextUsagePercent();
  if (percent < 50) {
    showAgentContextNotice('上下文使用量低于 50%，暂不能压缩');
    return false;
  }
  if (agentContextLastCompressionTokens > 0
    && estimateAgentContextTokens(agentConversation) <= agentContextLastCompressionTokens) {
    showAgentContextNotice('请继续当前任务后再进行下一次压缩');
    return false;
  }
  const compressed = compressAgentConversationIfNeeded(true);
  renderAgentContextUsage();
  showAgentContextNotice(compressed ? '已压缩早期对话，继续当前任务' : '当前没有可压缩的早期对话');
  return compressed;
}

function parseModelToolArguments(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const RETRY_SAFE_READ_TOOLS = new Set([
  'browser_observe', 'browser_read_page', 'browser_collect_links', 'browser_collect_tables',
  'browser_tabs', 'browser_downloads',
]);

function isTransientAgentError(error) {
  const message = String(error?.message || error || '');
  const status = message.match(/(?:返回|status(?:\s+code)?)\s*[:： ]\s*(\d{3})/i);
  if (status) {
    const code = Number(status[1]);
    return code === 408 || code === 425 || code === 429 || code >= 500;
  }
  return error?.name === 'AbortError'
    || /(超时|timeout|network|failed to fetch|fetch failed|ECONN|EAI_AGAIN|socket hang up|连接重置|暂时不可用)/i.test(message);
}

function isSafeNotStartedError(error) {
  return /网页助手尚未就绪|当前页面暂不可操作|当前网页区域尚未就绪|当前网页标签尚未就绪/.test(String(error?.message || ''));
}

function isRetryableToolError(name, error) {
  if (RETRY_SAFE_READ_TOOLS.has(name)) return isTransientAgentError(error) || error?.toolResult?.ok === false;
  if (isSafeNotStartedError(error)) return true;
  if (!error?.toolResult || error.toolResult.ok !== false) return false;
  return ['browser_click_selector', 'browser_fill_selector', 'browser_select_option'].includes(name)
    && /未找到匹配元素|未找到匹配选项/.test(String(error.message || ''));
}

function toolResultFailure(result) {
  const error = new Error(String(result?.error || '网页工具执行失败'));
  error.toolResult = result;
  return error;
}

function retryAgentRequest(operation, signal, runId, label) {
  return agentRetry.retryOperation(operation, {
    maxRetries: agentRetry.RETRY_DELAYS_MS.length,
    signal,
    shouldRetry: isTransientAgentError,
    onRetry: ({ retry, maxRetries, delay }) => {
      if (!agentStopRequested && !tornDown && runId === agentRunSequence) {
        showAgentThinking(`${label}失败，${delay / 1000} 秒后重试（${retry}/${maxRetries}）`);
      }
    },
  });
}

function retryAgentPageAction(operation, signal, runId, label, retryMissing = false) {
  return agentRetry.retryOperation(async () => {
    const result = await operation();
    if (result?.ok === false) throw toolResultFailure(result);
    return result;
  }, {
    maxRetries: agentRetry.RETRY_DELAYS_MS.length,
    signal,
    shouldRetry: (error) => isTransientAgentError(error) || isSafeNotStartedError(error)
      || (retryMissing && error?.toolResult?.ok === false && /未找到匹配元素|未找到匹配选项/.test(error.message || '')),
    onRetry: ({ retry, maxRetries, delay }) => {
      if (!agentStopRequested && !tornDown && runId === agentRunSequence) {
        showAgentThinking(`${label}失败，${delay / 1000} 秒后重试（${retry}/${maxRetries}）`);
      }
    },
  });
}

function retryModelTool(call, actionView, runId, signal) {
  return agentRetry.retryOperation(async () => {
    const result = await executeModelTool(call.name, call.arguments, signal);
    if (result?.ok === false) throw toolResultFailure(result);
    return result;
  }, {
    maxRetries: agentRetry.RETRY_DELAYS_MS.length,
    signal,
    shouldRetry: (error) => isRetryableToolError(call.name, error),
    onRetry: ({ error, retry, maxRetries, delay }) => {
      actionView?.setState(`失败，${delay / 1000} 秒后重试（${retry}/${maxRetries}）`, {
        error: true,
        result: error.toolResult || { ok: false, error: error.message || '网页工具执行失败' },
      });
      if (!agentStopRequested && !tornDown && runId === agentRunSequence) {
        showAgentThinking(`正在重试${agentToolLabel(call.name, call.arguments)}`);
      }
    },
  });
}

function summarizeAgentAction(item) {
  const result = item.result?.type === 'observation' ? summarizeAgentObservation(item.result) : item.result;
  return {
    action: agentToolLabel(item.name, item.arguments),
    result: formatAgentValue(result).slice(0, 6000),
  };
}

async function configureBrowserControls(args) {
  if (!window.shellApi?.saveSettings) throw new Error('浏览器设置暂不可用');
  const payload = {};
  if (args.reloadShortcut !== undefined || args.devtoolsShortcut !== undefined) {
    payload.browserShortcuts = {
      ...(args.reloadShortcut !== undefined ? { reload: String(args.reloadShortcut) } : {}),
      ...(args.devtoolsShortcut !== undefined ? { devtools: String(args.devtoolsShortcut) } : {}),
    };
  }
  const gesture = {};
  if (args.gestureEnabled !== undefined) gesture.enabled = Boolean(args.gestureEnabled);
  if (args.gestureButton !== undefined) gesture.button = String(args.gestureButton);
  if (args.gestureSequence !== undefined) gesture.sequence = Array.isArray(args.gestureSequence) ? args.gestureSequence : String(args.gestureSequence).split(',');
  if (args.gestureAction !== undefined) gesture.action = String(args.gestureAction);
  if (args.gestureThreshold !== undefined) gesture.threshold = args.gestureThreshold;
  if (Object.keys(gesture).length) payload.mouseGesture = gesture;
  if (!Object.keys(payload).length) throw new Error('没有可配置的快捷键或鼠标手势参数');
  const result = await window.shellApi.saveSettings(payload);
  if (result?.ok === false) throw new Error(result.error || '浏览器设置保存失败');
  renderBrowserSettings(result?.settings);
  setShellStatus('AI 已更新浏览器控制设置');
  return { ok: true, settings: result?.settings?.browserShortcuts || browserSettings.browserShortcuts, mouseGesture: result?.settings?.mouseGesture || browserSettings.mouseGesture };
}

// Kept for the manual verification UI bridge; model tool calls no longer use
// this gate because browser permissions are granted by the profile session.
async function ensureModelActionAllowed() {
  const result = await executePageScript(humanVerificationScript(), { type: 'human-verification' });
  if (!result?.required && !agentHumanVerificationWait) return;
  const resumed = await waitForHumanVerification(result || { required: true }, currentAgentTarget());
  if (!resumed?.ok || agentStopRequested) throw new Error('已停止等待人工验证');
  const after = await executePageScript(humanVerificationScript(), { type: 'human-verification' });
  if (after?.required) throw new Error('仍检测到人机验证，请完成后点击继续');
}

async function executeModelTool(name, rawArguments, signal = null) {
  assertAgentActionActive(signal);
  const args = parseModelToolArguments(rawArguments);
  switch (String(name || '').trim()) {
    case 'browser_observe':
      return executeAgentProtocolAction({ type: 'screenshot', includeText: true, includeScreenshot: true }, signal);
    case 'browser_read_page':
      return executePageScript(pageReadScript(), { type: 'read' });
    case 'browser_collect_links':
      return executePageScript(linksScript(), { type: 'links' });
    case 'browser_collect_tables':
      return executePageScript(tablesScript(), { type: 'tables' });
    case 'browser_open': {
      const targetUrl = normalizedUrl(args.url);
      if (!/^(?:https?|file|data|blob|about|chrome-extension|view-source):/i.test(targetUrl)) {
        throw new Error('地址协议不受浏览器支持');
      }
      return executeAgentTabOperation(() => agentNavigate({ url: targetUrl }));
    }
    case 'browser_tabs':
      return executeAgentTabOperation(() => agentTabsSnapshot());
    case 'browser_new_tab':
      return executeAgentTabOperation(() => agentOpenTab(args));
    case 'browser_switch_tab':
      return executeAgentTabOperation(() => agentSwitchTab(args.tabId));
    case 'browser_close_tab':
      return executeAgentTabOperation(() => agentCloseTab(args.tabId));
    case 'browser_tab_control':
      return executeAgentTabOperation(() => agentTabControl(args));
    case 'browser_click_selector':
      return executePageScript(clickScript(args.selector), { type: 'click', selector: args.selector });
    case 'browser_fill_selector':
      return executePageScript(fillScript(args.selector, args.value), { type: 'fill', selector: args.selector, value: args.value });
    case 'browser_select_option':
      return executePageScript(agentActions.selectScript(args.selector, args.value), { type: 'select', selector: args.selector, value: args.value });
    case 'browser_downloads': {
      const result = await window.shellApi?.getDownloads?.();
      if (result?.ok === false) throw new Error(result.error || '下载记录读取失败');
      browserDownloads = Array.isArray(result?.downloads) ? result.downloads : browserDownloads;
      return { ok: true, type: 'downloads', downloads: browserDownloads };
    }
    case 'browser_choose_files':
      return chooseAgentFiles(args);
    case 'browser_choose_folder':
      return chooseAgentDirectory(args);
    case 'browser_list_files':
      return listAgentFiles(args);
    case 'browser_read_file':
      return readAgentFile(args);
    case 'browser_upload_files':
      return uploadAgentFiles(args);
    case 'browser_click':
      return executeAgentProtocolAction({ type: 'click', ...args }, signal);
    case 'browser_type':
      return executeAgentProtocolAction({ type: 'type', text: args.text }, signal);
    case 'browser_keypress':
      return executeAgentProtocolAction({ type: 'keypress', keys: args.keys }, signal);
    case 'browser_scroll':
      return executeAgentProtocolAction({ type: 'scroll', ...args }, signal);
    case 'browser_drag':
      return executeAgentProtocolAction({ type: 'drag', ...args }, signal);
    case 'browser_wait':
      return executeAgentProtocolAction({ type: 'wait', ms: args.ms }, signal);
    case 'browser_configure_shortcuts':
      return configureBrowserControls(args);
    default:
      throw new Error(`模型请求了未知工具：${String(name || '未命名')}`);
  }
}

function modelToolResultMessage(call, result) {
  const observation = result?.type === 'observation' ? result : null;
  const value = observation ? summarizeAgentObservation(observation) : result;
  const message = {
    role: 'tool',
    name: String(call?.name || ''),
    toolCallId: String(call?.id || ''),
    content: formatAgentValue(value),
  };
  if (observation?.screenshot && String(observation.screenshot).length <= 3_000_000) {
    message.images = [{ dataUrl: observation.screenshot }];
  }
  return message;
}

function ensureAgentSystemMessage() {
  if (agentConversation.some((message) => message.role === 'system')) return;
  agentConversation.unshift({
    role: 'system',
    content: '你是网页助手，也是自然的聊天伙伴。对于闲聊、解释、写作或一般问题，直接用简洁中文回答，不要为了回复而调用工具，也不要把每句话都改写成任务。只有用户需要了解或操作当前网页时，才在当前 profile 浏览器内使用标签页、导航、页面读取、选择器、坐标鼠标、滚轮、拖拽、键盘和文本输入工具；不要操作浏览器之外的操作系统窗口。需要本地文件时，先调用 browser_choose_files 或 browser_choose_folder，让用户在系统选择器中明确授权；再用返回的授权 ID 列出、读取或上传，不能猜测或索取未授权路径。上传前先观察页面并用 browser_upload_files 匹配 input[type=file] 控件。不要索取或输出 Token、Cookie、密码等敏感信息。用户要求配置刷新、开发者工具快捷键或鼠标手势时，使用 browser_configure_shortcuts 工具，只提交用户明确要求的字段。humanVerification.required 只是页面状态提示，不会代替你识别或提交验证；按用户指令继续使用普通网页动作，并在无法完成时如实说明。',
  });
}

async function runModelAgent(userText, { showUser = true, images = [] } = {}) {
  const userImages = Array.isArray(images) ? images : [];
  const hint = agentModelSetupHint();
  if (showUser) appendAgentMessage(userText || (userImages.length ? '已发送图片' : ''), 'user', { images: userImages });
  renderAgentContextUsage();
  if (hint) {
    appendAgentMessage(hint, 'assistant', { error: true });
    return;
  }

  const runId = ++agentRunSequence;
  agentStopRequested = false;
  agentContextLastCompressionTokens = 0;
  const retryController = new AbortController();
  agentRetryController = retryController;
  setAgentBusy(true);
  startAgentTaskTimer();
  ensureAgentSystemMessage();
  let activeStreamMessage = null;
  try {
    // Verification markers are included as page state, but never pause the
    // model. The user can stop the run when a site needs manual attention.
    showAgentThinking('正在查看当前页面');
    const observation = await retryAgentRequest(
      () => executeAgentProtocolAction({ type: 'screenshot', includeText: true, includeScreenshot: true }, retryController.signal),
      retryController.signal,
      runId,
      '页面观察',
    );
    hideAgentThinking();
    agentConversation.push({
      role: 'user',
      content: `${String(userText || '').slice(0, 12000)}\n\n${modelObservationMessage(observation).content}`,
      images: [
        ...userImages,
        ...(observation?.screenshot && String(observation.screenshot).length <= 3_000_000
          ? [{ dataUrl: observation.screenshot }]
          : []),
      ],
    });
    renderAgentContextUsage();

    let steps = 0;
    const maxSteps = Number(browserSettings.agentMaxSteps) || 0;
    let pageTaskTouched = false;
    let continuingText = false;
    let accumulatedText = '';
    const continuationPrompt = '请从上次回复断开的准确位置继续。不要重复已经给出的内容，也不要调用浏览器工具。';
    while (runId === agentRunSequence && !agentStopRequested) {
      compressAgentConversationIfNeeded();
      showAgentThinking('正在思考');
      const continuingThisRequest = continuingText;
      const textBeforeContinuation = accumulatedText;
      let streamedMessage = continuingThisRequest ? activeStreamMessage : null;
      let streamedText = '';
      const onDelta = (event) => {
        if (agentStopRequested || event?.type !== 'delta' || !event.text) return;
        streamedText += String(event.text);
        hideAgentThinking();
        const visibleText = continuingThisRequest ? `${textBeforeContinuation}${streamedText}` : streamedText;
        if (!streamedMessage) {
          streamedMessage = appendAgentStreamingMessage(visibleText);
          activeStreamMessage = streamedMessage;
        }
        else streamedMessage.setText(visibleText);
      };
      const requestModel = async () => {
        streamedText = '';
        if (streamedMessage) {
          streamedMessage.setText(continuingThisRequest ? textBeforeContinuation : '');
          streamedMessage.row.classList.add('agent-message-streaming');
        }
        let streamRequestId = '';
        let cancelStream = null;
        try {
          if (typeof window.shellApi?.chatAgentStream === 'function') {
            cancelStream = () => window.shellApi.cancelAgentRequest?.(streamRequestId);
            agentRequestCancel = cancelStream;
            const response = await window.shellApi.chatAgentStream(
              { messages: agentConversation, finalize: continuingThisRequest },
              onDelta,
              (requestId) => { streamRequestId = String(requestId || ''); },
            );
            if (!response || response.ok === false) throw new Error(response?.error || 'Agent 模型请求失败');
            return response;
          }
          let requestId = '';
          cancelStream = () => window.shellApi.cancelAgentRequest?.(requestId);
          agentRequestCancel = cancelStream;
          const response = await window.shellApi.chatAgent(
            { messages: agentConversation, finalize: continuingThisRequest },
            (id) => { requestId = String(id || ''); },
          );
          if (!response || response.ok === false) throw new Error(response?.error || 'Agent 模型请求失败');
          return response;
        } finally {
          if (agentRequestCancel === cancelStream) agentRequestCancel = null;
        }
      };
      const result = await retryAgentRequest(requestModel, retryController.signal, runId, '模型请求');
      hideAgentThinking();
      if (runId !== agentRunSequence || agentStopRequested) {
        streamedMessage?.row.classList.remove('agent-message-streaming');
        break;
      }
      if (!result || result.ok === false) throw new Error(result?.error || 'Agent 模型请求失败');

      const text = String(result.text || '');
      const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls.filter((call) => call && call.name) : [];
      const responseText = continuingThisRequest ? `${textBeforeContinuation}${text}` : text;
      continuingText = false;
      accumulatedText = responseText;
      if ((result.truncated && toolCalls.length) || (continuingThisRequest && toolCalls.length)) {
        if (text) agentConversation.push({ role: 'assistant', content: text });
        if (streamedMessage) {
          streamedMessage.setText(responseText);
          streamedMessage.row.classList.remove('agent-message-streaming');
        } else if (text) {
          appendAgentMessage(responseText, 'assistant');
        }
        appendAgentMessage(result.truncated
          ? '模型输出达到长度上限，未执行不完整的网页操作。'
          : '续写阶段模型返回了网页操作，未执行该操作。', 'assistant', { error: true });
        break;
      }
      if (result.truncated && !text) {
        appendAgentMessage('模型因输出长度限制结束，但没有返回可续写的文本。', 'assistant', { error: true });
        break;
      }
      agentConversation.push({
        role: 'assistant',
        content: text,
        toolCalls,
        ...(Array.isArray(result.responseItems) && result.responseItems.length
          ? { responseItems: result.responseItems }
          : {}),
      });
      renderAgentContextUsage();
      compressAgentConversationIfNeeded();
      if (result.truncated) {
        if (streamedMessage) streamedMessage.setText(responseText);
        else if (text) {
          streamedMessage = appendAgentStreamingMessage(responseText);
          activeStreamMessage = streamedMessage;
        }
        if (streamedMessage) streamedMessage.row.classList.remove('agent-message-streaming');
        agentConversation.push({ role: 'user', content: continuationPrompt });
        continuingText = true;
        renderAgentContextUsage();
        continue;
      }
      if (text && !streamedMessage) appendAgentMessage(responseText, 'assistant');
      if (streamedMessage) {
        if (streamedText !== text || continuingThisRequest) streamedMessage.setText(responseText || streamedText);
        streamedMessage.row.classList.remove('agent-message-streaming');
      }
      if (!toolCalls.length) {
        if (!text) appendAgentMessage(pageTaskTouched ? '网页操作已结束，模型没有生成最终答复。' : '模型没有返回可执行动作或文字结果。', 'assistant', { error: true });
        break;
      }

      for (const call of toolCalls) {
        if (agentStopRequested || (maxSteps > 0 && steps >= maxSteps)) {
          agentConversation.push(modelToolResultMessage(call, { ok: false, error: '本轮已停止，工具未执行' }));
          appendAgentAction(call.name, '已跳过', { error: true, arguments: call.arguments, result: { ok: false, error: '本轮已停止，工具未执行' } });
          continue;
        }
        const actionView = appendAgentAction(call.name, '执行中', { arguments: call.arguments });
        let toolResult;
        try {
          toolResult = await retryModelTool(call, actionView, runId, retryController.signal);
        } catch (error) {
          toolResult = error?.toolResult || { ok: false, error: error?.message || '工具执行失败' };
        }
        steps += 1;
        pageTaskTouched = true;
        const actionDisplayResult = toolResult?.type === 'observation'
          ? summarizeAgentObservation(toolResult)
          : toolResult;
        actionView?.setState(toolResult?.ok === false ? '失败' : '已完成', {
          error: toolResult?.ok === false,
          result: actionDisplayResult,
        });
        agentConversation.push(modelToolResultMessage(call, toolResult));
      }

      if (!agentStopRequested && maxSteps > 0 && steps >= maxSteps) {
        appendAgentMessage(`已达到本轮工具步数上限（${maxSteps}）。`, 'assistant', { error: true });
        break;
      }
    }
    if (agentStopRequested) appendAgentMessage('已停止本轮 Agent 操作。', 'assistant');
  } catch (error) {
    hideAgentThinking();
    activeStreamMessage?.row.classList.remove('agent-message-streaming');
    if (!agentStopRequested) {
      appendAgentMessage(`模型操作失败：${error?.message || '未知错误'}`, 'assistant', { error: true });
    }
  } finally {
    hideAgentThinking();
    if (runId === agentRunSequence) {
      if (agentRetryController === retryController) agentRetryController = null;
      agentStopRequested = false;
      stopAgentTaskTimer();
      setAgentBusy(false);
      if (agentTaskQueue.length && !tornDown) setAgentBusy(true);
      syncAgentContext();
      if (!tornDown && agentPanel?.hidden === false && agentSettingsPanel?.hidden !== false) agentComposer?.focus();
    }
  }
}

function stopModelAgent() {
  if (!agentBusy && !agentHumanVerificationWait) return;
  agentStopRequested = true;
  agentRequestCancel?.();
  agentRequestCancel = null;
  agentRetryController?.abort();
  cancelHumanVerificationWait();
  if (agentState) agentState.textContent = '正在停止';
}

function exposeBrowserAgent() {
  const api = {
    observe: (options) => executeAgentProtocolAction({ type: 'screenshot', ...(options || {}) }),
    execute: (action) => executeAgentProtocolAction(action),
    executeBatch: (actions) => executeAgentProtocolBatch(actions),
    tabs: () => executeAgentTabOperation(() => agentTabsSnapshot()),
    openTab: (input) => executeAgentTabOperation(() => agentOpenTab(input)),
    switchTab: (tabId) => executeAgentTabOperation(() => agentSwitchTab(tabId)),
    closeTab: (tabId) => executeAgentTabOperation(() => agentCloseTab(tabId)),
    navigate: (input) => executeAgentTabOperation(() => agentNavigate(input)),
    tabControl: (input) => executeAgentTabOperation(() => agentTabControl(input)),
    chooseFiles: (input) => chooseAgentFiles(input),
    chooseDirectory: (input) => chooseAgentDirectory(input),
    listFiles: (input) => listAgentFiles(input),
    readFile: (input) => readAgentFile(input),
    uploadFiles: (input) => uploadAgentFiles(input),
    capabilities: () => ({
      protocol: 'browser-agent.v1',
      actions: [...(agentActions.actionTypes || [])],
      operations: ['tabs', 'openTab', 'switchTab', 'closeTab', 'navigate', 'tabControl'],
      fileOperations: ['chooseFiles', 'chooseDirectory', 'listFiles', 'readFile', 'uploadFiles'],
      localFiles: {
        authorization: 'user-selected',
        grants: 'session-scoped',
        limits: 'none',
      },
      coordinateSpace: 'active-page-css-px',
      scrollPositiveY: 'down',
    }),
    context: () => ({
      tabId: activeTabId,
      title: agentContextTitle?.textContent || '',
      url: currentWebviewUrl(),
      tabs: agentTabsSnapshot().tabs,
    }),
  };
  window.browserAgent = Object.freeze(api);
}

function parseAgentCommand(input) {
  return agentActions.parseCommand(input);
}

async function performAgentAction(action, userText = '', { showUser = true } = {}) {
  if (!action) return;
  if (showUser && userText) appendAgentMessage(userText, 'user');
  if (action.kind === 'help') {
    appendAgentMessage('可用：读取页面、收集链接、收集表格、观察页面、滚动到顶部/底部；也可以输入“点击坐标 420,260”“双击坐标 420,260”“按键 Ctrl+L”“输入文本 关键词”，或使用选择器点击/填写。');
    return;
  }

  setAgentBusy(true);
  startAgentTaskTimer();
  agentStopRequested = false;
  const runId = agentRunSequence;
  const retryController = new AbortController();
  agentRetryController = retryController;
  let pendingActionView = null;
  try {
    let result;
    switch (action.kind) {
      case 'page':
        pendingActionView = appendAgentAction('browser_read_page', '执行中');
        result = await retryAgentPageAction(() => executePageScript(pageReadScript(), { type: 'read' }), retryController.signal, runId, '读取页面');
        pendingActionView?.setState(result?.ok === false ? '失败' : '已完成', { error: result?.ok === false, result, resultLabel: '页面信息' });
        break;
      case 'links':
        pendingActionView = appendAgentAction('browser_collect_links', '执行中');
        result = await retryAgentPageAction(() => executePageScript(linksScript(), { type: 'links' }), retryController.signal, runId, '收集链接');
        pendingActionView?.setState('已完成', { result, resultLabel: `查看 ${Array.isArray(result) ? result.length : 0} 个链接` });
        break;
      case 'tables':
        pendingActionView = appendAgentAction('browser_collect_tables', '执行中');
        result = await retryAgentPageAction(() => executePageScript(tablesScript(), { type: 'tables' }), retryController.signal, runId, '收集表格');
        pendingActionView?.setState('已完成', { result, resultLabel: `查看 ${Array.isArray(result) ? result.length : 0} 个表格` });
        break;
      case 'top':
      case 'bottom':
        pendingActionView = appendAgentAction(action.kind === 'top' ? '滚动到页面顶部' : '滚动到页面底部', '执行中');
        result = await retryAgentPageAction(() => executePageScript(scrollScript(action.kind), { type: 'scroll', position: action.kind }), retryController.signal, runId, action.kind === 'top' ? '滚动到顶部' : '滚动到底部');
        pendingActionView?.setState('已完成', { result, resultLabel: action.kind === 'top' ? '滚动到顶部' : '滚动到底部' });
        break;
      case 'screenshot':
        pendingActionView = appendAgentAction('browser_observe', '执行中');
        result = await retryAgentPageAction(() => executeAgentProtocolAction({ type: 'screenshot' }, retryController.signal), retryController.signal, runId, '观察页面');
        pendingActionView?.setState('已完成', { result: summarizeAgentObservation(result), resultLabel: '页面观察' });
        break;
      case 'input':
        pendingActionView = appendAgentAction(action.label || agentActions.actionLabel?.(action.inputAction) || '网页操作', '执行中');
        result = ['screenshot', 'mouse_move', 'wait'].includes(action.inputAction?.type)
          ? await retryAgentPageAction(() => executeAgentProtocolAction(action.inputAction, retryController.signal), retryController.signal, runId, action.label || '执行动作')
          : await executeAgentProtocolAction(action.inputAction, retryController.signal);
        pendingActionView?.setState(result?.ok === false ? '失败' : '已完成', {
          error: result?.ok === false,
          result: result?.type === 'observation' ? summarizeAgentObservation(result) : result,
          resultLabel: result?.type === 'observation' ? '页面观察' : '操作结果',
        });
        break;
      case 'open': {
        const url = normalizedUrl(action.url);
        const actionView = appendAgentAction('browser_open', '执行中');
        try {
          const opened = await agentNavigate({ tabId: activeTabId, url });
          actionView?.setState('已完成', { result: opened, resultLabel: url });
        } catch (error) {
          actionView?.setState('失败', { error: true, result: { ok: false, error: error?.message || '打开网页失败' } });
          throw error;
        }
        break;
      }
      case 'click':
        pendingActionView = appendAgentAction('browser_click_selector', '执行中', { arguments: { selector: action.selector } });
        result = await retryAgentPageAction(() => executePageScript(clickScript(action.selector), { type: 'click', selector: action.selector }), retryController.signal, runId, '点击页面元素', true);
        pendingActionView?.setState(result?.ok ? '已完成' : '失败', { result, error: result?.ok === false, resultLabel: '操作结果' });
        break;
      case 'fill':
        pendingActionView = appendAgentAction('browser_fill_selector', '执行中', { arguments: { selector: action.selector } });
        result = await retryAgentPageAction(() => executePageScript(fillScript(action.selector, action.value), { type: 'fill', selector: action.selector, value: action.value }), retryController.signal, runId, '填写页面元素', true);
        pendingActionView?.setState(result?.ok ? '已完成' : '失败', { result, error: result?.ok === false, resultLabel: '操作结果' });
        break;
      default:
        appendAgentMessage('暂不支持这个动作，请使用面板中的快捷按钮或输入明确的网页指令。', 'assistant', { error: true });
        break;
    }
  } catch (error) {
    pendingActionView?.setState(agentStopRequested ? '已取消' : '失败', {
      error: !agentStopRequested,
      result: { ok: false, error: error?.message || '当前页面未就绪' },
    });
    if (!agentStopRequested) appendAgentMessage(`操作失败：${error?.message || '当前页面未就绪'}`, 'assistant', { error: true });
  } finally {
    if (agentRetryController === retryController) agentRetryController = null;
    agentStopRequested = false;
    hideAgentThinking();
    stopAgentTaskTimer();
    setAgentBusy(false);
    if (agentTaskQueue.length && !tornDown) setAgentBusy(true);
    syncAgentContext();
    if (!tornDown && agentPanel?.hidden === false) agentComposer?.focus();
  }
}

function drainAgentTasks() {
  if (agentTaskDrainPromise) return agentTaskDrainPromise;
  const promise = (async () => {
    while (!tornDown && agentTaskQueue.length) {
      const task = agentTaskQueue.shift();
      if (task?.type === 'model') await runModelAgent(task.text, { showUser: task.showUser !== false, images: task.images });
      else if (task?.type === 'action') await performAgentAction(task.action, task.userText, { showUser: task.showUser !== false });
    }
  })();
  agentTaskDrainPromise = promise;
  void promise.then(() => {
    if (agentTaskDrainPromise === promise) agentTaskDrainPromise = null;
    if (!tornDown && !agentTaskQueue.length) setAgentBusy(false);
  }, () => {
    if (agentTaskDrainPromise === promise) agentTaskDrainPromise = null;
    if (!tornDown && !agentTaskQueue.length) setAgentBusy(false);
  });
  return promise;
}

function scheduleAgentTask(task, mode = 'queue') {
  if (!task) return;
  const active = Boolean(agentBusy || agentTaskDrainPromise);
  if (mode === 'immediate') agentTaskQueue.unshift(task);
  else agentTaskQueue.push(task);
  if (active) {
    if (mode === 'immediate' && task.type === 'model') stopModelAgent();
    if (agentState) agentState.textContent = mode === 'immediate' ? '即将发送' : '已排队';
  } else {
    void drainAgentTasks();
  }
}

function runAgentAction(action, userText = '') {
  if (!action) return;
  const active = Boolean(agentBusy || agentTaskDrainPromise);
  const showUser = Boolean(userText) && !active;
  if (userText && active) appendAgentMessage(userText, 'user');
  scheduleAgentTask({ type: 'action', action, userText, showUser }, 'queue');
}

function scheduleModelMessage(text, mode = 'queue', images = []) {
  const value = String(text || '').trim();
  const attachments = Array.isArray(images) ? images : [];
  if (!value && !attachments.length) return;
  const active = Boolean(agentBusy || agentTaskDrainPromise);
  if (active) appendAgentMessage(value || '已发送图片', 'user', { images: attachments });
  scheduleAgentTask({ type: 'model', text: value, images: attachments, showUser: !active }, mode);
}

function scheduleComposerMessage(mode = 'queue') {
  const text = agentComposer?.value.trim() || '';
  if (!text && !agentComposerImages.length) return;
  const images = agentComposerImages;
  agentComposerImages = [];
  renderAgentComposerImages();
  if (agentComposer) agentComposer.value = '';
  scheduleModelMessage(text, mode, images);
}

function setAgentOpen(open) {
  const nextOpen = Boolean(open);
  if (agentPanel) agentPanel.hidden = !nextOpen;
  agentToggle?.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  if (!nextOpen) setAgentSettingsOpen(false);
  if (nextOpen) {
    ensureAgentWelcome();
    void refreshBrowserSettings();
    syncAgentContext();
    window.setTimeout(() => (agentSettingsPanel?.hidden === false ? agentProtocolInput : agentComposer)?.focus(), 0);
  }
}

function teardown() {
  if (tornDown) return;
  tornDown = true;
  closePageFind(false);
  window.clearTimeout(downloadNoticeTimer);
  agentTaskQueue = [];
  stopModelAgent();
  clearAgentTaskTimer();
  setAgentBusy(false);
  setAgentOpen(false);
  for (const item of tabItems) {
    clearPageLoadTimer(item);
    try { item.view?.stop?.(); } catch {}
    item.view?.remove?.();
    item.newTabView?.remove?.();
  }
  tabItems.length = 0;
  webview = null;
  agentPointer = null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function extensionIconMarkup(item) {
  return item.iconDataUrl
    ? `<img data-extension-icon src="${escapeHtml(item.iconDataUrl)}" alt="" />`
    : '<svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-puzzle"></use></svg>';
}

function bindExtensionIconFallbacks(root) {
  for (const image of root.querySelectorAll('img[data-extension-icon]')) {
    image.addEventListener('error', () => {
      const fallback = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      fallback.setAttribute('class', 'shell-icon');
      fallback.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#shell-icon-puzzle');
      fallback.append(use);
      image.replaceWith(fallback);
    }, { once: true });
  }
}

function renderExtensions(nextItems) {
  extensionItems = Array.isArray(nextItems) ? nextItems : [];
  const enabledItems = extensionItems.filter((item) => item.enabled);
  const enabledCount = enabledItems.length;
  if (extensionCount) {
    extensionCount.textContent = String(enabledCount);
    extensionCount.hidden = enabledCount === 0;
  }
  if (extensionsEmpty) extensionsEmpty.hidden = enabledItems.length > 0;
  if (extensionToolbar) {
    extensionToolbar.textContent = '';
    for (const item of extensionItems.filter((candidate) => candidate.enabled && candidate.pinned)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'extension-toolbar-button';
      button.dataset.extensionToolbar = item.id;
      button.title = item.hasPanel ? `打开 ${item.name || '插件'} 面板` : item.name || '插件';
      button.setAttribute('aria-label', item.hasPanel ? `打开 ${item.name || '插件'} 面板` : item.name || '插件');
      button.innerHTML = extensionIconMarkup(item);
      extensionToolbar.append(button);
    }
    bindExtensionIconFallbacks(extensionToolbar);
  }
  if (!extensionsList) return;
  extensionsList.hidden = enabledItems.length === 0;
  if (extensionsCompatibility) {
    extensionsCompatibility.hidden = !enabledItems.some((item) => item.requiresUserScripts === true);
  }
  const renderItems = (items) => items.map((item) => {
    const name = item.name || '未命名插件';
    const stateLabel = item.status === 'error' ? '加载失败' : item.enabled ? '已启用' : '未启用';
    const description = item.description || '暂无简介';
    const hostPermissions = [...new Set([...(item.hostPermissions || []), ...(item.permissions || []).filter((permission) => {
      const value = String(permission || '').toLowerCase();
      return value === '<all_urls>' || ['*://', 'http://', 'https://', 'file://'].some((prefix) => value.startsWith(prefix));
    })])];
    const permissions = [...new Set([...(item.permissions || []), ...(item.optionalPermissions || [])].filter((permission) => !hostPermissions.includes(permission)))];
    const permissionMarkup = (values, emptyLabel) => values.length
      ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
      : `<span>${emptyLabel}</span>`;
    const error = item.error ? `<span class="extension-item-error">${escapeHtml(item.error)}</span>` : '';
    const detail = `<div class="extension-item-details" id="extension-item-details-${escapeHtml(item.id)}" hidden>
      <p class="extension-item-description">${escapeHtml(description)}</p>
      <dl><div><dt>版本</dt><dd>v${escapeHtml(item.version || '未知版本')} · Manifest V${Number(item.manifestVersion) || '未知'}</dd></div><div><dt>网站访问</dt><dd>${permissionMarkup(hostPermissions, '未声明网站访问权限')}</dd></div><div><dt>请求权限</dt><dd>${permissionMarkup(permissions, '未声明其他权限')}</dd></div></dl>
      ${error}<div class="extension-item-detail-actions"><button type="button" data-extension-toggle="${escapeHtml(item.id)}">${item.enabled ? '在此环境停用' : '在此环境启用'}</button>${item.hasPanel ? `<button type="button" data-extension-open="${escapeHtml(item.id)}">打开插件面板</button>` : ''}</div>
    </div>`;
    const content = `<span class="extension-item-icon" aria-hidden="true">${extensionIconMarkup(item)}</span><span class="extension-item-copy"><span class="extension-item-name">${escapeHtml(name)}</span><span class="extension-item-meta">${stateLabel}${item.hasPanel ? ' · 可打开面板' : ''}</span></span>`;
    const openLabel = item.hasPanel ? (item.enabled ? `打开 ${name} 面板` : `启用并打开 ${name} 面板`) : `查看 ${name} 信息`;
    const openContent = item.hasPanel
      ? `<button class="extension-item-open" type="button" data-extension-open="${escapeHtml(item.id)}" aria-label="${escapeHtml(openLabel)}">${content}</button>`
      : `<button class="extension-item-open" type="button" data-extension-details="${escapeHtml(item.id)}" aria-label="${escapeHtml(openLabel)}" aria-expanded="false" aria-controls="extension-item-details-${escapeHtml(item.id)}">${content}</button>`;
    const pinLabel = item.pinned ? '取消固定到工具栏' : '固定到工具栏';
    const controls = `<button class="extension-item-control extension-pin${item.pinned ? ' is-pinned' : ''}" type="button" data-extension-pin="${escapeHtml(item.id)}" title="${pinLabel}" aria-label="${pinLabel}" aria-pressed="${item.pinned ? 'true' : 'false'}"><svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-pin"></use></svg></button><button class="extension-item-control extension-more" type="button" data-extension-details="${escapeHtml(item.id)}" title="查看插件信息和操作" aria-label="${escapeHtml(name)} 更多选项" aria-expanded="false" aria-controls="extension-item-details-${escapeHtml(item.id)}"><svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-more"></use></svg></button>`;
    return `<article class="extension-item">${openContent}${controls}${detail}</article>`;
  }).join('');
  const renderGroup = (label, items) => items.length
    ? `<section class="extensions-group"><h3>${label}<span>${items.length}</span></h3>${renderItems(items)}</section>`
    : '';
  extensionsList.innerHTML = renderGroup('本环境已启用', enabledItems);
  bindExtensionIconFallbacks(extensionsList);
}

function formatDownloadBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let index = -1;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function downloadStateLabel(record) {
  if (record?.state === 'completed') return '已完成';
  if (record?.state === 'cancelled') return '已取消';
  if (record?.state === 'interrupted') return '已中断';
  if (record?.paused) return '已暂停';
  return '下载中';
}

function renderDownloads(nextItems = browserDownloads) {
  const completed = new Set(browserDownloads.filter((item) => item.state === 'completed').map((item) => item.id));
  browserDownloads = Array.isArray(nextItems) ? nextItems : [];
  const activeCount = browserDownloads.filter((item) => item.state === 'progressing').length;
  if (downloadCount) {
    downloadCount.textContent = String(activeCount);
    downloadCount.hidden = activeCount === 0;
  }
  if (downloadsToggle) {
    downloadsToggle.classList.toggle('is-downloading', activeCount > 0);
    const active = browserDownloads.filter((item) => item.state === 'progressing');
    const total = active.reduce((sum, item) => sum + (Number(item.totalBytes) || 0), 0);
    const received = active.reduce((sum, item) => sum + (Number(item.receivedBytes) || 0), 0);
    downloadsToggle.style.setProperty('--download-progress', `${total > 0 ? Math.min(100, received / total * 100) : 0}%`);
    if (browserDownloads.some((item) => item.state === 'completed' && !completed.has(item.id))) {
      downloadsToggle.classList.add('download-complete');
      downloadsToggle.title = '下载已完成';
      window.clearTimeout(downloadNoticeTimer);
      downloadNoticeTimer = window.setTimeout(() => { downloadsToggle.classList.remove('download-complete'); downloadsToggle.title = '下载'; }, 4000);
    }
  }
  if (downloadsEmpty) downloadsEmpty.hidden = browserDownloads.length > 0;
  if (!downloadsList) return;
  downloadsList.innerHTML = browserDownloads.map((record) => {
    const total = Number(record.totalBytes) || 0;
    const received = Number(record.receivedBytes) || 0;
    const progress = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
    const detail = total > 0 ? `${formatDownloadBytes(received)} / ${formatDownloadBytes(total)}` : formatDownloadBytes(received);
    const button = (action, label, icon) => `<button class="download-action" type="button" data-download-action="${action}" data-download-id="${escapeHtml(record.id)}" title="${label}" aria-label="${label}"><svg class="shell-icon" aria-hidden="true"><use href="#shell-icon-${icon}"></use></svg></button>`;
    const action = record.state === 'progressing'
      ? button(record.paused ? 'resume' : 'pause', record.paused ? '继续下载' : '暂停下载', record.paused ? 'play' : 'pause') + button('cancel', '取消下载', 'close')
      : record.state === 'completed' ? button('folder', '打开所在文件夹', 'folder') + button('open', '打开文件', 'open')
        : record.canResume ? button('resume', '继续下载', 'play') + button('cancel', '取消下载', 'close') : '';
    return `<div class="download-item"><div class="download-item-copy"><span class="download-item-name" title="${escapeHtml(record.filename || '下载文件')}">${escapeHtml(record.filename || '下载文件')}</span><span class="download-item-meta">${downloadStateLabel(record)} · ${escapeHtml(detail)}</span>${record.state === 'progressing' ? `<span class="download-progress"><i style="width:${progress}%"></i></span>` : ''}</div><div class="download-actions">${action}</div></div>`;
  }).join('');
}

async function refreshExtensions() {
  if (!window.shellApi?.getExtensions || !profileId) return;
  try {
    const result = await window.shellApi.getExtensions();
    if (result?.ok !== false) {
      renderExtensions(result?.extensions || []);
      setExtensionPanelStatus('');
    }
  } catch (error) {
    setShellStatus(`插件同步失败：${error.message || '未知错误'}`, 'error');
  }
}

function setExtensionPanelStatus(message) {
  if (!extensionsStatus) return;
  extensionsStatus.textContent = message;
  extensionsStatus.hidden = !message;
}

async function toggleExtension(extensionId) {
  const item = extensionItems.find((candidate) => candidate.id === extensionId);
  if (!item || !window.shellApi?.setExtensionEnabled) return;
  const nextEnabled = !item.enabled;
  const button = [...document.querySelectorAll('[data-extension-toggle]')]
    .find((candidate) => candidate.dataset.extensionToggle === extensionId);
  if (button) button.disabled = true;
  try {
    const result = await window.shellApi.setExtensionEnabled({ extensionId, enabled: nextEnabled });
    if (result?.ok === false) throw new Error(result.error || '插件状态更新失败');
    await refreshExtensions();
    setShellStatus(nextEnabled ? '插件已启用' : '插件已停用');
  } catch (error) {
    setShellStatus(`插件操作失败：${error.message || '未知错误'}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function toggleExtensionPinned(extensionId) {
  const item = extensionItems.find((candidate) => candidate.id === extensionId);
  if (!item || !window.shellApi?.setExtensionPinned) return;
  const button = [...document.querySelectorAll('[data-extension-pin]')]
    .find((candidate) => candidate.dataset.extensionPin === extensionId);
  if (button) button.disabled = true;
  try {
    const result = await window.shellApi.setExtensionPinned({ extensionId, pinned: !item.pinned });
    if (result?.ok === false) throw new Error(result.error || '插件固定状态更新失败');
    await refreshExtensions();
    setShellStatus(item.pinned ? '已从工具栏取消固定' : '已固定到工具栏');
  } catch (error) {
    setShellStatus(`插件固定失败：${error.message || '未知错误'}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function toggleExtensionDetails(button) {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  const detailsId = button.getAttribute('aria-controls');
  const details = detailsId ? document.getElementById(detailsId) : null;
  if (!details) return;
  details.hidden = expanded;
  document.querySelectorAll('[data-extension-details]').forEach((control) => {
    if (control.getAttribute('aria-controls') === detailsId) control.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });
}

async function openExtensionPanel(extensionId) {
  const item = extensionItems.find((candidate) => candidate.id === extensionId);
  if (!item) return;
  if (!item.hasPanel) {
    if (extensionsPanel) extensionsPanel.hidden = false;
    extensionsToggle?.setAttribute('aria-expanded', 'true');
    closeLocalListeners();
    setBrowserSettingsOpen(false);
    await refreshExtensions();
    const detailsButton = [...document.querySelectorAll('[data-extension-details]')]
      .find((candidate) => candidate.dataset.extensionDetails === extensionId);
    if (detailsButton && detailsButton.getAttribute('aria-expanded') !== 'true') toggleExtensionDetails(detailsButton);
    detailsButton?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (!window.shellApi?.openExtensionPanel) return;
  setExtensionPanelStatus('');
  try {
    // Opening a plugin is an explicit request to use it in this environment.
    // Enabling it here keeps the activation scope profile-local while making
    // the plugin row itself a useful entry point.
    if (!item.enabled) {
      const enabled = await window.shellApi.setExtensionEnabled?.({ extensionId, enabled: true });
      if (enabled?.ok === false) throw new Error(enabled.error || '插件启用失败');
      await refreshExtensions();
    }
    const result = await window.shellApi.openExtensionPanel(extensionId);
    if (result?.ok === false) throw new Error(result.error || '插件面板打开失败');
  } catch (error) {
    const message = `插件面板打开失败：${error.message || '未知错误'}`;
    setShellStatus(message, 'error');
    setExtensionPanelStatus(message);
    if (extensionsPanel) extensionsPanel.hidden = false;
    extensionsToggle?.setAttribute('aria-expanded', 'true');
  }
}

window.shellApi?.onTeardown(teardown);
window.shellApi?.onOpenNewTab?.((details) => {
  const url = typeof details === 'string' ? details : details?.url;
  if (!url) {
    createTab(url || 'about:newtab');
    return;
  }
  try {
    const item = createTab(normalizedUrl(url), { activate: details?.focus !== false, focusAddress: false });
    if (!item) throw new Error('无法创建新标签页');
  } catch (error) {
    setShellStatus(`新标签页打开失败：${error?.message || '未知错误'}`, 'error');
  }
});
window.shellApi?.onTabAction?.((details) => runTabAction(details.tabId, details.command));
window.shellApi?.onHistoryUpdated?.((details) => {
  if (!details?.profileId || details.profileId === profileId) applyBrowsingHistory(details.history);
});
window.shellApi?.onFindResult?.((result) => {
  const item = activeTab();
  if (!item?.view || pageFind?.hidden || item.findToken !== result?.token) return;
  try { if (item.view.getWebContentsId() !== result.webContentsId) return; } catch { return; }
  pageFindCount.textContent = `${result.activeMatchOrdinal || 0}/${result.matches || 0}`;
  pageFindCount.dataset.empty = result.matches === 0 ? 'true' : 'false';
});
window.shellApi?.onBrowserCommand?.((details) => {
  if (tornDown) return;
  let guestId;
  try { guestId = activeTab()?.view?.getWebContentsId(); } catch { return; }
  if (details?.webContentsId && guestId !== details.webContentsId) return;
  runBrowserShortcut(details?.command || '');
});
window.shellApi?.onDownloadsUpdated?.((details) => {
  if (details?.profileId && details.profileId !== profileId) return;
  renderDownloads(details?.downloads || []);
});
window.shellApi?.onExtensionsUpdated?.((items) => renderExtensions(items));
window.shellApi?.onConnectionUpdated?.((details) => {
  applyConnectionDetails(details);
});
window.shellApi?.onConfirmationRequest?.((request) => {
  if (!request?.requestId) return;
  void requestShellConfirmation(request.options || {})
    .then((confirmed) => window.shellApi?.respondToConfirmation?.(request.requestId, confirmed))
    .catch(() => window.shellApi?.respondToConfirmation?.(request.requestId, false));
});
window.shellApi?.onSettingsUpdated?.((settings) => renderBrowserSettings(settings));
window.shellApi?.onBookmarksUpdated?.((details) => {
  if (!details || typeof details !== 'object') return;
  if (details.profileId && details.profileId !== profileId) return;
  if (Array.isArray(details.bookmarks)) applyBookmarkState(details.bookmarks);
});
window.shellApi?.onProfileUpdated?.((details) => {
  if (!details || typeof details !== 'object') return;
  if (details.profileId && details.profileId !== profileId) return;
  if (typeof details.name === 'string' && details.name.trim()) {
    profileName = details.name.trim();
    setIdentityText('#profile-name', profileName);
    const item = activeTab();
    document.title = `${item?.title || '新标签页'} · ${profileName} · ${brandName}`;
    renderAgentSettings(browserSettings);
  }
  if (typeof details.startUrl === 'string' && details.startUrl.trim()) startUrl = details.startUrl.trim();
});
window.shellApi?.onToggleBookmarkBar?.(() => void toggleBookmarkBar());

browserSettingsToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  setBrowserSettingsOpen(browserSettingsPanel?.hidden !== false);
});
browserSettingsClose?.addEventListener('click', () => setBrowserSettingsOpen(false));
browserSettingsCancel?.addEventListener('click', () => setBrowserSettingsOpen(false));
browserSettingsAi?.addEventListener('click', () => {
  setBrowserSettingsOpen(false);
  setAgentOpen(true);
  if (agentComposer) {
    agentComposer.value = '请帮我配置浏览器快捷键和鼠标手势，例如：把刷新改为 Ctrl+R，开发者工具改为 Ctrl+Shift+I，右键右滑再左滑后退。';
    agentComposer.focus();
    agentComposer.select();
  }
});
browserSettingsForm?.addEventListener('submit', (event) => void saveBrowserSettings(event));
searchEnginePresetInput?.addEventListener('change', () => {
  if (searchEnginePresetInput.value === '__custom__') return;
  if (searchEngineInput) searchEngineInput.value = searchEnginePresetInput.value;
});
newTabBannerSourceInput?.addEventListener('input', () => {
  selectedBannerSource = newTabBannerSourceInput.value.trim();
});
newTabBannerFileInput?.addEventListener('change', () => {
  const file = newTabBannerFileInput.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    setBrowserSettingsStatus('Banner 文件不能超过 8 MB', true);
    newTabBannerFileInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    selectedBannerSource = typeof reader.result === 'string' ? reader.result : '';
    if (newTabBannerSourceInput) newTabBannerSourceInput.value = selectedBannerSource;
    setBrowserSettingsStatus('本地 Banner 已载入，保存后生效');
  });
  reader.addEventListener('error', () => setBrowserSettingsStatus('读取 Banner 文件失败', true));
  reader.readAsDataURL(file);
});
newTabSiteAdd?.addEventListener('click', () => {
  draftNewTabSites.push({ id: `site-${Date.now()}`, name: '', url: 'https://', icon: '↗' });
  renderNewTabSitesEditor();
});
agentKeyClear?.addEventListener('click', () => {
  clearAgentKeyRequested = true;
  if (agentKeyInput) agentKeyInput.value = '';
  if (agentKeyStatus) agentKeyStatus.textContent = '保存后清除密钥';
  if (agentKeyClear) agentKeyClear.hidden = true;
});

agentSettingsToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  setAgentSettingsOpen(agentSettingsPanel?.hidden !== false);
});
agentThemeToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  setAgentTheme(agentPanel?.dataset.theme === 'light' ? 'dark' : 'light');
});
agentSettingsCancel?.addEventListener('click', () => setAgentSettingsOpen(false));
agentSettingsForm?.addEventListener('submit', (event) => void saveAgentSettings(event));
agentSettingModelRefresh?.addEventListener('click', () => {
  if (!cancelAgentModelFetch()) void fetchAgentModels();
});
agentModelInput?.addEventListener('focus', () => {
  if (agentSettingModelOptions && !agentSettingModelOptions.options.length) void fetchAgentModels();
});
agentTokenClear?.addEventListener('click', () => {
  clearAgentTokenRequested = true;
  if (agentTokenInput) agentTokenInput.value = '';
  if (agentTokenStatus) agentTokenStatus.textContent = '保存后清除 Token';
  if (agentTokenClear) agentTokenClear.hidden = true;
});

agentToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = agentPanel?.hidden === false;
  setAgentOpen(!open);
  if (!open && extensionsPanel) {
    extensionsPanel.hidden = true;
    extensionsToggle?.setAttribute('aria-expanded', 'false');
  }
  if (!open && downloadsPanel) {
    downloadsPanel.hidden = true;
    downloadsToggle?.setAttribute('aria-expanded', 'false');
  }
  if (!open) {
    closeLocalListeners();
    setBrowserSettingsOpen(false);
  }
});
agentClose?.addEventListener('click', () => setAgentOpen(false));
agentModelSummary?.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = agentModelPicker?.hidden === false;
  if (agentModelPicker) agentModelPicker.hidden = open;
  agentModelSummary.setAttribute('aria-expanded', open ? 'false' : 'true');
  if (!open) void fetchAgentModels();
});
agentModelRefresh?.addEventListener('click', () => {
  if (!cancelAgentModelFetch()) void fetchAgentModels();
});
agentHumanVerificationResume?.addEventListener('click', () => void resumeHumanVerification());
agentContextUsage?.addEventListener('pointerenter', () => agentContextTooltip?.setAttribute('aria-hidden', 'false'));
agentContextUsage?.addEventListener('pointerleave', () => agentContextTooltip?.setAttribute('aria-hidden', 'true'));
agentContextUsage?.addEventListener('focus', () => agentContextTooltip?.setAttribute('aria-hidden', 'false'));
agentContextUsage?.addEventListener('blur', () => agentContextTooltip?.setAttribute('aria-hidden', 'true'));
agentContextUsage?.addEventListener('click', () => requestAgentContextCompression());
agentComposerForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (agentBusy) {
    stopModelAgent();
    if (agentComposerImages.length || agentComposer?.value.trim()) {
      setAgentComposerAttachmentStatus('当前轮已停止；输入和图片草稿保留，当前轮结束后再次发送');
    }
    return;
  }
  const input = agentComposer?.value.trim() || '';
  const images = agentComposerImages;
  if (!input && !images.length) return;
  agentComposerImages = [];
  renderAgentComposerImages();
  setAgentComposerAttachmentStatus('');
  agentComposer.value = '';
  if (images.length) {
    scheduleModelMessage(input, 'queue', images);
    return;
  }
  const parsed = parseAgentCommand(input);
  if (!parsed || parsed.kind === 'help') scheduleModelMessage(input);
  else void runAgentAction(parsed, input);
});
agentComposerAttachments?.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-agent-image]');
  if (!remove) return;
  const imageId = Number(remove.dataset.removeAgentImage);
  agentComposerImages = agentComposerImages.filter((image) => image.id !== imageId);
  renderAgentComposerImages();
  setAgentComposerAttachmentStatus(agentComposerImages.length ? `已添加 ${agentComposerImages.length} 张图片` : '');
});
agentComposer?.addEventListener('paste', (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItems = items.filter((item) => item.kind === 'file' && String(item.type || '').toLowerCase().startsWith('image/'));
  if (!imageItems.length) return;
  event.preventDefault();
  const textItem = items.find((item) => item.kind === 'string' && item.type === 'text/plain');
  const pastedText = event.clipboardData?.getData('text/plain') || '';
  if (pastedText) insertAgentComposerText(pastedText);
  agentImageReadQueue = agentImageReadQueue.then(async () => {
    const images = await Promise.all(imageItems.map((item) => readAgentClipboardImage(item.getAsFile())));
    if (tornDown) return;
      agentComposerImages.push(...images);
      renderAgentComposerImages();
      setAgentComposerAttachmentStatus(agentBusy
        ? `${agentComposerImages.length} 张图片已保留为草稿；当前轮结束后再次发送`
        : `已添加 ${agentComposerImages.length} 张图片`);
  }).catch((error) => {
    setAgentComposerAttachmentStatus(error?.message || '读取剪贴板图片失败', true);
  });
});
agentComposer?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    agentComposerForm?.requestSubmit();
  }
});

extensionsToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = extensionsPanel?.hidden === false;
  if (extensionsPanel) extensionsPanel.hidden = open;
  extensionsToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  if (!open) {
    closeLocalListeners();
    setBrowserSettingsOpen(false);
  }
  if (!open) void refreshExtensions();
});
extensionsList?.addEventListener('click', (event) => {
  const detailsButton = event.target.closest('[data-extension-details]');
  if (detailsButton) {
    toggleExtensionDetails(detailsButton);
    return;
  }
  const openButton = event.target.closest('[data-extension-open]');
  if (openButton) {
    void openExtensionPanel(openButton.dataset.extensionOpen);
    return;
  }
  const button = event.target.closest('[data-extension-toggle]');
  if (button) void toggleExtension(button.dataset.extensionToggle);
  const pinButton = event.target.closest('[data-extension-pin]');
  if (pinButton) void toggleExtensionPinned(pinButton.dataset.extensionPin);
});
extensionToolbar?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-extension-toolbar]');
  if (button) {
    event.stopPropagation();
    void openExtensionPanel(button.dataset.extensionToolbar);
  }
});
bookmarkBar?.addEventListener('click', (event) => {
  const overflow = event.target.closest('.bookmark-bar-overflow');
  if (overflow) {
    event.stopPropagation();
    if (bookmarkMenu?.hidden === false && bookmarkMenuTrigger === overflow) {
      closeBookmarkMenu();
      return;
    }
    const bounds = overflow.getBoundingClientRect();
    showBookmarkMenu({ type: 'overflow' }, bounds.left, bounds.bottom, overflow);
    return;
  }
  const button = event.target.closest('[data-bookmark-entry-id]');
  if (!button) {
    closeBookmarkMenu();
    return;
  }
  const item = bookmarkById(button.dataset.bookmarkEntryId);
  if (!item) return;
  handleBookmarkEntryClick(event, item, button);
});
// 文件夹菜单打开时，鼠标移到收藏栏上的其他文件夹会直接切换展开的文件夹。
bookmarkBar?.addEventListener('mouseover', (event) => {
  if (bookmarkMenu?.hidden !== false || !bookmarkMenuContext?.showContents) return;
  const button = event.target.closest('[data-bookmark-entry-type="folder"]');
  if (!button || button === bookmarkMenuTrigger) return;
  openBookmarkFolder(button.dataset.bookmarkEntryId, button);
});
if (bookmarkBar && typeof ResizeObserver === 'function') {
  new ResizeObserver(() => layoutBookmarkBarOverflow()).observe(bookmarkBar);
}
bookmarkBar?.addEventListener('contextmenu', (event) => {
  const button = event.target.closest('[data-bookmark-entry-id]');
  const item = button ? bookmarkById(button.dataset.bookmarkEntryId) : null;
  if (item) showBookmarkContextMenu(event, item);
  else showBookmarkRootMenu(event);
});
function handleBookmarkMenuClick(event) {
  const action = event.target.closest('[data-bookmark-action]');
  if (action) {
    event.stopPropagation();
    if (action.dataset.bookmarkAction === 'open-all' && action.dataset.bookmarkFolderId !== undefined) {
      openAllBookmarksInFolder(action.dataset.bookmarkFolderId);
      return;
    }
    void runBookmarkMenuAction(action.dataset.bookmarkAction);
    return;
  }
  const entry = event.target.closest('[data-bookmark-entry-id]');
  const item = entry ? bookmarkById(entry.dataset.bookmarkEntryId) : null;
  if (!item) return;
  handleBookmarkEntryClick(event, item, entry);
}

function handleBookmarkMenuContextMenu(event) {
  const entry = event.target.closest('[data-bookmark-entry-id]');
  const item = entry ? bookmarkById(entry.dataset.bookmarkEntryId) : null;
  if (item) {
    showBookmarkContextMenu(event, item);
    return;
  }
  if (event.target.closest('[data-bookmark-action]')) {
    event.preventDefault();
    return;
  }
  const panelFolderId = event.currentTarget.dataset.bookmarkFolderId;
  const parentId = panelFolderId !== undefined
    ? panelFolderId
    : bookmarkMenuContext?.type === 'folder'
      ? bookmarkMenuContext.id
      : (bookmarkMenuContext?.parentId || '');
  showBookmarkRootMenu(event, parentId);
}

function handleBookmarkMenuKeydown(event) {
  const panel = event.currentTarget;
  const level = bookmarkPanelLevel(panel);
  const focused = document.activeElement?.closest?.('[data-bookmark-entry-id]');
  if (event.key === 'ArrowRight' && focused?.dataset.bookmarkEntryType === 'folder') {
    event.preventDefault();
    openBookmarkSubmenu(focused.dataset.bookmarkEntryId, focused, { focus: true });
    return;
  }
  if ((event.key === 'ArrowLeft' || event.key === 'Escape') && level > 0) {
    event.preventDefault();
    event.stopPropagation();
    const trigger = bookmarkSubmenus[level - 1]?.trigger;
    closeBookmarkSubmenus(level - 1);
    trigger?.focus({ preventScroll: true });
    return;
  }
  const items = [...panel.querySelectorAll('button:not(:disabled)')];
  if (!items.length) return;
  const currentIndex = items.indexOf(document.activeElement);
  let targetIndex = currentIndex;
  if (event.key === 'ArrowDown') targetIndex = (currentIndex + 1 + items.length) % items.length;
  else if (event.key === 'ArrowUp') targetIndex = (currentIndex - 1 + items.length) % items.length;
  else if (event.key === 'Home') targetIndex = 0;
  else if (event.key === 'End') targetIndex = items.length - 1;
  else return;
  event.preventDefault();
  items[targetIndex]?.focus({ preventScroll: true });
}

// 悬停在菜单中的文件夹上稍作停留即展开下一级，移到其他条目时收起更深的子菜单。
function handleBookmarkMenuHover(event) {
  const panel = event.currentTarget;
  const entry = event.target.closest('[data-bookmark-entry-id], [data-bookmark-action]');
  if (!entry) return;
  const level = bookmarkPanelLevel(panel);
  window.clearTimeout(bookmarkHoverTimer);
  if (bookmarkSubmenus[level]?.trigger === entry) return;
  bookmarkHoverTimer = window.setTimeout(() => {
    if (!entry.isConnected) return;
    if (entry.dataset.bookmarkEntryType === 'folder') openBookmarkSubmenu(entry.dataset.bookmarkEntryId, entry);
    else closeBookmarkSubmenus(level);
  }, 220);
}

bookmarkMenu?.addEventListener('click', handleBookmarkMenuClick);
bookmarkMenu?.addEventListener('contextmenu', handleBookmarkMenuContextMenu);
bookmarkMenu?.addEventListener('keydown', handleBookmarkMenuKeydown);
bookmarkMenu?.addEventListener('mouseover', handleBookmarkMenuHover);
document.querySelector('#open-extension-manager')?.addEventListener('click', () => {
  extensionsPanel.hidden = true;
  extensionsToggle?.setAttribute('aria-expanded', 'false');
  void window.shellApi?.openExtensionManager?.();
});
extensionsClose?.addEventListener('click', () => {
  if (extensionsPanel) extensionsPanel.hidden = true;
  extensionsToggle?.setAttribute('aria-expanded', 'false');
});
downloadsToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = downloadsPanel?.hidden === false;
  if (downloadsPanel) downloadsPanel.hidden = open;
  downloadsToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  if (!open) {
    closeLocalListeners();
    setBrowserSettingsOpen(false);
    if (extensionsPanel) extensionsPanel.hidden = true;
    extensionsToggle?.setAttribute('aria-expanded', 'false');
    void refreshDownloads();
  }
});
localListenersToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = localListenersPanel?.hidden === false;
  if (localListenersPanel) localListenersPanel.hidden = open;
  localListenersToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  if (open) return;
  setBrowserSettingsOpen(false);
  setAgentOpen(false);
  closeBrowserMoreMenu();
  if (extensionsPanel) extensionsPanel.hidden = true;
  extensionsToggle?.setAttribute('aria-expanded', 'false');
  if (downloadsPanel) downloadsPanel.hidden = true;
  downloadsToggle?.setAttribute('aria-expanded', 'false');
  void refreshLocalListeners();
});
localListenersRefresh?.addEventListener('click', (event) => {
  event.stopPropagation();
  void refreshLocalListeners();
});
localListenersScheme?.addEventListener('change', renderLocalListeners);
localListenersList?.addEventListener('click', (event) => {
  const stopButton = event.target.closest('[data-local-listener-stop-index]');
  if (stopButton) {
    event.stopPropagation();
    void stopLocalListener(Number(stopButton.dataset.localListenerStopIndex), stopButton);
    return;
  }
  const button = event.target.closest('[data-local-listener-index]');
  if (button) openLocalListener(Number(button.dataset.localListenerIndex));
});
downloadsClear?.addEventListener('click', () => void clearCompletedDownloads());
downloadsList?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-download-action]');
  if (!button) return;
  void handleDownloadAction(button.dataset.downloadAction, button.dataset.downloadId);
});

function closeBrowserMoreMenu() {
  if (!browserMoreMenu) return;
  browserMoreMenu.hidden = true;
  browserMoreToggle?.setAttribute('aria-expanded', 'false');
}

function dismissBrowserPopovers() {
  closeBrowserMoreMenu();
  closeConnectionRouteMenu();
  closeBookmarkMenu();
  setTabSwitcherOpen(false);
  closeLocalListeners();
  if (downloadsPanel) downloadsPanel.hidden = true;
  downloadsToggle?.setAttribute('aria-expanded', 'false');
  if (extensionsPanel) extensionsPanel.hidden = true;
  extensionsToggle?.setAttribute('aria-expanded', 'false');
}

async function runBrowserCommand(command) {
  closeBrowserMoreMenu();
  const currentUrl = activeTab()?.url || address?.value || '';
  switch (command) {
    case 'new-tab': createTab('about:newtab'); break;
    case 'new-window': setShellStatus('当前版本暂不支持独立浏览器窗口', 'error'); break;
    case 'incognito': setShellStatus('当前版本暂不支持无痕窗口', 'error'); break;
    case 'passwords': await window.shellApi?.openExtensionManager?.('passwords'); break;
    case 'history': openHistoryPage(); break;
    case 'downloads': downloadsToggle?.click(); break;
    case 'bookmarks': {
      bookmarkBarCommandVisible = true;
      renderBookmarkBar();
      const bounds = browserMoreToggle?.getBoundingClientRect?.();
      window.setTimeout(() => showBookmarkMenu({ type: 'root' }, bounds?.left ?? 12, bounds?.bottom ?? 50), 0);
      break;
    }
    case 'extensions': extensionsToggle?.click(); break;
    case 'clear-data': {
      if (!await requestShellConfirmation({ title: '删除浏览数据', message: '删除当前环境的 Cookie、网站存储和浏览历史？' })) break;
      const result = await window.shellApi?.clearBrowsingData?.();
      if (result?.ok !== false) {
        recognizedNewTabSites = [];
        recentNewTabSearches = [];
        navigationHistory = [];
        for (const item of tabItems) if (item.isNewTab) renderNewTabPage(item);
        for (const item of tabItems) if (item.isHistory) renderHistoryPage(item);
      }
      setShellStatus(result?.ok === false ? (result.error || '删除浏览数据失败') : '浏览数据已删除', result?.ok === false ? 'error' : 'success');
      break;
    }
    case 'zoom-out': if (shellInterfaceZoom) shellInterfaceZoom.step(-1); else if (webview?.getZoomFactor && webview?.setZoomFactor) webview.setZoomFactor(Math.max(.25, (await webview.getZoomFactor()) - .1)); break;
    case 'zoom-in': if (shellInterfaceZoom) shellInterfaceZoom.step(1); else if (webview?.getZoomFactor && webview?.setZoomFactor) webview.setZoomFactor(Math.min(5, (await webview.getZoomFactor()) + .1)); break;
    case 'fullscreen': void window.shellApi?.toggleFullscreen?.(); break;
    case 'print': webview?.print?.({}); break;
    case 'translate': if (currentUrl) navigateAddress(`https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(currentUrl)}`); break;
    case 'find': openPageFind(); break;
    case 'share': if (navigator.share && currentUrl) await navigator.share({ title: lastPageTitle || currentUrl, url: currentUrl }).catch(() => {}); else setShellStatus('当前页面地址已复制'); if (!navigator.share && currentUrl) await navigator.clipboard?.writeText(currentUrl); break;
    case 'more-tools': setShellStatus('更多工具：开发者工具请使用 F12'); if (webview?.openDevTools) webview.openDevTools(); break;
    case 'help': navigateAddress('https://support.google.com/chrome/'); break;
    case 'settings': setBrowserSettingsOpen(true); break;
    case 'quit': window.close(); break;
    default: break;
  }
}

browserMoreToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  closeConnectionRouteMenu();
  const open = browserMoreMenu?.hidden === false;
  if (browserMoreMenu) browserMoreMenu.hidden = open;
  browserMoreToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  if (!open) browserMoreMenu?.querySelector('button:not(:disabled)')?.focus();
});
browserMoreMenu?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-browser-command]');
  if (button) void runBrowserCommand(button.dataset.browserCommand);
});
connectionRouteMenu?.addEventListener('click', (event) => {
  const option = event.target.closest('[data-connection-route-option]');
  if (option && !option.disabled) void switchConnectionRoute(option);
});
shellInputModalSubmit?.addEventListener('click', () => {
  closeShellInput(activeShellInput?.isConfirmation ? true : shellInputModalValue?.value ?? '');
});
shellInputModalCancel?.addEventListener('click', () => closeShellInput(null));
shellInputModalClose?.addEventListener('click', () => closeShellInput(null));
shellInputModalValue?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    closeShellInput(shellInputModalValue.value);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeShellInput(null);
  }
});
shellInputModal?.addEventListener('click', (event) => {
  if (event.target === shellInputModal) closeShellInput(null);
});
document.addEventListener('click', (event) => {
  if (tabSwitcherPanel?.hidden === false && !event.target.closest('#tab-switcher-panel, #tab-menu')) setTabSwitcherOpen(false);
  if (bookmarkMenu?.hidden === false && !event.target.closest('#bookmark-menu, .bookmark-submenu, #bookmark-bar')) closeBookmarkMenu();
  if (passwordPromptState && !event.target.closest('#password-vault-prompt')) hidePasswordSavePrompt();
  if (addressSuggestions?.hidden === false && !event.target.closest('#address-form')) hideAddressSuggestions();
  if (agentModelPicker?.hidden === false && !event.target.closest('.agent-model-picker-wrap')) closeAgentModelPicker();
  if (browserSettingsPanel?.hidden === false && !event.target.closest('#browser-settings-panel, #browser-settings-toggle')) {
    setBrowserSettingsOpen(false);
  }
  if (extensionsPanel?.hidden === false && !event.target.closest('#extensions-panel, #extensions-toggle')) {
    extensionsPanel.hidden = true;
    extensionsToggle?.setAttribute('aria-expanded', 'false');
  }
  if (downloadsPanel?.hidden === false && !event.target.closest('#downloads-panel, #downloads-toggle')) {
    downloadsPanel.hidden = true;
    downloadsToggle?.setAttribute('aria-expanded', 'false');
  }
  if (localListenersPanel?.hidden === false && !event.target.closest('#local-listeners-panel, #local-listeners-toggle')) {
    closeLocalListeners();
  }
  if (browserMoreMenu?.hidden === false && !event.target.closest('#browser-more-menu, #browser-more-toggle')) closeBrowserMoreMenu();
  if (connectionRouteMenu?.hidden === false && !event.target.closest('#connection-route-menu, #connection-details')) closeConnectionRouteMenu();
});

document.querySelector('#back').addEventListener('click', () => {
  if (webview && typeof webview.canGoBack === 'function' && webview.canGoBack()) webview.goBack();
});
document.querySelector('#forward').addEventListener('click', () => {
  if (webview && typeof webview.canGoForward === 'function' && webview.canGoForward()) webview.goForward();
});
document.querySelector('#reload').addEventListener('click', () => {
  const item = activeTab();
  if (item?.loading) { item.view?.stop(); item.loading = false; syncNavigationControls(); renderTabs(); }
  else reloadActivePage();
});
connectionDetailsButton?.addEventListener('click', () => void refreshConnection());
connectionDetailsButton?.addEventListener('contextmenu', (event) => void openConnectionRouteMenu(event));
document.querySelector('#address-form').addEventListener('submit', (event) => {
  event.preventDefault();
  hideAddressSuggestions();
  navigateAddress(addressValueForNavigation());
});

addressSuggestions?.addEventListener('mousedown', (event) => {
  if (event.target.closest('.address-suggestion')) event.preventDefault();
});
address?.addEventListener('focus', () => {
  hideAddressSchemeForEditing();
  showAddressSuggestions();
});
address?.addEventListener('blur', () => {
  finishAddressEditing();
  hideAddressSuggestions();
});
address?.addEventListener('input', () => {
  if (addressHiddenScheme && (!address.value || ADDRESS_SCHEME_PATTERN.test(address.value) || !looksLikeAddress(address.value))) {
    addressHiddenScheme = '';
  }
  showAddressSuggestions();
});
address?.addEventListener('pointerdown', beginAddressPointer);
address?.addEventListener('select', () => {
  if (addressPointerDown?.movedLeft && addressHiddenScheme && address.selectionStart === 0) revealAddressScheme();
});
window.addEventListener('pointermove', trackAddressPointer);
window.addEventListener('pointerup', endAddressPointer);
address?.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter' && event.altKey) {
    event.preventDefault();
    event.stopPropagation();
    const selected = suggestionRecords(addressValueForNavigation())[addressSuggestionIndex];
    const url = selected?.url || normalizedUrl(addressValueForNavigation());
    hideAddressSuggestions();
    createTab(url, { focusAddress: false });
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectAddressSuggestion(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectAddressSuggestion(-1);
  } else if (event.key === 'Enter' && addressSuggestionIndex >= 0) {
    event.preventDefault();
    chooseActiveAddressSuggestion();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    syncAddress();
    hideAddressSuggestions();
    activeTab()?.view?.focus();
  }
});
bookmarkToggle?.addEventListener('click', () => void toggleBookmark());

newTabButton?.addEventListener('click', () => createTab('about:newtab'));
window.addEventListener('pointermove', updateTabDrag, { passive: false });
window.addEventListener('pointerup', () => finishTabDrag());
window.addEventListener('pointercancel', () => finishTabDrag(true));
window.addEventListener('blur', () => finishTabDrag(true));
window.addEventListener('resize', () => {
  if (tabActiveSurface?.dataset.ready) syncTabActiveSurface();
  positionPasswordSavePrompt();
  if (bookmarkMenu?.hidden === false) closeBookmarkMenu();
});
tabMenuButton?.addEventListener('click', () => {
  toggleTabSwitcher();
});
tabSwitcherSearch?.addEventListener('input', renderTabSwitcher);
tabSwitcherSearch?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    (tabSwitcherOpenList?.querySelector('[data-tab-switcher-action="switch"]')
      || tabSwitcherClosedList?.querySelector('[data-tab-switcher-action="restore"]'))?.focus();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    (tabSwitcherOpenList?.querySelector('[data-tab-switcher-action="switch"]')
      || tabSwitcherClosedList?.querySelector('[data-tab-switcher-action="restore"]'))?.click();
  }
});
tabSwitcherPanel?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-tab-switcher-action]');
  if (!action) return;
  if (action.dataset.tabSwitcherAction === 'switch') {
    const item = tabItems.find((candidate) => candidate.id === action.dataset.tabId);
    if (!item) return;
    setTabSwitcherOpen(false);
    activateTab(item.id);
  } else if (action.dataset.tabSwitcherAction === 'close') {
    closeTab(action.dataset.tabId);
  } else if (action.dataset.tabSwitcherAction === 'restore') {
    setTabSwitcherOpen(false);
    restoreClosedTab(action.dataset.closedTabId);
  }
});

window.addEventListener('keydown', (event) => {
  if (event.isComposing || event.defaultPrevented) return;
  if (event.key === 'Escape' && activeShellInput) {
    event.preventDefault();
    closeShellInput(null);
    return;
  }
  if (event.key === 'Escape' && bookmarkMenu?.hidden === false) {
    event.preventDefault();
    closeBookmarkMenu(true);
    return;
  }
  if (event.key === 'Escape' && connectionRouteMenu?.hidden === false) {
    event.preventDefault();
    closeConnectionRouteMenu(true);
    return;
  }
  if (event.key === 'Escape' && tabSwitcherPanel?.hidden === false) {
    event.preventDefault();
    setTabSwitcherOpen(false);
    tabMenuButton?.focus();
    return;
  }
  if (event.key === 'Escape' && passwordPromptState) {
    event.preventDefault();
    hidePasswordSavePrompt();
    return;
  }
  if (event.key === 'Escape' && tabDrag?.started) {
    event.preventDefault();
    finishTabDrag(true);
    return;
  }
  const shortcuts = browserSettings.browserShortcuts || {};
  if (browserShortcutMatches(event, shortcuts.reload)) {
    event.preventDefault();
    reloadActivePage();
    return;
  }
  if (browserShortcutMatches(event, shortcuts.devtools)) {
    event.preventDefault();
    toggleActiveDevTools();
    return;
  }
  const command = window.browserShortcuts?.browserShortcutCommandFromEvent(event);
  if (command && command !== 'address-open-new-tab') {
    event.preventDefault();
    runBrowserShortcut(command);
  }
});

pageFindInput?.addEventListener('input', () => runPageFind(true, true));
pageFindInput?.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); runPageFind(!event.shiftKey); }
});
pageFind?.addEventListener('submit', (event) => { event.preventDefault(); runPageFind(true); });
document.querySelector('#page-find-previous')?.addEventListener('click', () => runPageFind(false));
document.querySelector('#page-find-close')?.addEventListener('click', () => closePageFind());
document.querySelector('#downloads-close')?.addEventListener('click', () => { downloadsPanel.hidden = true; downloadsToggle?.setAttribute('aria-expanded', 'false'); downloadsToggle?.focus(); });
for (const panel of [browserMoreMenu, tabSwitcherPanel, downloadsPanel, connectionRouteMenu]) {
  panel?.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.target.matches('input, textarea, select')) return;
    const buttons = [...panel.querySelectorAll('button:not(:disabled)')].filter((button) => button.getClientRects().length > 0);
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next].focus();
  });
}

exposeBrowserAgent();
void refreshBrowserSettings();
void refreshRecognizedNewTabSites();
void refreshNewTabSearchHistory();
void refreshBrowsingHistory();
shellInterfaceZoom = window.interfaceZoom?.createInterfaceZoom({
  indicator: zoomIndicator,
  applyZoom: (factor) => {
    const item = activeTab();
    if (item?.isNewTab) {
      setNewTabZoomFactor(item.newTabView, factor);
      return;
    }
    setGuestZoomFactor(webview, factor);
  },
});
window.shellApi?.onInterfaceZoomCommand?.((command) => {
  if (typeof command?.leftControlDown === 'boolean') shellInterfaceZoom?.setLeftControlDown(command.leftControlDown);
  if (command?.reset) shellInterfaceZoom?.reset();
  else if (Number.isFinite(command?.direction)) shellInterfaceZoom?.step(command.direction);
});
void refreshBookmarks();
void refreshDownloads();
void refreshExtensions();
createTab('about:newtab');
ensureAgentWelcome();
setShellStatus('就绪');
