const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  net: electronNet,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell,
  Tray,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const QRCode = require('qrcode');
const { execFile, spawn } = require('node:child_process');
const { listLocalTcpListeners, stopLocalListener } = require('./local-listeners');
const {
  canonicalizeSite,
  normalizeSiteVisits,
  recordSiteVisit,
  recommendedSites,
} = require('./new-tab-sites');
const {
  isSearchQuery,
  normalizeSearchHistory,
  recordSearchQuery,
} = require('./new-tab-search-history');
const {
  addBookmarkRecord,
  createBookmarkFolder,
  deleteBookmarkRecord,
  normalizeFavicon,
  normalizeBookmarks,
  updateBookmarkRecord,
} = require('./bookmarks');

const {
  createStore,
  normalizeNewTabBanner,
  normalizeNewTabDisplayMode,
  normalizeNewTabSites,
  normalizeSearchEngines,
  normalizeTheme,
} = require('./store');
const {
  normalizeProxyNode,
  parseSubscriptionContent,
  resolveSubscriptionRedirect,
  sanitizeSource,
} = require('./proxy-parser');
const { parseV2raySubscriptionContent } = require('./v2ray-parser');
const { runBoundedBatch } = require('./batch-runner');
const { cleanupRuntime, startCore, terminate: terminateCore, safeCorePath } = require('./core-manager');
const { startSingbox } = require('./singbox-manager');
const { normalizeCore, resolveCorePath } = require('./core-registry');
const { checkLatestCore, installLatestCore } = require('./core-updater');
const { checkLatestBrowser, installLatestBrowser } = require('./browser-updater');
const { checkNodeReachability, checkProxyReachability } = require('./proxy-check');
const {
  selectRandomReachableNode,
  withExtensionStoreProxy,
} = require('./extension-store-network');
const { isPublicIp, lookupIpCountry, normalizeIp } = require('./ip-geo');
const { BRAND_DESCRIPTION, BRAND_NAME, BRAND_NATIVE_ICON_PATH } = require('./brand');
const {
  MAX_EXTENSION_ARCHIVE_BYTES,
  chromeWebStoreDownloadUrl,
  chromeWebStoreUpdateUrl,
  compareVersions,
  extensionIdFromArchive,
  extensionIconDataUrl,
  inspectExtensionSource,
  normalizeChromeWebStoreExtensionId,
  normalizeProfileIds,
  normalizeUpdateUrl,
  parseUpdateManifest,
  prepareExtensionSource,
  resolveExtensionPanels,
  removeManagedExtension,
  toggleProfileId,
} = require('./extension-manager');
const {
  getCrxSosoExtensionDetails,
  normalizeExtensionId: normalizeCrxSosoExtensionId,
  resolveCrxSosoDownload,
  searchCrxSosoExtensions,
} = require('./extension-store');
const {
  getOfficialExtensionStoreDetail,
  searchOfficialExtensionStore,
} = require('./official-extension-store');
const {
  extractSubscriptionMetadata,
  isSubscriptionInfoNode,
  sanitizeSubscriptionMetadata,
} = require('./subscription-meta');
const {
  normalizeSubscriptionName,
  resolveSubscriptionName,
} = require('./subscription-name');
const {
  createTestIdentityId,
  createTestIdentityRequestHandler,
  ensureTestIdentity,
  normalizeTestIdentityId,
  normalizeTestIdentityOrigins,
} = require('./profile-identity');
const {
  addTraffic,
  headerBytes,
  normalizeTraffic,
  uploadBytes,
} = require('./traffic-meter');
const {
  DEFAULT_AGENT_SETTINGS,
  REASONING_EFFORTS: AGENT_REASONING_EFFORTS,
  PROTOCOLS: AGENT_PROTOCOLS,
  TOOL_DEFINITIONS: AGENT_TOOL_DEFINITIONS,
  authHeaders: agentAuthHeaders,
  buildAgentRequest,
  extractErrorMessage: extractAgentErrorMessage,
  normalizeBaseUrl: normalizeAgentBaseUrl,
  normalizeProtocol: normalizeAgentProtocol,
  normalizeReasoningEffort,
  modelsEndpointFor: agentModelsEndpointFor,
  parseAgentResponse,
  reasoningEffortFallbacks,
  trimAgentMessages,
} = require('./agent-protocols');
const {
  DEFAULT_JEV_SETTINGS,
  PROVIDERS: JEV_PROVIDERS,
  buildJevRequest,
  extractErrorMessage: extractJevErrorMessage,
  normalizeBaseUrl: normalizeJevBaseUrl,
  normalizeProvider: normalizeJevProvider,
  parseJevResponse,
} = require('./jev-protocols');
const {
  buildExternalEngineArgs,
  sameEnginePath,
  validateEnginePath,
  waitForProcessSpawn,
} = require('./engine-runtime');
const { APP_VERSION } = require('./version');
const PACKAGE_METADATA = require('../../package.json');
const {
  deletePasswordEntry,
  getPasswordEntry,
  publicPasswordEntry,
  requirePasswordProfile,
  savePasswordEntry,
} = require('./password-vault');

let mainWindow;
let tray;
let store;
let stateFile;
let quitCleanupStarted = false;
let previousRunningProfileCount = 0;
const profileWindows = new Map();
const externalProcesses = new Map();
const profileRuntimeModes = new Map();
const coreProcesses = new Map();
const profileAuth = new Map();
const profileSessions = new Map();
const profileSessionRefs = new Map();
const profileIdentityHooks = new Map();
const profileTrafficTrackers = new Map();
const profileGuests = new Map();
const activeProfileWindows = new Set();
const retiredProfileWindows = new Set();
const profileLaunches = new Map();
const profileLaunchConfirmations = new Map();
const pendingUiConfirmations = new Map();
let nextUiConfirmationId = 0;
const profileStops = new Set();
const extensionStoreProxyCores = new Set();
const profileExtensionErrors = new Map();
const extensionPanelWindows = new Map();
const guestGestureStates = new WeakMap();
const profileSessionHandlers = new WeakSet();
const profileDownloadRecords = new Map();
const profileDownloadItems = new Map();
const profileAgentFileGrants = new Map();
const extensionUpdateRuns = new Map();
const retiredExtensionRoots = new Map();
const connectionCheckRuns = new Map();
const ipCountryRuns = new Map();
const ipCountryCache = new Map();
const PROFILE_TEARDOWN_TIMEOUT_MS = 1500;
const PROFILE_DATA_CLEAR_TIMEOUT_MS = 10000;
const TRAFFIC_PERSIST_INTERVAL_MS = 1000;
const TRAFFIC_BROADCAST_INTERVAL_MS = 250;
const SINGLE_INSTANCE_APP_ID = 'com.local.chromeprofilebrowser';
const SINGLE_INSTANCE_APP_NAME = PACKAGE_METADATA.name;
const EXTENSION_DATA_DIR = 'extensions';
const MAX_EXTENSION_UPDATE_MANIFEST_BYTES = 512 * 1024;
const CONNECTION_CHECK_INTERVAL_MS = 60_000;
const CORE_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CONNECTION_CHECK_TIMEOUT_MS = 7000;
const CONNECTION_CHECK_BATCH_CONCURRENCY = 3;
const PROFILE_LAUNCH_CONFIRMATION_TTL_MS = 2 * 60 * 1000;
const DIRECT_CONNECTION_TARGET = Object.freeze({ host: 'example.com', port: 80 });
const DEFAULT_SEARCH_ENGINE_URL = 'https://www.google.com/search?q=%s';
const DEFAULT_BROWSER_SHORTCUTS = Object.freeze({ reload: 'F5', devtools: 'F12' });
const DEFAULT_MOUSE_GESTURE = Object.freeze({
  enabled: true,
  button: 'right',
  sequence: Object.freeze(['right', 'left']),
  threshold: 80,
  action: 'back',
});
const SHORTCUT_MODIFIERS = new Map([
  ['ctrl', 'Ctrl'], ['control', 'Ctrl'], ['cmd', 'Meta'], ['command', 'Meta'], ['meta', 'Meta'],
  ['alt', 'Alt'], ['option', 'Alt'], ['shift', 'Shift'],
]);
const SHORTCUT_KEYS = new Set([
  ...Array.from({ length: 24 }, (_item, index) => `F${index + 1}`),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'Backspace', 'Tab',
  'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete',
]);
const MOUSE_GESTURE_DIRECTIONS = new Set(['left', 'right', 'up', 'down']);
const MOUSE_GESTURE_ACTIONS = new Set(['back', 'forward', 'reload', 'devtools']);
const MOUSE_BUTTONS = new Set(['left', 'middle', 'right']);
const MAX_AGENT_SETTING_LENGTH = 2048;
const MAX_AGENT_API_LENGTH = 256;
const MAX_AGENT_SUFFIX_LENGTH = 256;
const MAX_AGENT_KEY_LENGTH = 4096;
const MAX_AGENT_MODEL_LENGTH = 256;
const MAX_JEV_MODEL_LENGTH = 256;
const MAX_AGENT_MESSAGE_COUNT = 256;
const MAX_AGENT_REQUEST_BYTES = 8 * 1024 * 1024;
const AGENT_REQUEST_TIMEOUT_MS = 120000;
const MAX_BOOKMARK_FAVICON_BYTES = 64 * 1024;
const SECRET_CORE_KEYS = new Set(['uuid', 'password', 'publicKey', 'shortId', 'spiderX']);
const COUNTRY_NAMES = Object.freeze({
  AE: '阿联酋', AT: '奥地利', AU: '澳大利亚', BE: '比利时', BR: '巴西',
  CA: '加拿大', CH: '瑞士', CN: '中国', CZ: '捷克', DE: '德国', DK: '丹麦',
  ES: '西班牙', FI: '芬兰', FR: '法国', GB: '英国', HK: '中国香港', ID: '印度尼西亚',
  IN: '印度', IT: '意大利', JP: '日本', KR: '韩国', MY: '马来西亚', NL: '荷兰',
  NO: '挪威', NZ: '新西兰', PH: '菲律宾', PL: '波兰', RU: '俄罗斯', SG: '新加坡',
  SE: '瑞典', TH: '泰国', TR: '土耳其', TW: '中国台湾', UA: '乌克兰', US: '美国',
  VN: '越南',
});
let directConnectionCheck;
let connectionMonitorTimer;
let connectionMonitorRun;
let coreUpdateCheckTimer;
let coreUpdateCheckRun;
let coreUpdateState = [];
let browserUpdateState = null;
let directConnectionHealth = null;
let pendingSecondInstance = false;

// Electron scopes its singleton lock to userData. Use a stable lock directory
// while requesting it, then restore the user's original data directory.
const originalUserDataPath = app.getPath('userData');
const singleInstanceLockPath = path.join(app.getPath('appData'), SINGLE_INSTANCE_APP_ID);
fs.mkdirSync(singleInstanceLockPath, { recursive: true });
app.setName(SINGLE_INSTANCE_APP_NAME);
if (process.platform === 'win32' && typeof app.setAppUserModelId === 'function') {
  app.setAppUserModelId(SINGLE_INSTANCE_APP_ID);
}
app.setPath('userData', singleInstanceLockPath);
const hasSingleInstanceLock = app.requestSingleInstanceLock({
  appId: SINGLE_INSTANCE_APP_ID,
  pid: process.pid,
});
app.setPath('userData', originalUserDataPath);
if (!hasSingleInstanceLock) app.quit();

function handleSecondInstance(_event, _commandLine, _workingDirectory, additionalData) {
  const incomingAppId = safeText(additionalData?.appId);
  if (incomingAppId && incomingAppId !== SINGLE_INSTANCE_APP_ID) return;
  if (!app.isReady() || !store || !mainWindow) {
    pendingSecondInstance = true;
    return;
  }
  showManagerWindow();
}

app.on('second-instance', handleSecondInstance);

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function validatedInterfaceZoomFactor(value) {
  const factor = Number(value);
  if (!Number.isFinite(factor) || factor < 0.5 || factor > 2) {
    throw new Error('界面缩放比例必须在 50% 至 200% 之间');
  }
  return Math.round(factor * 10) / 10;
}

function normalizeShortcutKey(value) {
  const raw = safeText(value).replace(/^Key/i, '').replace(/^Digit/i, '');
  if (!raw) return '';
  if (/^f\d{1,2}$/i.test(raw) && SHORTCUT_KEYS.has(raw.toUpperCase())) return raw.toUpperCase();
  if (/^[a-z]$/i.test(raw) || /^\d$/.test(raw)) return raw.toUpperCase();
  const aliases = { Esc: 'Escape', Spacebar: 'Space', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown' };
  const key = aliases[raw] || raw;
  return SHORTCUT_KEYS.has(key) ? key : '';
}

function normalizeShortcut(value, fallback) {
  const fallbackValue = safeText(fallback) || 'F5';
  const text = safeText(value);
  if (!text) return fallbackValue;
  const parts = text.split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error('快捷键不能为空');
  const modifiers = new Set();
  let key = '';
  for (const part of parts) {
    const modifier = SHORTCUT_MODIFIERS.get(part.toLowerCase());
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }
    if (key) throw new Error(`快捷键格式无效：${text}`);
    key = normalizeShortcutKey(part);
    if (!key) throw new Error(`快捷键包含无效按键：${part}`);
  }
  if (!key) throw new Error(`快捷键必须包含有效按键：${text}`);
  return [...['Ctrl', 'Alt', 'Shift', 'Meta'].filter((item) => modifiers.has(item)), key].join('+');
}

function normalizedBrowserShortcuts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    reload: normalizeShortcut(source.reload, DEFAULT_BROWSER_SHORTCUTS.reload),
    devtools: normalizeShortcut(source.devtools, DEFAULT_BROWSER_SHORTCUTS.devtools),
  };
}

function normalizeGestureSequence(value, fallback = DEFAULT_MOUSE_GESTURE.sequence) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[,\s>→]+/).filter(Boolean);
  if (!source.length) return [...fallback];
  if (source.length !== 2) throw new Error('鼠标手势需要两个方向');
  const sequence = source.map((item) => {
    const direction = String(item).trim().toLowerCase();
    const aliases = { 左: 'left', 右: 'right', 上: 'up', 下: 'down' };
    const normalized = aliases[direction] || direction;
    if (!MOUSE_GESTURE_DIRECTIONS.has(normalized)) throw new Error('鼠标手势方向无效');
    return normalized;
  });
  if (sequence[0] === sequence[1]) throw new Error('鼠标手势需要两个不同方向');
  return sequence;
}

function normalizedMouseGesture(value) {
  const source = value && typeof value === 'object' ? value : {};
  if (source.enabled !== undefined && typeof source.enabled !== 'boolean') throw new Error('鼠标手势启用状态无效');
  const button = safeText(source.button).toLowerCase() || DEFAULT_MOUSE_GESTURE.button;
  if (!MOUSE_BUTTONS.has(button)) throw new Error('鼠标手势按键无效');
  const action = safeText(source.action).toLowerCase() || DEFAULT_MOUSE_GESTURE.action;
  if (!MOUSE_GESTURE_ACTIONS.has(action)) throw new Error('鼠标手势动作无效');
  const threshold = source.threshold === undefined || source.threshold === ''
    ? DEFAULT_MOUSE_GESTURE.threshold
    : Number(source.threshold);
  if (!Number.isSafeInteger(threshold) || threshold < 16 || threshold > 400) throw new Error('鼠标手势距离必须在 16 到 400 之间');
  return {
    enabled: source.enabled === undefined ? DEFAULT_MOUSE_GESTURE.enabled : Boolean(source.enabled),
    button,
    sequence: normalizeGestureSequence(source.sequence),
    threshold,
    action,
  };
}

function shortcutInputKey(input) {
  return normalizeShortcutKey(input?.key || input?.code || '');
}

function shortcutMatches(input, shortcut) {
  const normalized = normalizeShortcut(shortcut, 'F5');
  const parts = normalized.split('+');
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));
  return shortcutInputKey(input) === key
    && Boolean(input?.control) === modifiers.has('Ctrl')
    && Boolean(input?.alt) === modifiers.has('Alt')
    && Boolean(input?.shift) === modifiers.has('Shift')
    && Boolean(input?.meta) === modifiers.has('Meta');
}

function parseSubscriptionSortOrder(value, { allowMissing = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (allowMissing) return null;
    throw new Error('订阅排序号必须是从 0 开始的整数');
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new Error('订阅排序号必须是从 0 开始的整数');
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('订阅排序号必须是从 0 开始的整数');
  return number;
}

function orderedSubscriptions(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({ item, index, sortOrder: parseSubscriptionSortOrder(item.sortOrder, { allowMissing: true }) ?? index }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.index - right.index)
    .map(({ item }) => item);
}

function persistSubscriptionOrder(orderedIds) {
  const positions = new Map(orderedIds.map((idValue, index) => [String(idValue), index]));
  store.update((next) => {
    next.subscriptions = orderedSubscriptions(next.subscriptions)
      .sort((left, right) => positions.get(left.id) - positions.get(right.id))
      .map((item, index) => ({ ...item, sortOrder: index }));
  });
}

function countryName(value) {
  const text = safeText(value);
  if (!text) return '';
  const compact = text.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const code = compact.toUpperCase();
  if (COUNTRY_NAMES[code]) return COUNTRY_NAMES[code];
  const characters = [...compact];
  const flagIndex = characters.findIndex((character) => {
    const point = character.codePointAt(0);
    return point >= 0x1f1e6 && point <= 0x1f1ff;
  });
  if (flagIndex >= 0) {
    const first = characters[flagIndex].codePointAt(0);
    const second = characters[flagIndex + 1]?.codePointAt(0);
    if (second >= 0x1f1e6 && second <= 0x1f1ff) {
      const flagCode = String.fromCharCode(first - 0x1f1e6 + 65, second - 0x1f1e6 + 65);
      if (COUNTRY_NAMES[flagCode]) return COUNTRY_NAMES[flagCode];
    }
  }
  return Object.values(COUNTRY_NAMES).find((name) => compact === name) || '';
}

function inferCountryFromText(value) {
  const text = safeText(value);
  if (!text) return '';
  const direct = countryName(text);
  if (direct) return direct;
  const codePattern = /(^|[^A-Za-z])([A-Za-z]{2})(?=$|[^A-Za-z])/g;
  let match;
  while ((match = codePattern.exec(text))) {
    const country = COUNTRY_NAMES[match[2].toUpperCase()];
    if (country) return country;
  }
  return Object.values(COUNTRY_NAMES).find((name) => text.includes(name)) || '';
}

function nodeCountry(node) {
  const suppliedValues = [node?.countryCode, node?.country, node?.countryName]
    .map((value) => safeText(value))
    .filter(Boolean);
  for (const supplied of suppliedValues) {
    const direct = countryName(supplied) || inferCountryFromText(supplied);
    if (direct) return direct;
  }
  const supplied = suppliedValues[0] || '';
  return inferCountryFromText(node?.name) || supplied.slice(0, 32) || '未知国家';
}

function nodeIp(node) {
  const detected = storedNodeIp(node);
  if (detected) return detected;
  const host = safeText(node?.host);
  if (!host) return '未解析';
  return net.isIP(host) ? host : `${proxyHost(host)}（待解析）`;
}

function storedNodeIp(node) {
  return safeText(node?.ipAddress || node?.ip || node?.resolvedIp);
}

function connectionLatencyLabel(node, health) {
  const state = safeText(node?.status || health?.status).toLowerCase();
  if (state === 'checking') return '检测中';
  const latency = Number(node?.latencyMs ?? health?.latencyMs);
  return Number.isFinite(latency) && latency >= 0 ? `${Math.round(latency)} ms` : '未测';
}

function connectionDetails(node, health = null) {
  if (!node) return { country: '系统直连', ip: '未解析', latency: connectionLatencyLabel(null, health), label: '系统直连' };
  return {
    country: nodeCountry(node),
    ip: nodeIp(node),
    latency: connectionLatencyLabel(node, health),
    label: `${node.protocol ? String(node.protocol).toUpperCase() : '代理'} · ${proxyHost(node.host)}:${node.port}`,
  };
}

function safeProfileId(value) {
  const candidate = safeText(value);
  return /^[A-Za-z0-9_-]{1,96}$/.test(candidate) ? candidate : '';
}

function profilePartition(profileId) {
  const normalized = safeProfileId(profileId);
  if (!normalized) throw new Error('环境标识无效');
  return `persist:profile-${normalized}`;
}

function profileTestIdentity(profile, existingProfile) {
  const identityId = normalizeTestIdentityId(existingProfile?.testIdentityId) || createTestIdentityId();
  const hasOrigins = profile && Object.prototype.hasOwnProperty.call(profile, 'testIdentityOrigins');
  const originsInput = hasOrigins ? profile.testIdentityOrigins : existingProfile?.testIdentityOrigins;
  return {
    testIdentityId: identityId,
    testIdentityOrigins: normalizeTestIdentityOrigins(originsInput, { strict: true }),
  };
}

function migrateProfileTestIdentities() {
  const current = store.get();
  let changed = false;
  for (const profile of current.profiles) {
    const normalized = ensureTestIdentity(profile);
    if (profile.testIdentityId !== normalized.testIdentityId
      || JSON.stringify(profile.testIdentityOrigins || []) !== JSON.stringify(normalized.testIdentityOrigins)) {
      profile.testIdentityId = normalized.testIdentityId;
      profile.testIdentityOrigins = normalized.testIdentityOrigins;
      changed = true;
    }
  }
  if (changed) store.save(current);
}

function migrateSubscriptionUrls() {
  const current = store.get();
  let changed = false;
  for (const subscription of current.subscriptions) {
    const stored = safeText(subscription?.url);
    if (!stored.startsWith('enc:')) continue;
    const revealed = revealSecret(stored);
    if (!revealed) continue;
    subscription.url = revealed;
    changed = true;
  }
  if (changed) store.save(current);
}

function detachProfileTestIdentity(profileSession) {
  const hook = profileIdentityHooks.get(profileSession);
  if (!hook) return;
  try {
    profileSession.webRequest.onBeforeSendHeaders(hook.filter, null);
  } catch {
    // The session may already be tearing down.
  }
  profileIdentityHooks.delete(profileSession);
}

function attachProfileTestIdentity(profileSession, profile) {
  detachProfileTestIdentity(profileSession);
  const identityId = normalizeTestIdentityId(profile?.testIdentityId);
  const origins = normalizeTestIdentityOrigins(profile?.testIdentityOrigins);
  if (!identityId || !origins.length || !profileSession?.webRequest) return false;
  const listener = createTestIdentityRequestHandler({ identityId, origins });
  const filter = { urls: ['*://*/*'] };
  profileSession.webRequest.onBeforeSendHeaders(filter, listener);
  profileIdentityHooks.set(profileSession, {
    filter,
    listener,
  });
  return true;
}

function profileTraffic(profileId, fallbackProfile) {
  const tracker = profileTrafficTrackers.get(profileId);
  if (tracker) return normalizeTraffic(tracker.traffic);
  return normalizeTraffic(fallbackProfile?.traffic);
}

function broadcastTrafficState(tracker) {
  if (!tracker || tracker.broadcastTimer || quitCleanupStarted) return;
  tracker.broadcastTimer = setTimeout(() => {
    tracker.broadcastTimer = undefined;
    broadcastState();
  }, TRAFFIC_BROADCAST_INTERVAL_MS);
}

function persistProfileTraffic(tracker) {
  if (!tracker) return;
  tracker.persistTimer = undefined;
  const profileId = tracker.profileId;
  if (!store.get().profiles.some((profile) => profile.id === profileId)) return;
  store.update((next) => {
    const profile = next.profiles.find((item) => item.id === profileId);
    if (profile) profile.traffic = normalizeTraffic(tracker.traffic);
  });
  if (!quitCleanupStarted) broadcastState();
}

function scheduleProfileTrafficPersist(tracker) {
  if (!tracker || tracker.persistTimer) return;
  tracker.persistTimer = setTimeout(() => persistProfileTraffic(tracker), TRAFFIC_PERSIST_INTERVAL_MS);
}

function recordProfileTraffic(tracker, requestId, uploaded, downloaded) {
  if (!tracker || profileTrafficTrackers.get(tracker.profileId) !== tracker) return;
  tracker.pendingRequests.delete(requestId);
  if (uploaded <= 0 && downloaded <= 0) return;
  tracker.traffic = addTraffic(tracker.traffic, uploaded, downloaded);
  scheduleProfileTrafficPersist(tracker);
  broadcastTrafficState(tracker);
}

function startProfileTrafficTracker(profileId, profileSession) {
  stopProfileTraffic(profileId);
  const profile = store.get().profiles.find((item) => item.id === profileId);
  if (!profile || !profileSession?.webRequest) return;
  const filter = { urls: ['http://*/*', 'https://*/*'] };
  const tracker = {
    profileId,
    profileSession,
    filter,
    traffic: normalizeTraffic(profile.traffic),
    pendingRequests: new Map(),
    persistTimer: undefined,
    broadcastTimer: undefined,
  };
  tracker.onBeforeRequest = (details, callback) => {
    tracker.pendingRequests.set(details.id, uploadBytes(details.uploadData));
    callback({ cancel: false });
  };
  tracker.onCompleted = (details) => {
    const uploaded = tracker.pendingRequests.get(details.id) || 0;
    const downloaded = details.fromCache ? 0 : headerBytes(details.responseHeaders);
    recordProfileTraffic(tracker, details.id, uploaded, downloaded);
  };
  tracker.onErrorOccurred = (details) => {
    const uploaded = tracker.pendingRequests.get(details.id) || 0;
    recordProfileTraffic(tracker, details.id, uploaded, 0);
  };
  profileSession.webRequest.onBeforeRequest(filter, tracker.onBeforeRequest);
  profileSession.webRequest.onCompleted(filter, tracker.onCompleted);
  profileSession.webRequest.onErrorOccurred(filter, tracker.onErrorOccurred);
  profileTrafficTrackers.set(profileId, tracker);
}

function stopProfileTraffic(profileId) {
  const tracker = profileTrafficTrackers.get(profileId);
  if (!tracker) return;
  try { tracker.profileSession.webRequest.onBeforeRequest(tracker.filter, null); } catch { /* Session may be closing. */ }
  try { tracker.profileSession.webRequest.onCompleted(tracker.filter, null); } catch { /* Session may be closing. */ }
  try { tracker.profileSession.webRequest.onErrorOccurred(tracker.filter, null); } catch { /* Session may be closing. */ }
  if (tracker.persistTimer) clearTimeout(tracker.persistTimer);
  if (tracker.broadcastTimer) clearTimeout(tracker.broadcastTimer);
  persistProfileTraffic(tracker);
  profileTrafficTrackers.delete(profileId);
}

function proxyHost(host) {
  const value = safeText(host);
  return value.includes(':') && !value.startsWith('[') ? `[${value}]` : value;
}

function normalizeAuthHost(value) {
  return String(value || '').replace(/^\[|\]$/g, '').toLowerCase();
}

function isAllowedNavigation(value) {
  try {
    const url = new URL(value);
    // The embedded browser should behave like a normal browser. Keep
    // javascript: navigations out of the shell, but allow page and document
    // schemes that Chromium can render inside a profile.
    return [
      'http:', 'https:', 'file:', 'data:', 'blob:', 'about:', 'chrome-extension:', 'view-source:',
    ].includes(url.protocol) && url.protocol !== 'javascript:';
  } catch {
    return false;
  }
}

function profileDownloadDirectory(profileId) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  const directory = path.join(app.getPath('downloads'), 'chrome-profile-browser', profileKey);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function publicDownloadRecord(record) {
  return {
    id: record.id,
    filename: record.filename,
    url: record.url,
    path: record.path,
    state: record.state,
    receivedBytes: record.receivedBytes,
    totalBytes: record.totalBytes,
    startedAt: record.startedAt,
    completedAt: record.completedAt || null,
  };
}

function downloadRecordFor(profileId, downloadId) {
  const key = safeProfileId(profileId);
  const idValue = safeText(downloadId);
  if (!key || !idValue) return null;
  return (profileDownloadRecords.get(key) || []).find((record) => record.id === idValue) || null;
}

function isProfileDownloadPath(profileId, targetPath) {
  const directory = path.resolve(profileDownloadDirectory(profileId));
  const candidate = path.resolve(String(targetPath || ''));
  const relative = path.relative(directory, candidate);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function openProfileDownload(profileId, input = {}) {
  const record = downloadRecordFor(profileId, input?.id);
  if (!record || !isProfileDownloadPath(profileId, record.path)) throw new Error('下载记录不存在');
  const action = String(input?.action || 'open').toLowerCase();
  if (action === 'folder') {
    shell.showItemInFolder(record.path);
    return { ok: true, action, id: record.id };
  }
  if (!fs.existsSync(record.path)) throw new Error('下载文件尚未完成');
  const error = await shell.openPath(record.path);
  if (error) throw new Error(error);
  return { ok: true, action: 'open', id: record.id };
}

function cancelProfileDownload(profileId, downloadId) {
  const entry = profileDownloadItems.get(safeText(downloadId));
  if (!entry || entry.profileId !== safeProfileId(profileId)) throw new Error('下载任务不存在');
  try { entry.item.cancel(); } catch { /* The download may have finished concurrently. */ }
  return { ok: true, id: safeText(downloadId) };
}

function clearCompletedProfileDownloads(profileId) {
  const key = safeProfileId(profileId);
  const records = (profileDownloadRecords.get(key) || []).filter((record) => record.state === 'progressing');
  profileDownloadRecords.set(key, records);
  sendBrowserDownloads(key);
  return { ok: true, downloads: records.map(publicDownloadRecord) };
}

function sendBrowserDownloads(profileId) {
  const win = profileWindows.get(profileId);
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('browser-shell:downloads-updated', {
      profileId,
      downloads: (profileDownloadRecords.get(profileId) || []).map(publicDownloadRecord),
    });
  } catch {
    // The shell may be closing; the next launch will receive current records.
  }
}

function agentFileGrantMap(profileId) {
  const key = safeProfileId(profileId);
  let grants = profileAgentFileGrants.get(key);
  if (!grants) {
    grants = new Map();
    profileAgentFileGrants.set(key, grants);
  }
  return grants;
}

function isPathWithin(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function agentFileGrantStat(grant) {
  let stat;
  try {
    stat = fs.statSync(grant.path);
  } catch {
    throw new Error('授权文件已不存在');
  }
  if (grant.kind === 'file' && !stat.isFile()) throw new Error('授权文件已不是普通文件');
  if (grant.kind === 'directory' && !stat.isDirectory()) throw new Error('授权文件夹已不是目录');
  return stat;
}

function agentFileDescriptor(grant, relativePath = '') {
  const stat = agentFileGrantStat(grant);
  const descriptor = {
    grantId: grant.id,
    name: (path.basename(grant.path) || path.parse(grant.path).root || '文件').slice(0, 240),
    kind: grant.kind,
    size: grant.kind === 'file' ? stat.size : undefined,
    modifiedAt: stat.mtime.toISOString(),
  };
  if (relativePath) descriptor.relativePath = relativePath.split(path.sep).join('/');
  return descriptor;
}

function createAgentFileGrant(profileId, filePath, kind) {
  const key = safeProfileId(profileId);
  if (!key || !path.isAbsolute(filePath)) throw new Error('文件授权路径无效');
  let resolved;
  try {
    resolved = fs.realpathSync(filePath);
  } catch {
    throw new Error('选中的文件或文件夹不存在');
  }
  const grant = {
    id: id('agent-file'),
    path: resolved,
    kind,
    createdAt: Date.now(),
  };
  agentFileGrantStat(grant);
  const grants = agentFileGrantMap(key);
  grants.set(grant.id, grant);
  return grant;
}

function agentFileGrantFor(profileId, grantId, expectedKind = '') {
  const key = safeProfileId(profileId);
  const token = safeText(grantId);
  if (!key || !token) throw new Error('文件授权 ID 无效');
  const grant = profileAgentFileGrants.get(key)?.get(token);
  if (!grant) throw new Error('文件授权已失效，请重新选择');
  if (expectedKind && grant.kind !== expectedKind) {
    throw new Error(expectedKind === 'directory' ? '该授权不是文件夹' : '该授权不是文件');
  }
  try {
    agentFileGrantStat(grant);
  } catch (error) {
    profileAgentFileGrants.get(key)?.delete(token);
    throw error;
  }
  return grant;
}

function normalizeAgentFileFilters(value) {
  if (!Array.isArray(value)) return [{ name: '所有文件', extensions: ['*'] }];
  const filters = value.map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    const extensions = (Array.isArray(source.extensions) ? source.extensions : [])
      .map((extension) => String(extension || '').trim().replace(/^\.+/, '').toLowerCase())
      .filter(Boolean);
    if (!extensions.length) return null;
    return { name: (safeText(source.name) || '文件类型').slice(0, 80), extensions };
  }).filter(Boolean);
  return filters.length ? filters : [{ name: '所有文件', extensions: ['*'] }];
}

async function chooseAgentFiles(profileId, input = {}, mode = 'files') {
  const source = input && typeof input === 'object' ? input : {};
  const parent = profileWindows.get(safeProfileId(profileId));
  const options = mode === 'directory'
    ? {
      title: '选择要授权给网页助手的文件夹',
      properties: ['openDirectory'],
    }
    : {
      title: '选择要授权给网页助手的文件',
      properties: ['openFile', ...(source.multiple === false ? [] : ['multiSelections'])],
      filters: normalizeAgentFileFilters(source.filters),
    };
  const defaultPath = safeText(source.defaultPath);
  if (defaultPath && path.isAbsolute(defaultPath) && fs.existsSync(defaultPath)) options.defaultPath = defaultPath;
  const host = parent && !parent.isDestroyed() ? parent : null;
  const result = host
    ? await dialog.showOpenDialog(host, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths?.length) return { ok: true, type: 'file-selection', canceled: true, grants: [] };
  const kind = mode === 'directory' ? 'directory' : 'file';
  const grants = result.filePaths.map((filePath) => createAgentFileGrant(profileId, filePath, kind));
  return {
    ok: true,
    type: mode === 'directory' ? 'directory-selection' : 'file-selection',
    canceled: false,
    grants: grants.map((grant) => agentFileDescriptor(grant)),
  };
}

function listAgentFiles(profileId, input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const directoryGrant = agentFileGrantFor(profileId, source.directoryId, 'directory');
  const rootPath = directoryGrant.path;
  const recursive = source.recursive === true;
  const entries = [];
  const queue = [{ path: rootPath, relativePath: '', depth: 0 }];
  const visited = new Set([rootPath]);
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    let children;
    try {
      children = fs.readdirSync(current.path, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    } catch {
      throw new Error('文件夹读取失败');
    }
    for (const child of children) {
      const candidatePath = path.join(current.path, child.name);
      let resolved;
      try {
        resolved = fs.realpathSync(candidatePath);
      } catch {
        continue;
      }
      if (!isPathWithin(rootPath, resolved)) continue;
      let stat;
      try { stat = fs.statSync(resolved); } catch { continue; }
      const kind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : '';
      if (!kind) continue;
      const grant = createAgentFileGrant(profileId, resolved, kind);
      const relativePath = path.join(current.relativePath, child.name);
      entries.push({
        ...agentFileDescriptor(grant, relativePath),
        depth: current.depth + 1,
      });
      if (recursive && kind === 'directory' && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push({ path: resolved, relativePath, depth: current.depth + 1 });
      }
    }
  }
  return {
    ok: true,
    type: 'file-list',
    directoryId: directoryGrant.id,
    entries,
    truncated: false,
  };
}

function readAgentFile(profileId, input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const grant = agentFileGrantFor(profileId, source.fileId, 'file');
  try {
    const buffer = fs.readFileSync(grant.path);
    const descriptor = agentFileDescriptor(grant);
    const binary = buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
    if (binary) return { ok: true, type: 'file-content', ...descriptor, binary: true, content: '' };
    return { ok: true, type: 'file-content', ...descriptor, binary: false, content: buffer.toString('utf8') };
  } catch {
    throw new Error('文件读取失败');
  }
}

function agentGuestContentsForProfile(profileId, webContentsId) {
  const candidate = Number(webContentsId);
  if (!Number.isSafeInteger(candidate) || candidate < 1) throw new Error('网页标签标识无效');
  const guest = [...(profileGuests.get(safeProfileId(profileId)) || [])]
    .find((contents) => contents?.id === candidate && !contents.isDestroyed?.());
  if (!guest) throw new Error('当前网页标签不可用');
  return guest;
}

async function uploadAgentFiles(profileId, input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const selector = safeText(source.selector);
  if (!selector) throw new Error('文件上传选择器无效');
  const rawGrantIds = Array.isArray(source.fileIds) ? source.fileIds : source.fileId ? [source.fileId] : [];
  const grantIds = [...new Set(rawGrantIds.map((value) => safeText(value)).filter(Boolean))];
  if (!grantIds.length) throw new Error('文件列表不能为空');
  const grants = grantIds.map((grantId) => agentFileGrantFor(profileId, grantId, 'file'));
  const contents = agentGuestContentsForProfile(profileId, source.webContentsId);
  const debuggerApi = contents.debugger;
  if (!debuggerApi || typeof debuggerApi.sendCommand !== 'function') throw new Error('当前 Electron 不支持文件上传');
  let attached = false;
  try {
    if (!debuggerApi.isAttached?.()) {
      await Promise.resolve(debuggerApi.attach('1.3'));
      attached = true;
    }
    await debuggerApi.sendCommand('DOM.enable');
    const documentResult = await debuggerApi.sendCommand('DOM.getDocument', { depth: 0, pierce: true });
    const rootNodeId = Number(documentResult?.root?.nodeId);
    if (!Number.isSafeInteger(rootNodeId) || rootNodeId < 1) throw new Error('网页文档尚未就绪');
    const queryResult = await debuggerApi.sendCommand('DOM.querySelector', { nodeId: rootNodeId, selector });
    const nodeId = Number(queryResult?.nodeId);
    if (!Number.isSafeInteger(nodeId) || nodeId < 1) throw new Error('未找到文件上传控件');
    const description = await debuggerApi.sendCommand('DOM.describeNode', { nodeId });
    const node = description?.node || {};
    const attributes = Array.isArray(node.attributes) ? node.attributes : [];
    let type = '';
    let multiple = false;
    for (let index = 0; index + 1 < attributes.length; index += 2) {
      const attributeName = String(attributes[index]).toLowerCase();
      if (attributeName === 'type') {
        type = attributes[index + 1];
      } else if (attributeName === 'multiple') {
        multiple = true;
      }
    }
    if (String(node.nodeName || '').toLowerCase() !== 'input' || String(type).toLowerCase() !== 'file') {
      throw new Error('选择器必须匹配文件上传控件');
    }
    if (grants.length > 1 && !multiple) throw new Error('当前上传控件不支持一次选择多个文件');
    await debuggerApi.sendCommand('DOM.setFileInputFiles', {
      nodeId,
      files: grants.map((grant) => grant.path),
    });
    return {
      ok: true,
      type: 'file-upload',
      selector,
      files: grants.map((grant) => agentFileDescriptor(grant)),
    };
  } finally {
    if (attached) {
      try { debuggerApi.detach(); } catch { /* The guest may be closing. */ }
    }
  }
}

function configureProfileSession(profileId, profileSession) {
  if (!profileSession || profileSessionHandlers.has(profileSession)) return;
  profileSessionHandlers.add(profileSession);

  // A profile launched in this app is an explicit browser context. Let pages
  // request the browser capabilities they need instead of silently denying
  // camera, microphone, clipboard, storage, notifications, or device APIs.
  profileSession.setPermissionCheckHandler?.(() => true);
  profileSession.setPermissionRequestHandler?.((_webContents, _permission, callback) => callback(true));
  profileSession.setDevicePermissionHandler?.(() => true);
  profileSession.setUSBProtectedClassesHandler?.(() => []);
  profileSession.setDownloadPath?.(profileDownloadDirectory(profileId));
  profileSession.setDisplayMediaRequestHandler?.((request, callback) => {
    // Capturing the requesting tab is the only source that is unambiguous in
    // a webview. Audio loopback is optional and Chromium ignores it where it
    // is unavailable.
    const streams = request?.frame ? { video: request.frame, audio: 'loopback' } : {};
    try { callback(streams); } catch { /* The page may have closed its media request. */ }
  });
  profileSession.on('will-download', (_event, item) => {
    const directory = profileDownloadDirectory(profileId);
    const filename = path.basename(item.getFilename?.() || 'download');
    let target = path.join(directory, filename || 'download');
    const extension = path.extname(target);
    const stem = path.basename(target, extension) || 'download';
    let suffix = 1;
    while (fs.existsSync(target)) {
      target = path.join(directory, `${stem} (${suffix++})${extension}`);
    }
    const record = {
      id: id('download'),
      filename: filename || 'download',
      url: safeText(item.getURL?.()),
      path: target,
      state: 'progressing',
      receivedBytes: Number(item.getReceivedBytes?.()) || 0,
      totalBytes: Number(item.getTotalBytes?.()) || 0,
      startedAt: new Date().toISOString(),
    };
    const records = profileDownloadRecords.get(profileId) || [];
    records.unshift(record);
    profileDownloadRecords.set(profileId, records.slice(0, 100));
    profileDownloadItems.set(record.id, { profileId, item });
    try { item.setSavePath(target); } catch { /* Chromium may have chosen a path already. */ }
    const update = () => {
      record.receivedBytes = Number(item.getReceivedBytes?.()) || record.receivedBytes;
      record.totalBytes = Number(item.getTotalBytes?.()) || record.totalBytes;
      sendBrowserDownloads(profileId);
    };
    item.on('updated', update);
    item.once('done', (_doneEvent, state) => {
      record.state = safeText(state, 'completed');
      record.completedAt = new Date().toISOString();
      update();
      profileDownloadItems.delete(record.id);
      item.removeListener?.('updated', update);
    });
    sendBrowserDownloads(profileId);
  });
}

function terminateExternalProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, (error) => {
      if (error) {
        try { child.kill(); } catch { /* The process may have exited. */ }
      }
    });
    return;
  }
  if (child.pid) {
    try {
      // Detached Chromium owns a process group on POSIX; terminate its renderer tree too.
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      // Fall back to the direct child when the group is already gone.
    }
  }
  try {
    child.kill();
  } catch {
    // The process may have already exited.
  }
}

function protectSecret(value) {
  if (!value) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(value).toString('base64')}`;
    }
  } catch {
    // Fall back to local-only plaintext when the OS keyring is unavailable.
  }
  return `plain:${value}`;
}

function revealSecret(value) {
  if (!value) return '';
  const candidate = String(value);
  if (!candidate.startsWith('enc:')) {
    return candidate.startsWith('plain:') ? candidate.slice(6) : candidate;
  }
  try {
    return safeStorage.decryptString(Buffer.from(candidate.slice(4), 'base64'));
  } catch {
    return '';
  }
}

function hasSecretValue(value) {
  return safeText(value) !== '';
}

function coreConfigHasSecrets(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => coreConfigHasSecrets(item));
  return Object.entries(value).some(([key, item]) => (
    SECRET_CORE_KEYS.has(key) && hasSecretValue(revealSecret(item))
  ) || (item && typeof item === 'object' && coreConfigHasSecrets(item)));
}

function nodeHasSecrets(node) {
  return Boolean(node && (
    hasSecretValue(revealSecret(node.username))
    || hasSecretValue(revealSecret(node.password))
    || coreConfigHasSecrets(node.coreConfig)
  ));
}

// Kept for compatibility with older state diagnostics. Subscription URLs are
// intentionally persisted as plaintext by the current import path.
function urlContainsSecret(value) {
  const raw = safeText(value);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return true;
    for (const key of url.searchParams.keys()) {
      if (/(?:token|key|secret|auth|credential|password|passwd|access[_-]?token|api[_-]?key)/i.test(key)) return true;
    }
    return /\/(?:token|key|secret|auth|subscription)[^/]*\/[^/]{8,}/i.test(url.pathname);
  } catch {
    return false;
  }
}

function stripCoreSecrets(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => stripCoreSecrets(item));
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_CORE_KEYS.has(key)) continue;
    result[key] = item && typeof item === 'object' ? stripCoreSecrets(item) : item;
  }
  return result;
}

function secretRetentionCandidates(nodes) {
  const current = store.get();
  const existingById = new Map(current.nodes.map((node) => [node.id, node]));
  const existingKeys = new Set(current.nodes.map((node) => nodeStorageKey(node)));
  return nodes.filter((node) => {
    if (!nodeHasSecrets(node)) return false;
    const existing = existingById.get(node.id);
    if (existing && nodeHasSecrets(existing) && nodeStorageKey(existing) === nodeStorageKey(node)) return false;
    return !existingKeys.has(nodeStorageKey(node));
  });
}

async function requestUiConfirmation(sender, options) {
  if (!sender || sender.isDestroyed()) return false;
  const requestId = `confirmation-${Date.now()}-${++nextUiConfirmationId}`;
  return new Promise((resolve) => {
    let timeout;
    const finish = (confirmed) => {
      clearTimeout(timeout);
      sender.removeListener('destroyed', onDestroyed);
      pendingUiConfirmations.delete(requestId);
      resolve(Boolean(confirmed));
    };
    const onDestroyed = () => finish(false);
    pendingUiConfirmations.set(requestId, { sender, finish });
    sender.once('destroyed', onDestroyed);
    timeout = setTimeout(() => finish(false), 10 * 60 * 1000);
    try {
      sender.send('app:confirmation-request', { requestId, options });
    } catch {
      finish(false);
    }
  });
}

async function confirmSecretRetention(nodes, sender) {
  const candidates = secretRetentionCandidates(nodes);
  if (!candidates.length) return { retain: true, prompted: false, count: 0 };
  const retain = await requestUiConfirmation(sender, {
    eyebrow: '本地数据安全',
    title: '检测到敏感密钥',
    message: `检测到 ${candidates.length} 项配置包含账号、密码或核心密钥。`,
    detail: '是否长期保留？选择保留后，内容会使用系统安全存储加密并保存在本机。',
    confirmLabel: '长期保留',
    cancelLabel: '不保留',
  });
  return {
    retain,
    prompted: true,
    count: candidates.length,
  };
}

function boundedSettingText(value, maxLength, label) {
  const text = safeText(value);
  if (text.length > maxLength) throw new Error(`${label}过长`);
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label}包含无效字符`);
  return text;
}

function normalizeHttpSetting(value, label, fallback = '') {
  const candidate = boundedSettingText(value, MAX_AGENT_SETTING_LENGTH, label) || fallback;
  if (!candidate) return '';
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${label}必须是有效 URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label}只支持 HTTP 或 HTTPS`);
  if (parsed.username || parsed.password) throw new Error(`${label}不得包含账号或密码`);
  return candidate;
}

function normalizeSearchEngineUrl(value, fallback = DEFAULT_SEARCH_ENGINE_URL) {
  const candidate = boundedSettingText(value, MAX_AGENT_SETTING_LENGTH, '搜索引擎 URL') || fallback;
  if (!candidate.includes('%s')) throw new Error('搜索引擎 URL 必须包含 %s 占位符');
  return normalizeHttpSetting(candidate, '搜索引擎 URL', fallback);
}

function normalizeAgentInteger(value, label, { min = 0, fallback = 0 } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min) throw new Error(`${label}必须是大于等于 ${min} 的整数`);
  return number;
}

function normalizeAgentTemperature(value, fallback = DEFAULT_AGENT_SETTINGS.temperature) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 2) throw new Error('Agent 温度必须在 0 到 2 之间');
  return Math.round(number * 100) / 100;
}

function safeAgentTemperature(value) {
  if (value === null) return null;
  try {
    return normalizeAgentTemperature(value);
  } catch {
    return DEFAULT_AGENT_SETTINGS.temperature;
  }
}

function safeAgentReasoningEffort(value) {
  return normalizeReasoningEffort(value, DEFAULT_AGENT_SETTINGS.reasoningEffort);
}

function normalizedAgentProfileIds(value, state = store?.get?.() || {}) {
  const available = new Set((Array.isArray(state.profiles) ? state.profiles : []).map((profile) => safeProfileId(profile?.id)).filter(Boolean));
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => safeProfileId(item))
    .filter((item) => item && available.has(item)))];
}

function agentProfileOverride(state, profileId) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) return null;
  const overrides = state?.settings?.agentProfileOverrides;
  const override = overrides && typeof overrides === 'object' ? overrides[profileKey] : null;
  return override && typeof override === 'object' && !Array.isArray(override) ? override : null;
}

function agentProfileEnabled(state, profileId) {
  const override = agentProfileOverride(state, profileId);
  if (override) return override.enabled !== false;
  const settings = state?.settings || {};
  return settings.agentProfileScope !== 'selected'
    || normalizedAgentProfileIds(settings.agentProfileIds, state).includes(safeProfileId(profileId));
}

function resolvedAgentSettings(state, profileId = '') {
  const source = state?.settings && typeof state.settings === 'object' ? state.settings : {};
  const override = agentProfileOverride(state, profileId);
  return {
    ...source,
    ...(override || {}),
    agentEnabled: agentProfileEnabled(state, profileId),
    agentFromProfile: Boolean(override),
  };
}

function resolvedJevSettings(state, profileId = '') {
  const source = resolvedAgentSettings(state, profileId);
  const provider = normalizeJevProvider(source.jevProvider || DEFAULT_JEV_SETTINGS.provider);
  return {
    provider,
    baseUrl: safeText(source.jevBaseUrl) || (provider === 'typesafe' ? DEFAULT_JEV_SETTINGS.baseUrl : ''),
    model: safeText(source.jevModel) || DEFAULT_JEV_SETTINGS.model,
    token: revealSecret(source.jevKey) || revealSecret(source.jevToken),
  };
}

function publicSettings(state) {
  const source = state?.settings && typeof state.settings === 'object' ? state.settings : {};
  const {
    agentKey: _agentKey,
    agentToken: _agentToken,
    jevKey: _jevKey,
    jevToken: _jevToken,
    agentProfileOverrides: _agentProfileOverrides,
    ...rest
  } = source;
  const storedAgentToken = revealSecret(source.agentKey) || revealSecret(source.agentToken);
  const storedJevToken = revealSecret(source.jevKey) || revealSecret(source.jevToken);
  const jevProvider = normalizeJevProvider(source.jevProvider || DEFAULT_JEV_SETTINGS.provider);
  const baseUrl = safeText(source.agentBaseUrl || source.agentApiUrl);
  const model = safeText(source.agentModel || source.agentApi);
  return {
    ...rest,
    agentApiUrl: safeText(source.agentApiUrl),
    agentProtocolSuffix: safeText(source.agentProtocolSuffix),
    agentApi: safeText(source.agentApi),
    agentProtocol: normalizeAgentProtocol(source.agentProtocol || 'openai-chat-completions'),
    agentBaseUrl: baseUrl,
    agentModel: model,
    agentContextBudgetTokens: Number.isSafeInteger(Number(source.agentContextBudgetTokens))
      ? Number(source.agentContextBudgetTokens) : DEFAULT_AGENT_SETTINGS.contextBudgetTokens,
    agentMaxOutputTokens: Number.isSafeInteger(Number(source.agentMaxOutputTokens))
      ? Number(source.agentMaxOutputTokens) : DEFAULT_AGENT_SETTINGS.maxOutputTokens,
    agentTemperature: safeAgentTemperature(source.agentTemperature),
    agentMaxSteps: Number.isSafeInteger(Number(source.agentMaxSteps)) && Number(source.agentMaxSteps) >= 0
      ? Number(source.agentMaxSteps) : DEFAULT_AGENT_SETTINGS.maxSteps,
    agentReasoningEffort: safeAgentReasoningEffort(source.agentReasoningEffort),
    agentReasoningEfforts: AGENT_REASONING_EFFORTS,
    agentProfileScope: source.agentProfileScope === 'selected' ? 'selected' : 'all',
    agentProfileIds: normalizedAgentProfileIds(source.agentProfileIds, state),
    agentProfileConfigIds: Object.keys(source.agentProfileOverrides || {})
      .map((item) => safeProfileId(item))
      .filter(Boolean),
    jevProvider,
    jevBaseUrl: safeText(source.jevBaseUrl) || (jevProvider === 'typesafe' ? DEFAULT_JEV_SETTINGS.baseUrl : ''),
    jevModel: safeText(source.jevModel) || DEFAULT_JEV_SETTINGS.model,
    jevKeySet: Boolean(storedJevToken),
    searchEngineUrl: safeText(source.searchEngineUrl) || DEFAULT_SEARCH_ENGINE_URL,
    agentKeySet: Boolean(storedAgentToken),
    agentTokenSet: Boolean(storedAgentToken),
  };
}

function publicBrowserSettings(state, profileId = '') {
  const settings = publicSettings(state);
  const resolved = resolvedAgentSettings(state, profileId);
  const resolvedAgentToken = revealSecret(resolved.agentKey) || revealSecret(resolved.agentToken);
  const resolvedJevToken = revealSecret(resolved.jevKey) || revealSecret(resolved.jevToken);
  return {
    agentApiUrl: safeText(resolved.agentApiUrl),
    agentProtocolSuffix: safeText(resolved.agentProtocolSuffix),
    agentApi: safeText(resolved.agentApi),
    agentKeySet: Boolean(resolvedAgentToken),
    agentTokenSet: Boolean(resolvedAgentToken),
    agentProtocol: normalizeAgentProtocol(resolved.agentProtocol || DEFAULT_AGENT_SETTINGS.protocol),
    agentBaseUrl: safeText(resolved.agentBaseUrl || resolved.agentApiUrl),
    agentModel: safeText(resolved.agentModel || resolved.agentApi),
    agentContextBudgetTokens: Number.isSafeInteger(Number(resolved.agentContextBudgetTokens))
      ? Number(resolved.agentContextBudgetTokens) : DEFAULT_AGENT_SETTINGS.contextBudgetTokens,
    agentMaxOutputTokens: Number.isSafeInteger(Number(resolved.agentMaxOutputTokens))
      ? Number(resolved.agentMaxOutputTokens) : DEFAULT_AGENT_SETTINGS.maxOutputTokens,
    agentTemperature: safeAgentTemperature(resolved.agentTemperature),
    agentMaxSteps: Number.isSafeInteger(Number(resolved.agentMaxSteps)) && Number(resolved.agentMaxSteps) >= 0
      ? Number(resolved.agentMaxSteps) : DEFAULT_AGENT_SETTINGS.maxSteps,
    agentReasoningEffort: safeAgentReasoningEffort(resolved.agentReasoningEffort),
    agentReasoningEfforts: AGENT_REASONING_EFFORTS,
    agentEnabled: resolved.agentEnabled,
    agentSource: resolved.agentFromProfile ? 'profile' : settings.agentProfileScope === 'selected' ? 'selected' : 'global',
    agentProfileId: safeProfileId(profileId),
    agentProtocols: AGENT_PROTOCOLS.map(({ id, label }) => ({ id, label })),
    jevProvider: normalizeJevProvider(resolved.jevProvider || DEFAULT_JEV_SETTINGS.provider),
    jevBaseUrl: safeText(resolved.jevBaseUrl) || (normalizeJevProvider(resolved.jevProvider || DEFAULT_JEV_SETTINGS.provider) === 'typesafe' ? DEFAULT_JEV_SETTINGS.baseUrl : ''),
    jevModel: safeText(resolved.jevModel) || DEFAULT_JEV_SETTINGS.model,
    jevKeySet: Boolean(resolvedJevToken),
    jevProviders: JEV_PROVIDERS.map(({ id, label, defaultBaseUrl }) => ({ id, label, defaultBaseUrl })),
    searchEngineUrl: settings.searchEngineUrl,
    searchEngines: normalizeSearchEngines(settings.searchEngines),
    bookmarkBarAlwaysVisible: settings.bookmarkBarAlwaysVisible === true,
    newTabSites: normalizeNewTabSites(settings.newTabSites),
    newTabBanner: normalizeNewTabBanner(settings.newTabBanner),
    newTabDisplayMode: normalizeNewTabDisplayMode(settings.newTabDisplayMode),
    theme: settings.theme,
    browserShortcuts: normalizedBrowserShortcuts(settings.browserShortcuts),
    mouseGesture: normalizedMouseGesture(settings.mouseGesture),
  };
}

async function confirmApiKeyRetention(label, sender) {
  return requestUiConfirmation(sender, {
    eyebrow: '本地数据安全',
    title: `检测到 ${label} 密钥`,
    message: `检测到 ${label} API 密钥，是否长期保留？`,
    detail: '选择保留后，密钥会使用系统安全存储加密并保存在本机。选择不保留则不会写入状态文件。',
    confirmLabel: '长期保留',
    cancelLabel: '不保留',
  });
}

async function confirmAgentKeyRetention(sender) {
  return confirmApiKeyRetention('Agent', sender);
}

async function confirmJevKeyRetention(sender) {
  return confirmApiKeyRetention('JEV', sender);
}

async function prepareBrowserSettings(input, currentSettings, sender) {
  const settings = input && typeof input === 'object' ? input : {};
  const current = currentSettings && typeof currentSettings === 'object' ? currentSettings : {};
  const patch = {};
  if (settings.agentApiUrl !== undefined) {
    patch.agentApiUrl = normalizeHttpSetting(settings.agentApiUrl, 'Agent API URL');
  }
  if (settings.agentProtocolSuffix !== undefined) {
    patch.agentProtocolSuffix = boundedSettingText(settings.agentProtocolSuffix, MAX_AGENT_SUFFIX_LENGTH, '协议后缀');
  }
  if (settings.agentApi !== undefined) {
    patch.agentApi = boundedSettingText(settings.agentApi, MAX_AGENT_API_LENGTH, 'Agent API');
  }
  if (settings.agentProtocol !== undefined) {
    patch.agentProtocol = normalizeAgentProtocol(boundedSettingText(settings.agentProtocol, MAX_AGENT_API_LENGTH, 'Agent 协议'));
  }
  if (settings.agentBaseUrl !== undefined) {
    const baseUrl = normalizeAgentBaseUrl(boundedSettingText(settings.agentBaseUrl, MAX_AGENT_SETTING_LENGTH, 'Agent 接口地址'), settings.agentProtocol || current.agentProtocol);
    patch.agentBaseUrl = baseUrl;
    // Keep legacy settings synchronized for older profile windows and state files.
    patch.agentApiUrl = baseUrl;
  }
  if (settings.agentModel !== undefined) {
    const model = boundedSettingText(settings.agentModel, MAX_AGENT_MODEL_LENGTH, 'Agent 模型');
    patch.agentModel = model;
    patch.agentApi = model;
  }
  if (settings.agentContextBudgetTokens !== undefined) {
    patch.agentContextBudgetTokens = normalizeAgentInteger(settings.agentContextBudgetTokens, '上下文预算', { min: 1, fallback: DEFAULT_AGENT_SETTINGS.contextBudgetTokens });
  }
  if (settings.agentMaxOutputTokens !== undefined) {
    patch.agentMaxOutputTokens = normalizeAgentInteger(settings.agentMaxOutputTokens, '单次回复上限', { min: 1, fallback: DEFAULT_AGENT_SETTINGS.maxOutputTokens });
  }
  if (settings.agentTemperature !== undefined) {
    patch.agentTemperature = normalizeAgentTemperature(settings.agentTemperature);
  }
  if (settings.agentMaxSteps !== undefined) {
    patch.agentMaxSteps = normalizeAgentInteger(settings.agentMaxSteps, '工具步骤数', { min: 0, fallback: DEFAULT_AGENT_SETTINGS.maxSteps });
  }
  if (settings.agentReasoningEffort !== undefined) {
    patch.agentReasoningEffort = normalizeReasoningEffort(settings.agentReasoningEffort, DEFAULT_AGENT_SETTINGS.reasoningEffort);
  }
  if (settings.agentProfileScope !== undefined) {
    patch.agentProfileScope = settings.agentProfileScope === 'selected' ? 'selected' : 'all';
  }
  if (settings.agentProfileIds !== undefined) {
    patch.agentProfileIds = normalizedAgentProfileIds(settings.agentProfileIds, store.get());
  }
  if (settings.jevProvider !== undefined) {
    patch.jevProvider = normalizeJevProvider(boundedSettingText(settings.jevProvider, MAX_AGENT_API_LENGTH, 'JEV 提供方'));
  }
  if (settings.jevBaseUrl !== undefined) {
    const jevProvider = normalizeJevProvider(settings.jevProvider || current.jevProvider || DEFAULT_JEV_SETTINGS.provider);
    patch.jevBaseUrl = normalizeJevBaseUrl(
      boundedSettingText(settings.jevBaseUrl, MAX_AGENT_SETTING_LENGTH, 'JEV 接口地址'),
      jevProvider,
    );
    if (jevProvider === 'custom' && !patch.jevBaseUrl) throw new Error('自定义 JEV 接口地址不能为空');
  }
  if (settings.jevModel !== undefined) {
    patch.jevModel = boundedSettingText(settings.jevModel, MAX_JEV_MODEL_LENGTH, 'JEV 模型') || DEFAULT_JEV_SETTINGS.model;
  }
  if (settings.searchEngineUrl !== undefined) {
    patch.searchEngineUrl = normalizeSearchEngineUrl(settings.searchEngineUrl);
  }
  if (settings.searchEngines !== undefined) {
    patch.searchEngines = normalizeSearchEngines(settings.searchEngines);
  }
  if (settings.bookmarkBarAlwaysVisible !== undefined) {
    patch.bookmarkBarAlwaysVisible = Boolean(settings.bookmarkBarAlwaysVisible);
  }
  if (settings.newTabSites !== undefined) {
    patch.newTabSites = normalizeNewTabSites(settings.newTabSites);
  }
  if (settings.newTabBanner !== undefined) {
    patch.newTabBanner = normalizeNewTabBanner(settings.newTabBanner, normalizeNewTabBanner(current.newTabBanner));
  }
  if (settings.newTabDisplayMode !== undefined) {
    patch.newTabDisplayMode = normalizeNewTabDisplayMode(settings.newTabDisplayMode, normalizeNewTabDisplayMode(current.newTabDisplayMode));
  }
  if (settings.browserShortcuts !== undefined) {
    const source = settings.browserShortcuts && typeof settings.browserShortcuts === 'object' ? settings.browserShortcuts : {};
    const currentShortcuts = normalizedBrowserShortcuts(current.browserShortcuts);
    patch.browserShortcuts = {
      reload: normalizeShortcut(source.reload, currentShortcuts.reload),
      devtools: normalizeShortcut(source.devtools, currentShortcuts.devtools),
    };
  }
  if (settings.mouseGesture !== undefined) {
    const source = settings.mouseGesture && typeof settings.mouseGesture === 'object' ? settings.mouseGesture : {};
    const currentGesture = normalizedMouseGesture(current.mouseGesture);
    patch.mouseGesture = normalizedMouseGesture({
      ...currentGesture,
      ...source,
      sequence: source.sequence === undefined ? currentGesture.sequence : source.sequence,
    });
  }
  if (settings.theme !== undefined) {
    patch.theme = normalizeTheme(settings.theme, normalizeTheme(current.theme));
  }
  let agentKeyStatus = 'unchanged';
  const hasToken = Object.prototype.hasOwnProperty.call(settings, 'agentToken')
    || Object.prototype.hasOwnProperty.call(settings, 'agentKey');
  if (hasToken) {
    const key = boundedSettingText(
      Object.prototype.hasOwnProperty.call(settings, 'agentToken') ? settings.agentToken : settings.agentKey,
      MAX_AGENT_KEY_LENGTH,
      'Agent Token',
    );
    if (key) {
      if (await confirmAgentKeyRetention(sender)) {
        patch.agentKey = protectSecret(key);
        agentKeyStatus = 'retained';
      } else {
        agentKeyStatus = 'not-retained';
      }
    } else if (settings.clearAgentKey === true || settings.clearAgentToken === true) {
      patch.agentKey = '';
      agentKeyStatus = 'cleared';
    } else if (!revealSecret(current.agentKey)) {
      agentKeyStatus = 'empty';
    }
  }
  let jevKeyStatus = 'unchanged';
  const hasJevToken = Object.prototype.hasOwnProperty.call(settings, 'jevToken')
    || Object.prototype.hasOwnProperty.call(settings, 'jevKey');
  if (hasJevToken) {
    const key = boundedSettingText(
      Object.prototype.hasOwnProperty.call(settings, 'jevToken') ? settings.jevToken : settings.jevKey,
      MAX_AGENT_KEY_LENGTH,
      'JEV Token',
    );
    if (key) {
      if (await confirmJevKeyRetention(sender)) {
        patch.jevKey = protectSecret(key);
        jevKeyStatus = 'retained';
      } else {
        jevKeyStatus = 'not-retained';
      }
    } else if (settings.clearJevKey === true || settings.clearJevToken === true) {
      patch.jevKey = '';
      jevKeyStatus = 'cleared';
    } else if (!revealSecret(current.jevKey)) {
      jevKeyStatus = 'empty';
    }
  }
  return { patch, agentKeyStatus, jevKeyStatus };
}

function hydrateNode(node) {
  if (!node) return null;
  return {
    ...node,
    username: revealSecret(node.username),
    password: revealSecret(node.password),
    coreConfig: hydrateCoreConfig(node.coreConfig),
  };
}

function hydrateCoreConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) result[key] = hydrateCoreConfig(item);
    else if (Array.isArray(item)) result[key] = item.map((entry) => entry && typeof entry === 'object' ? hydrateCoreConfig(entry) : entry);
    else result[key] = ['uuid', 'password', 'publicKey', 'shortId', 'spiderX'].includes(key) ? revealSecret(item) : item;
  }
  return result;
}

function protectCoreConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) result[key] = protectCoreConfig(item);
    else if (Array.isArray(item)) result[key] = item.map((entry) => entry && typeof entry === 'object' ? protectCoreConfig(entry) : entry);
    else result[key] = ['uuid', 'password', 'publicKey', 'shortId', 'spiderX'].includes(key) ? protectSecret(safeText(item)) : item;
  }
  return result;
}

function publicNode(node) {
  const hydrated = hydrateNode(node);
  const { username, password, coreConfig, userEdits: _userEdits, ...rest } = hydrated;
  const requiredCore = coreConfig?.type === 'anytls' || node.protocol === 'anytls' ? 'singbox' : undefined;
  return {
    ...rest,
    // The node editor is explicitly allowed to show proxy credentials so a
    // subscription-authenticated SOCKS5 node can be reviewed and corrected.
    username: username || '',
    password: password || '',
    core: requiredCore || node.core || (coreConfig ? 'xray' : undefined),
    coreType: safeText(coreConfig?.type),
    requiresCore: Boolean(node.requiresCore || coreConfig),
    hasCredentials: Boolean(username || password || coreConfig?.uuid || coreConfig?.password
      || coreConfig?.publicKey || coreConfig?.shortId || coreConfig?.spiderX),
  };
}

function isUnsupportedNode(node) {
  return Boolean(node?.unsupported === true || node?.supported === false || safeText(node?.status).toLowerCase() === 'unsupported');
}

function projectRoot() {
  if (app.isPackaged && process.resourcesPath) return process.resourcesPath;
  return path.resolve(__dirname, '..', '..');
}

function corePathFor(kind, state) {
  const core = normalizeCore(kind);
  const settingKey = core === 'singbox' ? 'singboxPath' : 'xrayPath';
  return resolveCorePath(core, state.settings?.[settingKey], { rootDir: projectRoot() });
}

function publicCoreInfo(kind, state) {
  const info = corePathFor(kind, state);
  const versionKey = normalizeCore(kind) === 'singbox' ? 'singboxVersion' : 'xrayVersion';
  const version = info.bundled ? info.version : safeText(state.settings?.[versionKey]);
  const sha256 = info.bundled ? info.sha256 : safeText(state.settings?.[`${info.kind}Sha256`]);
  return {
    id: info.kind,
    label: info.label,
    configured: Boolean(info.path),
    bundled: Boolean(info.bundled),
    path: info.path,
    version,
    sha256,
  };
}

function publicState() {
  const state = store.get();
  const passwordProfileIds = new Set(state.profiles.map((profile) => profile?.id).filter(Boolean));
  const xray = publicCoreInfo('xray', state);
  const singbox = publicCoreInfo('singbox', state);
  const publicNodes = state.nodes
    .filter((node) => node && typeof node === 'object')
    .filter((node) => !(node.sourceId && isSubscriptionInfoNode(node)));
  const supportedPublicNodes = publicNodes.filter((node) => !isUnsupportedNode(node));
  const supportedPublicNodeSet = new Set(supportedPublicNodes);
  return {
    version: state.version,
    appVersion: APP_VERSION,
    brandName: BRAND_NAME,
    brandDescription: BRAND_DESCRIPTION,
    settings: publicSettings(state),
    nodes: publicNodes
      // Keep unsupported subscription records available to their source group
      // so users can inspect every node returned by the subscription.
      .filter((node) => supportedPublicNodeSet.has(node) || Boolean(node.sourceId))
      .map(publicNode),
    subscriptions: orderedSubscriptions(state.subscriptions)
      .filter((item) => item && typeof item === 'object')
      .map((item) => publicSubscription(item, state)),
    extensions: state.extensions.filter((item) => item && typeof item === 'object').map((item) => publicExtension(item, state)),
    passwordEntries: state.passwordEntries
      .filter((entry) => passwordProfileIds.has(entry?.profileId))
      .map(publicPasswordEntry),
    connection: {
      direct: directConnectionHealth ? { ...directConnectionHealth } : null,
    },
    core: {
      running: coreProcesses.size,
      defaultCore: normalizeCore(state.settings.defaultCore),
      configured: xray.configured,
      version: xray.version,
      xray,
      singbox,
    },
    coreUpdates: coreUpdateState.map((update) => ({ ...update })),
    engine: {
      mode: safeText(state.settings.enginePath) ? 'external' : 'electron',
      configured: Boolean(safeText(state.settings.enginePath)),
      path: safeText(state.settings.enginePath),
      version: safeText(state.settings.engineVersion) || (safeText(state.settings.enginePath) ? '' : safeText(process.versions.chrome)),
      updatedAt: safeText(state.settings.engineInstalledAt),
    },
    engineUpdate: browserUpdateState ? { ...browserUpdateState } : null,
    profiles: state.profiles.filter((profile) => profile && typeof profile === 'object').map((profile) => {
      const {
        newTabSiteVisits: _newTabSiteVisits,
        searchHistory: _searchHistory,
        ...publicProfile
      } = profile;
      return {
        ...publicProfile,
        testIdentityId: normalizeTestIdentityId(profile.testIdentityId),
        testIdentityOrigins: normalizeTestIdentityOrigins(profile.testIdentityOrigins),
        traffic: profileTraffic(profile.id, profile),
        status: isProfileRunning(profile.id) ? 'running' : 'stopped',
        runtimeMode: profileRuntimeModes.get(profile.id) || null,
      };
    }),
  };
}

function publicSubscription(item, state = store.get()) {
  const sourceId = safeText(item?.id);
  const sourceNodes = state.nodes.filter((node) => (
    node && node.sourceId === sourceId && !isSubscriptionInfoNode(node)
  ));
  const nodeCount = sourceNodes.length;
  const unsupportedNodeCount = sourceNodes.filter(isUnsupportedNode).length;
  return {
    id: sourceId,
    name: safeText(item?.name, '订阅'),
    sortOrder: parseSubscriptionSortOrder(item?.sortOrder, { allowMissing: true }) ?? 0,
    source: sanitizeSource(item?.source),
    nodeCount,
    availableNodeCount: nodeCount - unsupportedNodeCount,
    unsupportedNodeCount,
    lastUpdatedAt: safeText(item?.lastUpdatedAt),
    status: safeText(item?.status, 'unknown'),
    error: safeText(item?.error),
    metadata: sanitizeSubscriptionMetadata(item?.metadata),
  };
}

function extensionDataRoot() {
  return path.join(app.getPath('userData'), EXTENSION_DATA_DIR);
}

function normalizeExtensionId(value) {
  const candidate = safeText(value);
  return /^[A-Za-z0-9_-]{1,120}$/.test(candidate) ? candidate : '';
}

function normalizeExtensionProfileIds(value, state = store.get()) {
  const available = new Set((Array.isArray(state?.profiles) ? state.profiles : []).map((profile) => profile?.id));
  return normalizeProfileIds(value)
    .map((item) => safeProfileId(item))
    .filter((item) => item && available.has(item));
}

function extensionProfileIds(record) {
  const source = Array.isArray(record?.profileIds) ? record.profileIds : record?.activeProfileIds;
  return normalizeProfileIds(source).map((item) => safeProfileId(item)).filter(Boolean);
}

function extensionPinnedProfileIds(record, state = store.get()) {
  const existingProfiles = new Set((state.profiles || []).map((profile) => safeProfileId(profile.id)).filter(Boolean));
  return normalizeProfileIds(record?.pinnedProfileIds)
    .map((item) => safeProfileId(item))
    .filter((profileId) => profileId && existingProfiles.has(profileId));
}

function extensionRuntimeError(profileId, extensionId) {
  return profileExtensionErrors.get(profileId)?.get(extensionId) || '';
}

function setExtensionRuntimeError(profileId, extensionId, error) {
  let errors = profileExtensionErrors.get(profileId);
  if (!errors) {
    errors = new Map();
    profileExtensionErrors.set(profileId, errors);
  }
  errors.set(extensionId, safeText(error, '插件加载失败'));
}

function clearExtensionRuntimeError(profileId, extensionId) {
  const errors = profileExtensionErrors.get(profileId);
  if (!errors) return;
  errors.delete(extensionId);
  if (!errors.size) profileExtensionErrors.delete(profileId);
}

function publicExtension(record, state = store.get()) {
  const profileIds = normalizeExtensionProfileIds(extensionProfileIds(record), state);
  const panels = resolveExtensionPanels(record);
  const updateUrl = extensionUpdateUrl(record);
  const updateStatus = updateUrl ? safeText(record.updateStatus, 'unknown') : 'unavailable';
  const runtime = {};
  for (const profileId of profileIds) {
    const error = extensionRuntimeError(profileId, record.id);
    runtime[profileId] = error
      ? { status: 'error', error }
      : { status: isProfileRunning(profileId) ? 'active' : 'assigned' };
  }
  return {
    id: normalizeExtensionId(record.id),
    name: safeText(record.name, '未命名插件'),
    version: safeText(record.version, '未知版本'),
    description: safeText(record.description),
    iconDataUrl: extensionIconDataUrl(record.path),
    manifestVersion: Number(record.manifestVersion) || 0,
    permissions: Array.isArray(record.permissions) ? record.permissions : [],
    optionalPermissions: Array.isArray(record.optionalPermissions) ? record.optionalPermissions : [],
    hostPermissions: Array.isArray(record.hostPermissions) ? record.hostPermissions : [],
    panels,
    hasPanel: Boolean(panels.popup || panels.sidePanel || panels.options),
    updateUrl,
    updateStatus,
    updateVersion: safeText(record.updateVersion),
    updateCodebase: safeText(record.updateCodebase),
    lastUpdateCheckedAt: safeText(record.lastUpdateCheckedAt),
    updateError: safeText(record.updateError),
    path: safeText(record.path),
    sourcePath: safeText(record.sourcePath),
    sourceUrl: safeText(record.sourceUrl),
    sourceType: safeText(record.sourceType),
    managed: Boolean(record.managed),
    loadMode: record.loadMode === 'direct' || record.managed === false ? 'direct' : 'managed',
    profileIds,
    activeProfileIds: profileIds,
    pinnedProfileIds: extensionPinnedProfileIds(record, state),
    runtime,
    installedAt: safeText(record.installedAt),
    updatedAt: safeText(record.updatedAt),
  };
}

function extensionUpdateUrl(record) {
  const declared = normalizeUpdateUrl(record?.updateUrl);
  if (declared) return declared;
  // Only a manifest public key may opt a package into Google's default endpoint.
  return ['manifest-key', 'chrome-web-store'].includes(record?.extensionIdSource)
    ? chromeWebStoreUpdateUrl(record?.extensionId)
    : '';
}

function deferManagedExtensionCleanup(record, profileIds = []) {
  const managedRoot = safeText(record?.managedRoot);
  if (!managedRoot) return;
  const runningExternalProfiles = [...new Set(profileIds.map((profileId) => safeProfileId(profileId)).filter(Boolean))]
    .filter((profileId) => externalProcesses.has(profileId));
  if (!runningExternalProfiles.length) {
    const stillReferenced = store?.get().extensions.some((item) => item.managedRoot === managedRoot);
    if (!stillReferenced) removeManagedExtension(record, extensionDataRoot());
    return;
  }
  const waitingProfiles = retiredExtensionRoots.get(managedRoot) || new Set();
  for (const profileId of runningExternalProfiles) waitingProfiles.add(profileId);
  retiredExtensionRoots.set(managedRoot, waitingProfiles);
}

function releaseRetiredExtensionRoots(profileId) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) return;
  for (const [managedRoot, waitingProfiles] of retiredExtensionRoots.entries()) {
    waitingProfiles.delete(profileKey);
    if (waitingProfiles.size) continue;
    retiredExtensionRoots.delete(managedRoot);
    const stillReferenced = store?.get().extensions.some((item) => item.managedRoot === managedRoot);
    if (!stillReferenced) removeManagedExtension({ managedRoot }, extensionDataRoot());
  }
}

function publicBrowserExtensions(profileId) {
  const state = store.get();
  const profileKey = safeProfileId(profileId);
  return state.extensions
    .filter((record) => record && typeof record === 'object')
    .map((record) => {
      const enabled = extensionProfileIds(record).includes(profileKey);
      const error = extensionRuntimeError(profileKey, record.id);
      const panels = resolveExtensionPanels(record);
      const permissionDetails = extensionPermissionDetails(record);
      return {
        id: normalizeExtensionId(record.id),
        name: safeText(record.name, '未命名插件'),
        version: safeText(record.version, '未知版本'),
        ...permissionDetails,
        iconDataUrl: extensionIconDataUrl(record.path, true),
        panels,
        hasPanel: Boolean(panels.popup || panels.sidePanel || panels.options),
        enabled,
        pinned: extensionPinnedProfileIds(record, state).includes(profileKey),
        status: error ? 'error' : enabled ? 'active' : 'inactive',
        error,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

function extensionPermissionDetails(record) {
  let inspected = null;
  if ((!Array.isArray(record.permissions) || !Array.isArray(record.optionalPermissions) || !Array.isArray(record.hostPermissions)) && record.path) {
    try {
      inspected = inspectExtensionSource(record.path);
    } catch {
      inspected = null;
    }
  }
  return {
    description: safeText(record.description) || safeText(inspected?.description),
    manifestVersion: Number(record.manifestVersion) || Number(inspected?.manifestVersion) || 0,
    permissions: Array.isArray(record.permissions) ? record.permissions : inspected?.permissions || [],
    optionalPermissions: Array.isArray(record.optionalPermissions) ? record.optionalPermissions : inspected?.optionalPermissions || [],
    hostPermissions: Array.isArray(record.hostPermissions) ? record.hostPermissions : inspected?.hostPermissions || [],
  };
}

function sendBrowserExtensions(profileId) {
  const win = profileWindows.get(profileId);
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('browser-shell:extensions-updated', publicBrowserExtensions(profileId));
  } catch {
    // The shell may be closing; state sync on the next launch is sufficient.
  }
}

function broadcastBrowserExtensions() {
  for (const profileId of profileWindows.keys()) sendBrowserExtensions(profileId);
}

function profileIdForSender(sender) {
  for (const [profileId, win] of profileWindows.entries()) {
    if (win && !win.isDestroyed() && win.webContents.id === sender?.id) return profileId;
  }
  return '';
}

function scriptJson(value) {
  const encoded = JSON.stringify(value === undefined ? null : value);
  if (encoded === undefined || encoded.length > 512000) throw new Error('网页助手动作数据过大');
  return encoded.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

async function invokeBrowserAgent(webContents, method, payload) {
  const methods = new Set([
    'capabilities', 'observe', 'execute', 'executeBatch', 'tabs', 'openTab', 'switchTab',
    'closeTab', 'navigate', 'tabControl', 'chooseFiles', 'chooseDirectory', 'listFiles', 'readFile', 'uploadFiles',
  ]);
  if (!methods.has(method)) throw new Error('网页助手接口无效');
  if (!webContents || webContents.isDestroyed()) throw new Error('浏览器环境已关闭');
  const hostWindow = BrowserWindow.fromWebContents(webContents);
  if (hostWindow && !hostWindow.isDestroyed() && !hostWindow.isFocused()) hostWindow.focus();
  const methodJson = scriptJson(method);
  const payloadJson = scriptJson(payload);
  const script = `(() => {
    const api = window.browserAgent;
    if (!api || typeof api[${methodJson}] !== 'function') throw new Error('网页助手尚未就绪');
    return api[${methodJson}](${payloadJson});
  })()`;
  return webContents.executeJavaScript(script, true);
}

function storedAgentConnection(profileId = '') {
  const state = store?.get?.() || {};
  const settings = resolvedAgentSettings(state, profileId);
  const protocol = normalizeAgentProtocol(settings.agentProtocol || 'openai-chat-completions');
  const baseUrl = safeText(settings.agentBaseUrl || settings.agentApiUrl);
  const model = safeText(settings.agentModel || settings.agentApi);
  const token = revealSecret(settings.agentKey) || revealSecret(settings.agentToken);
  return {
    protocol,
    baseUrl,
    model,
    token,
    enabled: settings.agentEnabled !== false,
    contextBudgetTokens: Number.isSafeInteger(Number(settings.agentContextBudgetTokens))
      ? Number(settings.agentContextBudgetTokens) : DEFAULT_AGENT_SETTINGS.contextBudgetTokens,
    maxOutputTokens: Number.isSafeInteger(Number(settings.agentMaxOutputTokens))
      ? Number(settings.agentMaxOutputTokens) : DEFAULT_AGENT_SETTINGS.maxOutputTokens,
    temperature: safeAgentTemperature(settings.agentTemperature),
    maxSteps: Number.isSafeInteger(Number(settings.agentMaxSteps)) && Number(settings.agentMaxSteps) >= 0
      ? Number(settings.agentMaxSteps) : DEFAULT_AGENT_SETTINGS.maxSteps,
    reasoningEffort: safeAgentReasoningEffort(settings.agentReasoningEffort),
  };
}

function storedJevConnection(profileId = '') {
  return resolvedJevSettings(store?.get?.() || {}, profileId);
}

async function readAgentResponseBody(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_AGENT_REQUEST_BYTES) throw new Error('Agent 响应超过 8MB 限制');
  return text;
}

function parseAgentModels(protocol, payload) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const entries = Array.isArray(root)
    ? root
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(root.models)
        ? root.models
        : [];
  const seen = new Set();
  const models = [];
  for (const entry of entries) {
    const source = entry && typeof entry === 'object' ? entry : { id: entry };
    let id = safeText(source.id || source.name || source.model);
    if (normalizeAgentProtocol(protocol) === 'google-gemini') id = id.replace(/^models\//i, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, label: safeText(source.displayName || source.name || id) });
    if (models.length >= 500) break;
  }
  return models;
}

async function requestAgentModels(profileId, input, { testOnly = false } = {}) {
  const state = store?.get?.() || {};
  const resolved = resolvedAgentSettings(state, profileId);
  const payload = input && typeof input === 'object' ? input : {};
  const protocol = normalizeAgentProtocol(payload.protocol || resolved.agentProtocol || DEFAULT_AGENT_SETTINGS.protocol);
  const baseUrl = normalizeAgentBaseUrl(
    boundedSettingText(payload.baseUrl !== undefined ? payload.baseUrl : (resolved.agentBaseUrl || resolved.agentApiUrl), MAX_AGENT_SETTING_LENGTH, 'Agent 接口地址'),
    protocol,
  );
  if (!baseUrl) throw new Error('请先填写 Agent 接口地址');
  const suppliedToken = boundedSettingText(payload.token, MAX_AGENT_KEY_LENGTH, 'Agent Token');
  const token = suppliedToken || revealSecret(resolved.agentKey) || revealSecret(resolved.agentToken);
  if (!token) throw new Error('请先保存 Agent Token');
  const url = agentModelsEndpointFor(protocol, baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: agentAuthHeaders(protocol, token),
      signal: controller.signal,
    });
    const responseText = await readAgentResponseBody(response);
    let parsed = {};
    try {
      parsed = responseText ? JSON.parse(responseText) : {};
    } catch {
      parsed = { message: responseText.slice(0, 2000) };
    }
    if (!response.ok) {
      const detail = extractAgentErrorMessage(parsed) || response.statusText || '未知错误';
      throw new Error(`Agent 模型接口返回 ${response.status}：${detail}`);
    }
    const models = parseAgentModels(protocol, parsed);
    return testOnly
      ? { ok: true, protocol, modelCount: models.length, modelsAvailable: models.length > 0 }
      : { ok: true, protocol, models };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Agent 模型接口请求超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isUnsupportedReasoningEffortError(error) {
  const text = String(error?.message || error || '');
  return /(reasoning(?:[_. -]?effort)?|reasoning\.effort)/i.test(text)
    && /(unsupported|not support|invalid|unknown|unrecognized|must be one|valid values|not available|不支持|无效)/i.test(text);
}

async function requestAgentModel(profileId, input) {
  const connection = storedAgentConnection(profileId);
  if (!connection.enabled) throw new Error('当前环境未启用 Agent，请在插件管理中激活网页助手');
  if (!connection.baseUrl) throw new Error('请先在 Agent 设置中填写接口地址');
  if (!connection.model) throw new Error('请先在 Agent 设置中填写模型');
  if (!connection.token) throw new Error('请先在 Agent 设置中保存 Token');
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  if (!messages.length) throw new Error('Agent 对话内容不能为空');
  if (messages.length > MAX_AGENT_MESSAGE_COUNT) throw new Error(`Agent 对话最多保留 ${MAX_AGENT_MESSAGE_COUNT} 条消息`);
  const trimmed = trimAgentMessages(messages, connection.contextBudgetTokens);
  const efforts = connection.protocol.startsWith('openai-')
    ? reasoningEffortFallbacks(connection.reasoningEffort)
    : [connection.reasoningEffort];
  let lastReasoningError = null;
  for (const reasoningEffort of efforts) {
    const request = buildAgentRequest({
      ...connection,
      reasoningEffort,
      messages: trimmed,
      tools: input?.finalize === true ? [] : AGENT_TOOL_DEFINITIONS,
    });
    const body = JSON.stringify(request.body);
    if (Buffer.byteLength(body, 'utf8') > MAX_AGENT_REQUEST_BYTES) throw new Error('Agent 请求超过 8MB 限制，请降低上下文预算');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AGENT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body,
        signal: controller.signal,
      });
      const responseText = await readAgentResponseBody(response);
      let payload;
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { message: responseText.slice(0, 2000) };
      }
      if (!response.ok) {
        const detail = extractAgentErrorMessage(payload) || response.statusText || '未知错误';
        const error = new Error(`Agent 接口返回 ${response.status}：${detail}`);
        if (efforts.length > 1 && isUnsupportedReasoningEffortError(error)) {
          lastReasoningError = error;
          continue;
        }
        throw error;
      }
      return {
        ok: true,
        protocol: request.protocol,
        model: connection.model,
        reasoningEffort: request.reasoningEffort,
        ...parseAgentResponse(request.protocol, payload),
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Agent 请求超时');
      if (efforts.length > 1 && isUnsupportedReasoningEffortError(error)) {
        lastReasoningError = error;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastReasoningError || new Error('Agent 思考等级不受当前模型支持');
}

function streamEventPayload(eventName, data) {
  const source = String(data || '').trim();
  if (!source || source === '[DONE]') return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

async function consumeAgentStream(response, protocol, onEvent) {
  const kind = normalizeAgentProtocol(protocol);
  const state = {
    text: '',
    toolCalls: [],
    responseItems: [],
    finishReason: '',
    usage: null,
  };
  const toolByKey = new Map();
  let responsePayload = null;

  const emitText = (value) => {
    const text = String(value || '');
    if (!text) return;
    state.text += text;
    onEvent?.({ type: 'delta', text });
  };
  const ensureTool = (key, seed = {}) => {
    const normalizedKey = String(key || `tool-${state.toolCalls.length}`);
    let tool = toolByKey.get(normalizedKey);
    if (!tool) {
      tool = { id: String(seed.id || normalizedKey), name: String(seed.name || ''), arguments: '' };
      toolByKey.set(normalizedKey, tool);
      state.toolCalls.push(tool);
    } else {
      if (seed.id) tool.id = String(seed.id);
      if (seed.name) tool.name = String(seed.name);
    }
    return tool;
  };
  const processEvent = (eventName, data) => {
    const payload = streamEventPayload(eventName, data);
    if (!payload) return;
    if (kind === 'openai-chat-completions') {
      const choice = payload.choices?.[0] || {};
      const delta = choice.delta || {};
      emitText(delta.content);
      for (const [index, call] of (Array.isArray(delta.tool_calls) ? delta.tool_calls : []).entries()) {
        const tool = ensureTool(call.index ?? index, { id: call.id, name: call.function?.name });
        if (call.function?.arguments) tool.arguments += String(call.function.arguments);
      }
      if (choice.finish_reason) state.finishReason = String(choice.finish_reason);
      if (payload.usage) state.usage = payload.usage;
      return;
    }
    if (kind === 'openai-responses') {
      const type = String(eventName || payload.type || '');
      if (type === 'response.output_text.delta') emitText(payload.delta);
      if (type === 'response.function_call_arguments.delta') {
        const tool = ensureTool(payload.item_id || payload.output_index, {});
        tool.arguments += String(payload.delta || '');
      }
      if (type === 'response.output_item.added' && payload.item?.type === 'function_call') {
        ensureTool(payload.item.call_id || payload.item.id || payload.output_index, payload.item);
      }
      if (type === 'response.completed' || payload.response?.output) responsePayload = payload.response || payload;
      if (payload.response?.usage || payload.usage) state.usage = payload.response?.usage || payload.usage;
      return;
    }
    if (kind === 'anthropic-messages') {
      const type = String(eventName || payload.type || '');
      if (type === 'content_block_start' && payload.content_block?.type === 'tool_use') {
        ensureTool(payload.index, payload.content_block);
      }
      if (type === 'content_block_delta') {
        const delta = payload.delta || {};
        if (delta.type === 'text_delta') emitText(delta.text);
        if (delta.type === 'input_json_delta') {
          const tool = ensureTool(payload.index, {});
          tool.arguments += String(delta.partial_json || '');
        }
      }
      if (type === 'message_delta') {
        state.finishReason = String(payload.delta?.stop_reason || state.finishReason);
        state.usage = payload.usage || state.usage;
      }
      return;
    }
    const candidates = payload.candidates || [];
    for (const candidate of candidates) {
      for (const [index, part] of (candidate.content?.parts || []).entries()) {
        emitText(part?.text);
        if (part?.functionCall) {
          const tool = ensureTool(part.functionCall.id || index, part.functionCall);
          if (part.functionCall.args) tool.arguments = JSON.stringify(part.functionCall.args);
        }
      }
      if (candidate.finishReason) state.finishReason = String(candidate.finishReason);
    }
    if (payload.usageMetadata) state.usage = payload.usageMetadata;
  };

  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (!response.body || typeof response.body.getReader !== 'function' || !contentType.includes('text/event-stream')) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_AGENT_REQUEST_BYTES) throw new Error('Agent 响应超过 8MB 限制');
    const parsed = parseAgentResponse(kind, text || '{}');
    if (parsed.text) emitText(parsed.text);
    return parsed;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let eventData = [];
  let receivedBytes = 0;
  const flushEvent = () => {
    if (eventData.length) processEvent(eventName, eventData.join('\n'));
    eventName = '';
    eventData = [];
  };
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    receivedBytes += chunk.value?.byteLength || 0;
    if (receivedBytes > MAX_AGENT_REQUEST_BYTES) throw new Error('Agent 响应超过 8MB 限制');
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) {
        flushEvent();
      } else if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        eventData.push(line.slice(5).trimStart());
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    if (buffer.startsWith('data:')) eventData.push(buffer.slice(5).trimStart());
    else eventData.push(buffer);
  }
  flushEvent();

  if (kind === 'openai-responses' && responsePayload) {
    const parsed = parseAgentResponse(kind, responsePayload);
    if (parsed.text && parsed.text.length > state.text.length) state.text = parsed.text;
    if (parsed.toolCalls?.length) state.toolCalls = parsed.toolCalls;
    state.responseItems = parsed.responseItems || [];
    state.finishReason = parsed.finishReason || state.finishReason;
    state.usage = parsed.usage || state.usage;
  }
  state.toolCalls = state.toolCalls.map((call, index) => ({
    id: String(call.id || `agent-call-${index + 1}`),
    name: String(call.name || ''),
    arguments: call.arguments && typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}),
  })).filter((call) => call.name);
  return state;
}

async function requestAgentModelStream(profileId, input, onEvent) {
  const connection = storedAgentConnection(profileId);
  if (!connection.enabled) throw new Error('当前环境未启用 Agent，请在插件管理中激活网页助手');
  if (!connection.baseUrl) throw new Error('请先在 Agent 设置中填写接口地址');
  if (!connection.model) throw new Error('请先在 Agent 设置中填写模型');
  if (!connection.token) throw new Error('请先在 Agent 设置中保存 Token');
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  if (!messages.length) throw new Error('Agent 对话内容不能为空');
  if (messages.length > MAX_AGENT_MESSAGE_COUNT) throw new Error(`Agent 对话最多保留 ${MAX_AGENT_MESSAGE_COUNT} 条消息`);
  const trimmed = trimAgentMessages(messages, connection.contextBudgetTokens);
  const efforts = connection.protocol.startsWith('openai-')
    ? reasoningEffortFallbacks(connection.reasoningEffort)
    : [connection.reasoningEffort];
  let lastReasoningError = null;
  for (const reasoningEffort of efforts) {
    const request = buildAgentRequest({
      ...connection,
      reasoningEffort,
      messages: trimmed,
      tools: input?.finalize === true ? [] : AGENT_TOOL_DEFINITIONS,
      stream: true,
    });
    const body = JSON.stringify(request.body);
    if (Buffer.byteLength(body, 'utf8') > MAX_AGENT_REQUEST_BYTES) throw new Error('Agent 请求超过 8MB 限制，请降低上下文预算');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AGENT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(request.url, { method: 'POST', headers: request.headers, body, signal: controller.signal });
      if (!response.ok) {
        const responseText = await readAgentResponseBody(response);
        let payload = {};
        try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = { message: responseText.slice(0, 2000) }; }
        const detail = extractAgentErrorMessage(payload) || response.statusText || '未知错误';
        const error = new Error(`Agent 接口返回 ${response.status}：${detail}`);
        if (efforts.length > 1 && isUnsupportedReasoningEffortError(error)) {
          lastReasoningError = error;
          continue;
        }
        throw error;
      }
      const parsed = await consumeAgentStream(response, request.protocol, onEvent);
      return { ok: true, protocol: request.protocol, model: connection.model, reasoningEffort: request.reasoningEffort, ...parsed };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Agent 请求超时');
      if (efforts.length > 1 && isUnsupportedReasoningEffortError(error)) {
        lastReasoningError = error;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastReasoningError || new Error('Agent 思考等级不受当前模型支持');
}

async function requestJevDecision(profileId, input) {
  const connection = storedJevConnection(profileId);
  if (!connection.token) throw new Error('请先在 Agent 配置中保存 JEV Key');
  const request = buildJevRequest({
    ...connection,
    state: input?.state,
    questions: input?.questions,
  });
  const body = JSON.stringify(request.body);
  if (Buffer.byteLength(body, 'utf8') > MAX_AGENT_REQUEST_BYTES) throw new Error('JEV 请求超过 8MB 限制');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body,
      signal: controller.signal,
    });
    const responseText = await readAgentResponseBody(response);
    let payload;
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = { message: responseText.slice(0, 2000) };
    }
    if (!response.ok) {
      const detail = extractJevErrorMessage(payload) || response.statusText || '未知错误';
      throw new Error(`JEV 接口返回 ${response.status}：${detail}`);
    }
    return { ok: true, provider: request.provider, ...parseJevResponse(payload) };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('JEV 请求超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sessionExtensionApi(profileSession) {
  return profileSession?.extensions || profileSession;
}

function loadedSessionExtensions(profileSession) {
  const api = sessionExtensionApi(profileSession);
  if (!api || typeof api.getAllExtensions !== 'function') return [];
  try {
    return api.getAllExtensions();
  } catch {
    return [];
  }
}

function removeSessionExtension(profileSession, extensionId) {
  const api = sessionExtensionApi(profileSession);
  if (!api || typeof api.removeExtension !== 'function' || !extensionId) return;
  api.removeExtension(extensionId);
}

function extensionPathMatches(loaded, record) {
  if (!loaded || !record) return false;
  try {
    if (path.resolve(String(loaded.path || '')) === path.resolve(String(record.path || ''))) return true;
  } catch {
    // Fall through to the persisted extension id.
  }
  return Boolean(record.extensionId && loaded.id === record.extensionId);
}

async function loadSessionExtension(profileId, profileSession, record) {
  const loaded = loadedSessionExtensions(profileSession).find((item) => extensionPathMatches(item, record));
  if (loaded) {
    clearExtensionRuntimeError(profileId, record.id);
    return loaded;
  }
  if (!record.path || !fs.existsSync(record.path)) throw new Error('插件文件路径不存在');
  const api = sessionExtensionApi(profileSession);
  if (!api || typeof api.loadExtension !== 'function') throw new Error('当前 Chromium 不支持加载插件');
  const extension = await api.loadExtension(record.path, { allowFileAccess: false });
  clearExtensionRuntimeError(profileId, record.id);
  return extension;
}

async function unloadSessionExtension(profileId, profileSession, record) {
  const loaded = loadedSessionExtensions(profileSession).filter((item) => extensionPathMatches(item, record));
  for (const extension of loaded) removeSessionExtension(profileSession, extension.id);
  clearExtensionRuntimeError(profileId, record.id);
}

async function syncProfileExtensions(profileId, profileSession) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey || !profileSession) return { warnings: [] };
  const state = store.get();
  const records = state.extensions.filter((record) => record && typeof record === 'object');
  const desired = records.filter((record) => extensionProfileIds(record).includes(profileKey));
  const loaded = loadedSessionExtensions(profileSession);
  const known = records.filter((record) => loaded.some((item) => extensionPathMatches(item, record)));
  for (const record of known) {
    if (!desired.includes(record)) await unloadSessionExtension(profileKey, profileSession, record);
  }
  const warnings = [];
  for (const record of desired) {
    try {
      const extension = await loadSessionExtension(profileKey, profileSession, record);
      if (extension?.id && record.extensionId !== extension.id) {
        store.update((next) => {
          const current = next.extensions.find((item) => item.id === record.id);
          if (current) current.extensionId = extension.id;
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExtensionRuntimeError(profileKey, record.id, message);
      warnings.push(`${record.name || '插件'}：${message}`);
    }
  }
  sendBrowserExtensions(profileKey);
  return { warnings };
}

function extensionPanelPath(record) {
  const panels = resolveExtensionPanels(record);
  return safeText(panels.popup) || safeText(panels.sidePanel) || safeText(panels.options);
}

function extensionPanelUrl(extensionId, pagePath) {
  const idValue = safeText(extensionId).toLowerCase();
  const relative = safeText(pagePath).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!/^[a-p]{32}$/.test(idValue) || !relative || relative.includes('..') || relative.includes('\0')) return '';
  return `chrome-extension://${idValue}/${encodeURI(relative)}`;
}

function closeExtensionPanel(profileId, extensionId) {
  const key = `${safeProfileId(profileId)}:${normalizeExtensionId(extensionId)}`;
  const panel = extensionPanelWindows.get(key);
  if (!panel) return;
  extensionPanelWindows.delete(key);
  if (!panel.isDestroyed()) panel.close();
}

async function openExtensionPanel(profileId, extensionId) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  const extensionKey = normalizeExtensionId(extensionId);
  const state = store.get();
  const record = state.extensions.find((item) => item.id === extensionKey);
  if (!record) throw new Error('插件不存在');
  if (!extensionProfileIds(record).includes(profileKey)) throw new Error('插件尚未在当前环境启用');
  const profileSession = runningElectronProfile(profileKey);
  if (!profileSession) throw new Error('当前环境不是内置 Chromium，或尚未运行');
  const loaded = loadedSessionExtensions(profileSession).find((item) => extensionPathMatches(item, record))
    || await loadSessionExtension(profileKey, profileSession, record);
  if (loaded?.id && record.extensionId !== loaded.id) {
    store.update((next) => {
      const current = next.extensions.find((item) => item.id === record.id);
      if (current) current.extensionId = loaded.id;
    });
  }
  const chromeId = safeText(loaded?.id || record.extensionId);
  const pagePath = extensionPanelPath(record);
  const targetUrl = extensionPanelUrl(chromeId, pagePath);
  if (!targetUrl) throw new Error('插件没有可打开的面板入口');
  const key = `${profileKey}:${extensionKey}`;
  const existing = extensionPanelWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { ok: true, extensionId: extensionKey, url: targetUrl, reused: true };
  }
  const parent = profileWindows.get(profileKey);
  const panel = new BrowserWindow({
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    width: 380,
    height: 560,
    minWidth: 320,
    minHeight: 360,
    show: false,
    title: safeText(record.name, '插件面板'),
    autoHideMenuBar: true,
    webPreferences: {
      session: profileSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  extensionPanelWindows.set(key, panel);
  panel.once('ready-to-show', () => {
    if (!panel.isDestroyed()) panel.show();
  });
  panel.on('closed', () => {
    if (extensionPanelWindows.get(key) === panel) extensionPanelWindows.delete(key);
  });
  try {
    await panel.loadURL(targetUrl);
  } catch (error) {
    if (!panel.isDestroyed()) panel.close();
    throw new Error(`插件面板打开失败：${error.message || '页面加载失败'}`);
  }
  return { ok: true, extensionId: extensionKey, url: targetUrl, reused: false };
}

function runningElectronProfile(profileId) {
  return profileWindows.has(profileId) ? profileSessionRefs.get(profileId) : null;
}

function samePath(left, right) {
  if (!left || !right) return false;
  if (String(left).includes('://') || String(right).includes('://')) return String(left) === String(right);
  try {
    return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
  } catch {
    return false;
  }
}

function extensionUpdateRequestUrl(record) {
  const raw = extensionUpdateUrl(record);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.username || url.password) return '';
  if (url.hostname.toLowerCase() === 'clients2.google.com' && record.extensionId && !url.searchParams.has('x')) {
    if (!url.searchParams.has('response')) url.searchParams.set('response', 'updatecheck');
    url.searchParams.set('x', `id=${record.extensionId}&v=${safeText(record.version)}`);
  }
  return url.toString();
}

async function fetchExtensionResource(resourceUrl, maxBytes, requestFetch = fetch) {
  let current;
  try {
    current = new URL(resourceUrl);
  } catch {
    throw new Error('官方更新地址无效');
  }
  if (current.protocol !== 'https:' || current.username || current.password) throw new Error('官方更新地址必须使用 HTTPS');
  for (let redirects = 0; ; redirects += 1) {
    const response = await requestFetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': `ChromeProfileBrowser-extension/${APP_VERSION}` },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (redirects >= 5) throw new Error('官方更新重定向次数过多');
      const next = new URL(location, current);
      if (next.protocol !== 'https:' || next.username || next.password) throw new Error('官方更新重定向必须使用 HTTPS');
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`官方更新请求失败：HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > maxBytes) throw new Error('官方更新文件超过大小限制');
    if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) throw new Error('官方更新文件超过大小限制');
      return { buffer, url: current.toString() };
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) throw new Error('官方更新文件超过大小限制');
      chunks.push(buffer);
    }
    return { buffer: Buffer.concat(chunks, total), url: current.toString() };
  }
}

async function checkExtensionUpdate(extensionId) {
  const extensionKey = normalizeExtensionId(extensionId);
  if (!extensionKey) throw new Error('插件标识无效');
  const pending = extensionUpdateRuns.get(extensionKey);
  if (pending) return pending;
  const run = (async () => {
    const state = store.get();
    const record = state.extensions.find((item) => item.id === extensionKey);
    if (!record) throw new Error('插件不存在');
    const checkedAt = new Date().toISOString();
    const updateUrl = extensionUpdateUrl(record);
    if (!updateUrl) {
      store.update((next) => {
        const current = next.extensions.find((item) => item.id === extensionKey);
        if (current) {
          current.updateStatus = 'unavailable';
          current.updateVersion = '';
          current.updateCodebase = '';
          current.lastUpdateCheckedAt = checkedAt;
          current.updateError = '插件未声明 HTTPS 官方更新地址，且未找到可验证的 Chrome 扩展公钥';
        }
      });
      broadcastState();
      broadcastBrowserExtensions();
      return { available: false, status: 'unavailable', checkedAt, error: '插件未声明 HTTPS 官方更新地址，且未找到可验证的 Chrome 扩展公钥' };
    }
    store.update((next) => {
      const current = next.extensions.find((item) => item.id === extensionKey);
      if (current) {
        current.updateStatus = 'checking';
        current.updateError = '';
      }
    });
    broadcastState();
    try {
      const requestUrl = extensionUpdateRequestUrl(record);
      if (!requestUrl) throw new Error('官方更新地址无效');
      const resource = await fetchExtensionResource(requestUrl, MAX_EXTENSION_UPDATE_MANIFEST_BYTES);
      const metadata = parseUpdateManifest(resource.buffer.toString('utf8'), resource.url, record.extensionId);
      const available = Boolean(metadata && compareVersions(metadata.version, record.version) > 0);
      const status = available ? 'available' : 'current';
      store.update((next) => {
        const current = next.extensions.find((item) => item.id === extensionKey);
        if (current) {
          current.updateStatus = status;
          current.updateVersion = metadata?.version || '';
          current.updateCodebase = metadata?.codebase || '';
          current.lastUpdateCheckedAt = checkedAt;
          current.updateError = '';
        }
      });
      broadcastState();
      broadcastBrowserExtensions();
      return {
        available,
        status,
        checkedAt,
        version: metadata?.version || '',
        codebase: metadata?.codebase || '',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.update((next) => {
        const current = next.extensions.find((item) => item.id === extensionKey);
        if (current) {
          current.updateStatus = 'error';
          current.updateVersion = '';
          current.updateCodebase = '';
          current.lastUpdateCheckedAt = checkedAt;
          current.updateError = message;
        }
      });
      broadcastState();
      broadcastBrowserExtensions();
      throw error;
    }
  })();
  extensionUpdateRuns.set(extensionKey, run);
  try {
    return await run;
  } finally {
    if (extensionUpdateRuns.get(extensionKey) === run) extensionUpdateRuns.delete(extensionKey);
  }
}

async function updateOnlineExtension(extensionId) {
  const extensionKey = normalizeExtensionId(extensionId);
  if (!extensionKey) throw new Error('插件标识无效');
  const checked = await checkExtensionUpdate(extensionKey);
  if (!checked.available || !checked.codebase) return { updated: false, extension: publicExtension(store.get().extensions.find((item) => item.id === extensionKey)) };
  const state = store.get();
  const record = state.extensions.find((item) => item.id === extensionKey);
  if (!record) throw new Error('插件不存在');
  const download = await fetchExtensionResource(checked.codebase, 80 * 1024 * 1024);
  const extensionSuffix = new URL(download.url).pathname.toLowerCase().endsWith('.zip') ? '.zip' : '.crx';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-extension-update-'));
  const tempPath = path.join(tempDir, `update${extensionSuffix}`);
  const replacementId = `${extensionKey}-update-${Date.now()}`;
  let prepared;
  let committed = false;
  try {
    fs.writeFileSync(tempPath, download.buffer);
    prepared = prepareExtensionSource(tempPath, extensionDataRoot(), replacementId);
    if (record.name && prepared.name && record.name !== prepared.name) throw new Error('官方更新插件名称与已安装插件不一致');
    if (record.extensionId && prepared.extensionId && record.extensionId !== prepared.extensionId) {
      throw new Error('官方更新插件身份与已安装插件不一致');
    }
    if (compareVersions(prepared.version, checked.version) < 0 || compareVersions(prepared.version, record.version) <= 0) {
      throw new Error('官方更新包版本低于当前版本或更新清单版本');
    }
    const activeProfiles = extensionProfileIds(record);
    for (const profileId of activeProfiles) {
      const profileSession = runningElectronProfile(profileId);
      if (profileSession) await unloadSessionExtension(profileId, profileSession, record);
    }
    const nextExtensionId = prepared.extensionId || record.extensionId || '';
    const nextExtensionIdSource = prepared.extensionId ? 'manifest-key' : safeText(record.extensionIdSource);
    const nextRecord = {
      ...record,
      name: prepared.name || record.name,
      version: prepared.version,
      description: prepared.description,
      manifestVersion: prepared.manifestVersion,
      permissions: prepared.permissions || [],
      optionalPermissions: prepared.optionalPermissions || [],
      hostPermissions: prepared.hostPermissions || [],
      path: prepared.path,
      sourcePath: download.url,
      sourceUrl: download.url,
      managed: true,
      loadMode: 'managed',
      managedRoot: prepared.managedRoot || '',
      extensionId: nextExtensionId,
      extensionIdSource: nextExtensionIdSource,
      updateUrl: prepared.updateUrl || record.updateUrl || (nextExtensionIdSource ? chromeWebStoreUpdateUrl(nextExtensionId) : ''),
      updateStatus: 'current',
      updateVersion: prepared.version,
      updateCodebase: '',
      lastUpdateCheckedAt: new Date().toISOString(),
      updateError: '',
      updatedAt: new Date().toISOString(),
    };
    store.update((next) => {
      const index = next.extensions.findIndex((item) => item.id === extensionKey);
      if (index >= 0) next.extensions[index] = nextRecord;
    });
    committed = true;
    const warnings = [];
    const externalProfileIds = activeProfiles.filter((profileId) => externalProcesses.has(profileId));
    if (record.managedRoot && record.managedRoot !== nextRecord.managedRoot) {
      deferManagedExtensionCleanup(record, activeProfiles);
    }
    if (externalProfileIds.length) {
      warnings.push(`${nextRecord.name}：外部 Chromium 需要重启环境后生效，旧版本文件将在停止后清理`);
    }
    for (const profileId of activeProfiles) {
      const profileSession = runningElectronProfile(profileId);
      if (profileSession) warnings.push(...(await syncProfileExtensions(profileId, profileSession)).warnings);
      else if (isProfileRunning(profileId) && !externalProfileIds.includes(profileId)) warnings.push(`${nextRecord.name}：外部 Chromium 需要重启环境后加载`);
    }
    broadcastState();
    broadcastBrowserExtensions();
    return { updated: true, extension: publicExtension(nextRecord), warnings };
  } catch (error) {
    if (!committed && prepared?.managedRoot) removeManagedExtension(prepared, extensionDataRoot());
    throw error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function updateLocalExtension(extensionId) {
  const extensionKey = normalizeExtensionId(extensionId);
  if (!extensionKey) throw new Error('插件标识无效');
  const state = store.get();
  const record = state.extensions.find((item) => item.id === extensionKey);
  if (!record) throw new Error('插件不存在');
  if (extensionUpdateUrl(record)) return updateOnlineExtension(extensionKey);

  const sourcePath = safeText(record.sourcePath || record.path);
  if (!sourcePath || sourcePath.includes('://')) throw new Error('本地插件目录不存在');
  inspectExtensionSource(sourcePath);

  // Electron keeps an extension loaded when its path is unchanged. Unload it
  // before re-reading the local source so changed scripts and assets take effect.
  const activeProfiles = extensionProfileIds(record);
  const unloadedSessions = [];
  try {
    for (const profileId of activeProfiles) {
      const profileSession = runningElectronProfile(profileId);
      if (!profileSession) continue;
      await unloadSessionExtension(profileId, profileSession, record);
      unloadedSessions.push({ profileId, profileSession });
    }
    const result = await installExtension({ path: sourcePath, profileIds: activeProfiles, refresh: true });
    const extension = result?.extension || publicExtension(store.get().extensions.find((item) => item.id === extensionKey));
    broadcastState();
    broadcastBrowserExtensions();
    return {
      ...result,
      updated: true,
      source: 'local',
      extension,
    };
  } catch (error) {
    // Restore the previous version in running Electron sessions if inspection
    // or persistence of the local source fails.
    for (const { profileId, profileSession } of unloadedSessions) {
      try {
        await syncProfileExtensions(profileId, profileSession);
      } catch {
        // The original path may have disappeared; the runtime error is surfaced
        // by the recovery state broadcast below.
      }
    }
    broadcastState();
    broadcastBrowserExtensions();
    throw error;
  }
}

async function updateExtension(extensionId) {
  const extensionKey = normalizeExtensionId(extensionId);
  if (!extensionKey) throw new Error('插件标识无效');
  const record = store.get().extensions.find((item) => item.id === extensionKey);
  if (!record) throw new Error('插件不存在');
  return extensionUpdateUrl(record)
    ? updateOnlineExtension(extensionKey)
    : updateLocalExtension(extensionKey);
}

async function installExtension(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const sourcePath = safeText(payload.path || payload.sourcePath);
  if (!sourcePath) throw new Error('请选择插件目录或压缩包');
  const state = store.get();
  const requestedProfiles = payload.profileIds === undefined
    ? null
    : normalizeExtensionProfileIds(payload.profileIds, state);
  const hintedExtensionId = normalizeExtensionId(payload.extensionId);
  const existing = state.extensions.find((record) => (
    samePath(record.sourcePath, sourcePath) ||
    samePath(record.path, sourcePath) ||
    (hintedExtensionId && record.extensionId === hintedExtensionId)
  ));
  const extensionId = normalizeExtensionId(existing?.id) || id('extension');
  const preparationId = existing?.managed && payload.refresh === true
    ? `${extensionId}-local-${Date.now()}`
    : extensionId;
  const oldRecord = existing;
  let prepared;
  let record;
  let committed = false;
  try {
    prepared = prepareExtensionSource(sourcePath, extensionDataRoot(), preparationId);
    const now = new Date().toISOString();
    const extensionIdValue = prepared.extensionId || hintedExtensionId || existing?.extensionId || '';
    const extensionIdSource = prepared.extensionId
      ? 'manifest-key'
      : hintedExtensionId
        ? 'chrome-web-store'
        : safeText(existing?.extensionIdSource);
    const updateUrl = prepared.updateUrl || (extensionIdSource ? chromeWebStoreUpdateUrl(extensionIdValue) : '');
    record = {
      id: extensionId,
      name: safeText(payload.name, prepared.name),
      version: prepared.version,
      description: prepared.description,
      manifestVersion: prepared.manifestVersion,
      permissions: prepared.permissions || [],
      optionalPermissions: prepared.optionalPermissions || [],
      hostPermissions: prepared.hostPermissions || [],
      panels: prepared.panels || { popup: '', sidePanel: '', options: '' },
      updateUrl,
      updateStatus: updateUrl ? 'unknown' : 'unavailable',
      updateVersion: '',
      updateCodebase: '',
      lastUpdateCheckedAt: '',
      updateError: updateUrl ? '' : '插件未声明 HTTPS 官方更新地址，且未找到可验证的 Chrome 扩展公钥',
      path: prepared.path,
      sourcePath: safeText(payload.sourceUrl) || prepared.sourcePath,
      ...(safeText(payload.sourceUrl) ? { sourceUrl: safeText(payload.sourceUrl) } : {}),
      ...(safeText(payload.sourceType) ? { sourceType: safeText(payload.sourceType) } : {}),
      managed: Boolean(prepared.managed),
      loadMode: prepared.loadMode === 'direct' || !prepared.managed ? 'direct' : 'managed',
      managedRoot: prepared.managedRoot || '',
      extensionId: extensionIdValue,
      extensionIdSource,
      profileIds: requestedProfiles || extensionProfileIds(existing),
      pinnedProfileIds: extensionPinnedProfileIds(existing, state),
      installedAt: existing?.installedAt || now,
      updatedAt: now,
    };
    store.update((next) => {
      const index = next.extensions.findIndex((item) => item.id === extensionId);
      if (index === -1) next.extensions.push(record);
      else next.extensions[index] = record;
    });
    committed = true;
    const warnings = [];
    for (const profileId of new Set(record.profileIds)) {
      const profileSession = runningElectronProfile(profileId);
      if (profileSession) {
        warnings.push(...(await syncProfileExtensions(profileId, profileSession)).warnings);
      } else if (isProfileRunning(profileId)) {
        warnings.push(`${record.name}：外部 Chromium 需要重启环境后加载`);
      }
    }
    if (oldRecord?.managedRoot && oldRecord.managedRoot !== record.managedRoot) {
      deferManagedExtensionCleanup(oldRecord, extensionProfileIds(oldRecord));
    }
    broadcastState();
    broadcastBrowserExtensions();
    return { extension: publicExtension(record), warnings };
  } catch (error) {
    if (committed) {
      store.update((next) => {
        const index = next.extensions.findIndex((item) => item.id === extensionId);
        if (index < 0) return;
        if (oldRecord) next.extensions[index] = oldRecord;
        else next.extensions.splice(index, 1);
      });
      if (oldRecord) {
        for (const profileId of extensionProfileIds(oldRecord)) {
          const profileSession = runningElectronProfile(profileId);
          if (!profileSession) continue;
          try {
            await syncProfileExtensions(profileId, profileSession);
          } catch {
            // Preserve the original installation error; the runtime state is broadcast below.
          }
        }
      }
      broadcastState();
      broadcastBrowserExtensions();
    }
    if (prepared?.managedRoot && prepared.managedRoot !== oldRecord?.managedRoot) {
      removeManagedExtension(prepared, extensionDataRoot());
    }
    throw error;
  }
}

async function installChromeWebStoreExtension(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const extensionId = normalizeChromeWebStoreExtensionId(payload.source);
  if (!extensionId) throw new Error('请输入 Chrome Web Store 详情页地址或 32 位扩展 ID');
  const downloadUrl = chromeWebStoreDownloadUrl(extensionId, process.versions.chrome);
  if (!downloadUrl) throw new Error('Chrome Web Store 扩展 ID 无效');
  return withExtensionStoreNode(payload.proxyNodeId, async (requestFetch) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-web-store-'));
    const tempPath = path.join(tempDir, `${extensionId}.crx`);
    try {
      const resource = await fetchExtensionResource(downloadUrl, MAX_EXTENSION_ARCHIVE_BYTES, requestFetch);
      fs.writeFileSync(tempPath, resource.buffer);
      const archiveExtensionId = extensionIdFromArchive(resource.buffer);
      if (archiveExtensionId && archiveExtensionId !== extensionId) {
        throw new Error('下载的插件身份与 Chrome Web Store 扩展 ID 不一致');
      }
      const inspected = inspectExtensionSource(tempPath);
      if (inspected.extensionId && inspected.extensionId !== extensionId) {
        throw new Error('下载的插件身份与 Chrome Web Store 扩展 ID 不一致');
      }
      if (!archiveExtensionId && !inspected.extensionId) {
        throw new Error('下载的插件缺少可验证的扩展身份');
      }
      return await installExtension({
        path: tempPath,
        profileIds: payload.profileIds,
        extensionId,
        refresh: true,
        sourceUrl: `https://chromewebstore.google.com/detail/${extensionId}`,
        sourceType: 'chrome-web-store',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
}

async function installCrxSosoExtension(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const extensionId = normalizeCrxSosoExtensionId(payload.extensionId || payload.id);
  if (!extensionId) throw new Error('CRX Soso 插件标识无效');
  return withExtensionStoreNode(payload.proxyNodeId, async (requestFetch) => {
    const details = await getCrxSosoExtensionDetails(extensionId, requestFetch);
    const downloadUrl = await resolveCrxSosoDownload(extensionId, details, requestFetch);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-crxsoso-'));
    const tempPath = path.join(tempDir, `${extensionId}.crx`);
    try {
      const resource = await fetchExtensionResource(downloadUrl, MAX_EXTENSION_ARCHIVE_BYTES, requestFetch);
      let resourceHost = '';
      try { resourceHost = new URL(resource.url).hostname.toLowerCase(); } catch { /* The fetch helper already validates the URL. */ }
      if (!['c2.crxsoso.com', 'e2.crxsoso.com'].includes(resourceHost)) {
        throw new Error('CRX Soso 下载重定向到未允许的主机');
      }
      fs.writeFileSync(tempPath, resource.buffer);
      const archiveExtensionId = extensionIdFromArchive(resource.buffer);
      if (archiveExtensionId && archiveExtensionId !== extensionId) {
        throw new Error('下载的插件身份与 CRX Soso 结果不一致');
      }
      const inspected = inspectExtensionSource(tempPath);
      if (inspected.extensionId && inspected.extensionId !== extensionId) {
        throw new Error('下载的插件身份与 CRX Soso 结果不一致');
      }
      if (!archiveExtensionId && !inspected.extensionId) {
        throw new Error('下载的插件缺少可验证的扩展身份');
      }
      return await installExtension({
        path: tempPath,
        profileIds: payload.profileIds,
        extensionId,
        refresh: true,
        sourceUrl: details.sourceUrl,
        sourceType: 'crxsoso-chrome',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
}

async function setExtensionProfiles(extensionId, profileIds) {
  const extensionKey = normalizeExtensionId(extensionId);
  if (!extensionKey) throw new Error('插件标识无效');
  const state = store.get();
  const current = state.extensions.find((record) => record.id === extensionKey);
  if (!current) throw new Error('插件不存在');
  const nextProfileIds = normalizeExtensionProfileIds(profileIds, state);
  const removedProfileIds = extensionProfileIds(current).filter((profileId) => !nextProfileIds.includes(profileId));
  for (const profileId of removedProfileIds) closeExtensionPanel(profileId, extensionKey);
  const affected = new Set([...extensionProfileIds(current), ...nextProfileIds]);
  store.update((next) => {
    const record = next.extensions.find((item) => item.id === extensionKey);
    if (record) {
      record.profileIds = nextProfileIds;
      record.updatedAt = new Date().toISOString();
    }
  });
  const warnings = [];
  for (const profileId of affected) {
    const profileSession = runningElectronProfile(profileId);
    if (profileSession) warnings.push(...(await syncProfileExtensions(profileId, profileSession)).warnings);
    else if (isProfileRunning(profileId)) warnings.push(`${current.name}：外部 Chromium 需要重启环境后加载`);
  }
  broadcastState();
  broadcastBrowserExtensions();
  const updated = store.get().extensions.find((record) => record.id === extensionKey);
  return { extension: publicExtension(updated), warnings };
}

async function setExtensionEnabledForProfile(profileId, extensionId, enabled) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  const state = store.get();
  const record = state.extensions.find((item) => item.id === normalizeExtensionId(extensionId));
  if (!record) throw new Error('插件不存在');
  const nextProfileIds = toggleProfileId(extensionProfileIds(record), profileKey, enabled);
  return setExtensionProfiles(record.id, nextProfileIds);
}

function setExtensionPinnedForProfile(profileId, extensionId, pinned) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey || !store.get().profiles.some((profile) => profile.id === profileKey)) throw new Error('环境标识无效');
  const extensionKey = normalizeExtensionId(extensionId);
  if (!extensionKey) throw new Error('插件标识无效');
  const state = store.get();
  const record = state.extensions.find((item) => item.id === extensionKey);
  if (!record) throw new Error('插件不存在');
  const profileIds = extensionPinnedProfileIds(record, state);
  const nextProfileIds = pinned
    ? [...new Set([...profileIds, profileKey])]
    : profileIds.filter((item) => item !== profileKey);
  store.update((next) => {
    const current = next.extensions.find((item) => item.id === extensionKey);
    if (!current) return;
    current.pinnedProfileIds = normalizeExtensionProfileIds(nextProfileIds, next);
    current.updatedAt = new Date().toISOString();
  });
  broadcastState();
  broadcastBrowserExtensions();
  return {
    extension: publicExtension(store.get().extensions.find((item) => item.id === extensionKey)),
    pinned: nextProfileIds.includes(profileKey),
  };
}

async function deleteExtension(extensionId) {
  const extensionKey = normalizeExtensionId(extensionId);
  const state = store.get();
  const record = state.extensions.find((item) => item.id === extensionKey);
  if (!record) throw new Error('插件不存在');
  for (const profileId of extensionProfileIds(record)) {
    closeExtensionPanel(profileId, extensionKey);
    const profileSession = runningElectronProfile(profileId);
    if (profileSession) await unloadSessionExtension(profileId, profileSession, record);
  }
  store.update((next) => {
    next.extensions = next.extensions.filter((item) => item.id !== extensionKey);
  });
  deferManagedExtensionCleanup(record, extensionProfileIds(record));
  for (const errors of profileExtensionErrors.values()) errors.delete(extensionKey);
  broadcastState();
  broadcastBrowserExtensions();
  return { extensionId: extensionKey };
}

function runningProfiles() {
  return (store?.get?.().profiles || [])
    .filter((profile) => profile && isProfileRunning(profile.id));
}

function updateTrayState() {
  if (!tray || tray.isDestroyed?.()) return;
  const running = runningProfiles();
  const names = running.map((profile) => safeText(profile.name, profile.id)).filter(Boolean);
  const summary = names.length
    ? `正在运行的浏览器：${names.length} 个\n${names.join('、')}`
    : '没有正在运行的浏览器';
  tray.setToolTip(`${BRAND_NAME}\n${summary}`);
}

function showManagerWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createManagerWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideManagerWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
}

function createTray() {
  if (tray && !tray.isDestroyed?.()) return;
  tray = new Tray(BRAND_NATIVE_ICON_PATH);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '展开配置中心', click: showManagerWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
  tray.on('double-click', showManagerWindow);
  updateTrayState();
}

function broadcastState() {
  const runningCount = runningProfiles().length;
  const allProfilesStopped = previousRunningProfileCount > 0 && runningCount === 0 && !quitCleanupStarted;
  previousRunningProfileCount = runningCount;
  updateTrayState();
  if (allProfilesStopped) showManagerWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('state:updated', publicState());
}

function resetInterruptedNodeChecks() {
  if (!store.get().nodes.some((node) => node.status === 'checking')) return;
  store.update((next) => {
    for (const node of next.nodes) {
      if (node.status === 'checking') {
        node.status = 'unknown';
        node.latencyMs = null;
        node.lastCheckError = '';
      }
    }
  });
}

function measuredLatency(result) {
  const latency = Number(result?.latencyMs);
  return result?.ok && Number.isFinite(latency) ? Math.max(0, Math.round(latency)) : null;
}

function applyIpCountryResult(ip, result, nodeId = '') {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp || !result) return false;
  const countryCode = safeText(result.countryCode).toUpperCase();
  const country = countryName(countryCode) || safeText(result.country) || countryCode;
  if (!country) return false;
  const checkedAt = new Date().toISOString();
  let changed = false;
  store.update((next) => {
    for (const node of next.nodes) {
      if (normalizeIp(storedNodeIp(node)) !== normalizedIp) continue;
      if (node.country !== country || node.countryCode !== countryCode) changed = true;
      node.country = country;
      if (countryCode) node.countryCode = countryCode;
      node.countrySource = 'ip';
      node.countryLookupAt = checkedAt;
    }
  });
  if (changed) {
    broadcastState();
    // The same public IP may be shared by multiple nodes/profiles; every
    // browser shell that uses one of the updated nodes must receive the
    // refreshed country value.
    broadcastBrowserConnectionDetails();
  }
  return changed;
}

function lookupNodeCountry(ip, nodeId = '') {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp) return Promise.resolve(null);
  if (ipCountryCache.has(normalizedIp)) {
    const cached = ipCountryCache.get(normalizedIp);
    if (cached) applyIpCountryResult(normalizedIp, cached, nodeId);
    return Promise.resolve(cached);
  }
  const existing = ipCountryRuns.get(normalizedIp);
  if (existing) return existing;
  const run = lookupIpCountry(normalizedIp)
    .then((result) => {
      if (result) {
        ipCountryCache.set(normalizedIp, result);
        applyIpCountryResult(normalizedIp, result, nodeId);
      }
      return result;
    })
    .catch(() => null);
  ipCountryRuns.set(normalizedIp, run);
  run.finally(() => {
    if (ipCountryRuns.get(normalizedIp) === run) ipCountryRuns.delete(normalizedIp);
  }).catch(() => {});
  return run;
}

function lookupKnownNodeCountries() {
  const ips = new Set(store.get().nodes
    .map((node) => storedNodeIp(node))
    .filter(Boolean));
  void runBoundedBatch([...ips], async (ip) => {
    try {
      return await lookupNodeCountry(ip);
    } catch {
      return null;
    }
  }, CONNECTION_CHECK_BATCH_CONCURRENCY)
    .catch(() => {});
}

function applyNodeCheckResult(nodeId, result) {
  const checkedAt = new Date().toISOString();
  let ipAddress = '';
  let countryFromProbe = '';
  store.update((next) => {
    const item = next.nodes.find((entry) => entry.id === nodeId);
    if (!item) return;
    item.status = safeText(result?.status) || 'error';
    item.lastCheckedAt = checkedAt;
    item.lastCheckPhase = safeText(result?.phase);
    item.latencyMs = measuredLatency(result);
    item.lastCheckError = result?.ok ? '' : (safeText(result?.error) || '节点不可达');
    const previousIp = storedNodeIp(item);
    ipAddress = safeText(result?.ipAddress || result?.remoteAddress) || previousIp;
    if (ipAddress) {
      const ipChanged = previousIp && normalizeIp(previousIp) !== normalizeIp(ipAddress);
      if (ipChanged) {
        item.country = '';
        item.countryCode = '';
        item.countrySource = '';
        item.countryLookupAt = '';
        item.ipSource = '';
        item.ipProperty = '';
      }
      item.ipAddress = ipAddress;
      const countryCodeFromProbe = safeText(result?.countryCode).toUpperCase();
      countryFromProbe = countryName(countryCodeFromProbe) || safeText(result?.country) || countryCodeFromProbe;
      if (countryFromProbe) {
        item.country = countryFromProbe;
        if (countryCodeFromProbe) item.countryCode = countryCodeFromProbe;
        item.countrySource = 'exit-probe';
        item.countryLookupAt = checkedAt;
      }
      const ipSource = safeText(result?.ipSource);
      const ipProperty = safeText(result?.ipProperty);
      if (ipSource) item.ipSource = ipSource;
      if (ipProperty) item.ipProperty = ipProperty;
    }
  });
  broadcastBrowserConnectionDetails(nodeId);
  if (ipAddress && !countryFromProbe) void lookupNodeCountry(ipAddress, nodeId);
}

function checkNodeConnection(nodeId) {
  const idValue = safeText(nodeId);
  if (!idValue) return Promise.reject(new Error('节点标识无效'));
  const existing = connectionCheckRuns.get(idValue);
  if (existing) return existing;
  const run = (async () => {
    const node = hydrateNode(store.get().nodes.find((item) => item.id === idValue));
    if (!node) throw new Error('节点不存在');
    let result;
    try {
      const checkOptions = {
        timeoutMs: CONNECTION_CHECK_TIMEOUT_MS,
        probeExit: true,
      };
      if (node.requiresCore || node.coreConfig) {
        checkOptions.target = DIRECT_CONNECTION_TARGET;
        checkOptions.startCore = startNodeProbeCore;
        checkOptions.cleanupCore = cleanupNodeProbeCore;
      }
      result = await checkNodeReachability(node, checkOptions);
    } catch (error) {
      result = {
        ok: false,
        reachable: false,
        status: 'error',
        phase: 'check',
        nodeId: idValue,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    applyNodeCheckResult(idValue, result);
    broadcastState();
    return result;
  })();
  connectionCheckRuns.set(idValue, run);
  run.finally(() => {
    if (connectionCheckRuns.get(idValue) === run) connectionCheckRuns.delete(idValue);
  }).catch(() => {});
  return run;
}

async function checkProfileConnection(profileId) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  const state = store.get();
  const profile = state.profiles.find((item) => item.id === profileKey);
  if (!profile) throw new Error('环境不存在');
  const nodeId = safeText(profile.nodeId);
  if (!nodeId) return checkDirectConnection();
  if (!state.nodes.some((node) => node.id === nodeId)) throw new Error('所选节点不存在');
  return checkNodeConnection(nodeId);
}

function markNodeChecksPending(nodeIds) {
  const ids = new Set(nodeIds);
  if (!ids.size) return;
  store.update((next) => {
    for (const node of next.nodes) {
      if (ids.has(node.id) && node.supported !== false) node.status = 'checking';
    }
  });
  broadcastState();
}

async function checkNodeConnections(nodeIds) {
  const requested = Array.isArray(nodeIds)
    ? [...new Set(nodeIds.map((value) => safeText(value)).filter(Boolean))]
    : [];
  const currentNodes = new Map(store.get().nodes.map((node) => [node.id, node]));
  const ids = requested.filter((nodeId) => {
    const node = currentNodes.get(nodeId);
    return node && node.supported !== false && safeText(node.status).toLowerCase() !== 'unsupported';
  });
  const idSet = new Set(ids);
  const skipped = requested.filter((nodeId) => !idSet.has(nodeId));
  markNodeChecksPending(ids);

  const results = await runBoundedBatch(ids, async (nodeId) => {
    try {
      return await checkNodeConnection(nodeId);
    } catch (error) {
      return {
        ok: false,
        reachable: false,
        status: 'error',
        phase: 'check',
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, CONNECTION_CHECK_BATCH_CONCURRENCY);
  return { results, skipped };
}

async function selectRandomExtensionStoreNode() {
  const candidates = store.get().nodes.filter((node) => (
    node
    && node.id
    && !isSubscriptionInfoNode(node)
    && !isUnsupportedNode(node)
    && !['invalid', 'unsupported'].includes(safeText(node.status).toLowerCase())
  ));
  if (!candidates.length) throw new Error('没有已配置的代理节点，无法连接 Chrome Web Store');

  const checked = await checkNodeConnections(candidates.map((node) => node.id));
  return selectRandomReachableNode(candidates, checked.results);
}

function checkDirectConnection() {
  if (directConnectionCheck) return directConnectionCheck;
  directConnectionHealth = {
    status: 'checking',
    latencyMs: null,
    lastCheckedAt: directConnectionHealth?.lastCheckedAt || '',
    lastCheckPhase: directConnectionHealth?.lastCheckPhase || '',
    lastCheckError: '',
    ipAddress: directConnectionHealth?.ipAddress || '',
    country: directConnectionHealth?.country || '',
    ipSource: directConnectionHealth?.ipSource || '',
    ipProperty: directConnectionHealth?.ipProperty || '',
  };
  broadcastState();
  const run = (async () => {
    let result;
    try {
      result = await checkProxyReachability({
        id: '__direct__',
        protocol: 'direct',
        host: DIRECT_CONNECTION_TARGET.host,
        port: DIRECT_CONNECTION_TARGET.port,
        status: 'supported',
      }, { timeoutMs: CONNECTION_CHECK_TIMEOUT_MS, probeExit: true });
    } catch (error) {
      result = {
        ok: false,
        reachable: false,
        status: 'error',
        phase: 'check',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const countryFromProbe = countryName(safeText(result?.countryCode).toUpperCase()) || safeText(result?.country);
    directConnectionHealth = {
      status: safeText(result?.status) || 'error',
      latencyMs: measuredLatency(result),
      lastCheckedAt: new Date().toISOString(),
      lastCheckPhase: safeText(result?.phase),
      lastCheckError: result?.ok ? '' : (safeText(result?.error) || '直连不可达'),
      ipAddress: safeText(result?.ipAddress) || directConnectionHealth?.ipAddress || '',
      country: countryFromProbe || directConnectionHealth?.country || '',
      ipSource: safeText(result?.ipSource) || directConnectionHealth?.ipSource || '',
      ipProperty: safeText(result?.ipProperty) || directConnectionHealth?.ipProperty || '',
    };
    broadcastState();
    broadcastBrowserConnectionDetails();
    return result;
  })();
  directConnectionCheck = run;
  run.finally(() => {
    if (directConnectionCheck === run) directConnectionCheck = undefined;
  }).catch(() => {});
  return run;
}

function nodeProbeProfileId(nodeId) {
  const safeId = safeText(nodeId).replace(/[^a-z0-9_-]/gi, '-').slice(0, 48) || 'node';
  return `check-${safeId}-${crypto.randomUUID()}`;
}

async function startNodeProbeCore(node) {
  const state = store.get();
  const selectedCore = node?.protocol === 'anytls' || node?.coreConfig?.type === 'anytls'
    ? 'singbox'
    : normalizeCore(node?.core || state.settings.defaultCore);
  return startProxyCore({
    kind: selectedCore,
    profileId: nodeProbeProfileId(node?.id),
    node,
    state,
  });
}

async function cleanupNodeProbeCore(runtime) {
  if (!runtime?.child) return;
  terminateCore(runtime.child);
  const exited = await waitForChildExit(runtime.child);
  if (exited) cleanupRuntime(runtime);
}

async function startExtensionStoreProxyCore(node) {
  const runtime = await startNodeProbeCore(node);
  extensionStoreProxyCores.add(runtime);
  runtime.child.once('exit', () => {
    extensionStoreProxyCores.delete(runtime);
    cleanupRuntime(runtime);
  });
  return runtime;
}

async function stopExtensionStoreProxyCore(runtime) {
  if (!runtime?.child) return;
  terminateCore(runtime.child);
  const exited = await waitForChildExit(runtime.child);
  if (!exited) return;
  extensionStoreProxyCores.delete(runtime);
  cleanupRuntime(runtime);
}

function withExtensionStoreNode(proxyNodeId, operation) {
  const nodeId = safeText(proxyNodeId);
  if (!nodeId) return withExtensionStoreProxy(null, operation);
  const record = store.get().nodes.find((node) => node.id === nodeId);
  if (!record) throw new Error('商店请求节点不存在，请重新选择');
  if (record.supported === false || ['invalid', 'unsupported'].includes(safeText(record.status).toLowerCase())) {
    throw new Error('所选商店请求节点不受支持');
  }
  return withExtensionStoreProxy(hydrateNode(record), operation, {
    startCore: startExtensionStoreProxyCore,
    stopCore: stopExtensionStoreProxyCore,
  });
}

async function refreshConnectionStatus() {
  if (connectionMonitorRun) return connectionMonitorRun;
  const run = (async () => {
    const state = store.get();
    const selectedNodeIds = new Set(state.profiles.map((profile) => safeText(profile.nodeId)).filter(Boolean));
    const nodes = state.nodes.filter((node) => (
      node && selectedNodeIds.has(node.id)
      && node.supported !== false && node.status !== 'invalid' && node.status !== 'unsupported'
    ));
    const hasDirectProfile = state.profiles.some((profile) => !profile.nodeId);
    if (nodes.length) await checkNodeConnections(nodes.map((node) => node.id));
    if (hasDirectProfile) await checkDirectConnection();
  })();
  connectionMonitorRun = run;
  run.finally(() => {
    if (connectionMonitorRun === run) connectionMonitorRun = undefined;
  }).catch(() => {});
  return run;
}

function startConnectionMonitor() {
  if (connectionMonitorTimer) return;
  void refreshConnectionStatus();
  connectionMonitorTimer = setInterval(() => {
    void refreshConnectionStatus();
  }, CONNECTION_CHECK_INTERVAL_MS);
}

function stopConnectionMonitor() {
  if (!connectionMonitorTimer) return;
  clearInterval(connectionMonitorTimer);
  connectionMonitorTimer = undefined;
}

const coreUpdateNoticeKeys = new Set();
const browserUpdateNoticeKeys = new Set();

async function checkCoreUpdates() {
  if (coreUpdateCheckRun) return coreUpdateCheckRun;
  const run = (async () => {
    const state = store.get();
    const checks = ['xray', 'singbox'].map(async (kind) => {
      const info = publicCoreInfo(kind, state);
      if (!info.configured || !info.version) return null;
      return { source: 'core', update: await checkLatestCore({ core: kind, currentVersion: info.version }) };
    });
    const engineVersion = safeText(state.settings?.engineVersion);
    if (safeText(state.settings?.enginePath) && engineVersion) {
      checks.push(checkLatestBrowser({ currentVersion: engineVersion }).then((update) => ({ source: 'browser', update })));
    }
    const settled = await Promise.allSettled(checks);
    const previous = new Map(coreUpdateState.map((update) => [update.core, update]));
    let nextBrowserUpdate = safeText(state.settings?.enginePath) && engineVersion ? browserUpdateState : null;
    for (const result of settled) {
      if (result.status !== 'fulfilled' || !result.value?.update) continue;
      const { source, update } = result.value;
      if (source === 'browser') {
        nextBrowserUpdate = update.updateAvailable ? update : null;
      } else if (update.updateAvailable) previous.set(update.core, update);
      else previous.delete(update.core);
    }
    coreUpdateState = [...previous.values()];
    browserUpdateState = nextBrowserUpdate;
    broadcastState();
    for (const update of coreUpdateState) {
      const noticeKey = `${update.core}:${update.latestVersion}`;
      if (coreUpdateNoticeKeys.has(noticeKey) || !mainWindow || mainWindow.isDestroyed()) continue;
      coreUpdateNoticeKeys.add(noticeKey);
      mainWindow.webContents.send('core:update-available', update);
    }
    if (browserUpdateState) {
      const noticeKey = browserUpdateState.latestVersion;
      if (!browserUpdateNoticeKeys.has(noticeKey) && mainWindow && !mainWindow.isDestroyed()) {
        browserUpdateNoticeKeys.add(noticeKey);
        mainWindow.webContents.send('browser:update-available', browserUpdateState);
      }
    }
    return coreUpdateState.map((update) => ({ ...update }));
  })();
  coreUpdateCheckRun = run;
  run.finally(() => {
    if (coreUpdateCheckRun === run) coreUpdateCheckRun = undefined;
  }).catch(() => {});
  return run;
}

function startCoreUpdateMonitor() {
  if (coreUpdateCheckTimer) return;
  void checkCoreUpdates();
  coreUpdateCheckTimer = setInterval(() => {
    void checkCoreUpdates();
  }, CORE_UPDATE_CHECK_INTERVAL_MS);
}

function stopCoreUpdateMonitor() {
  if (!coreUpdateCheckTimer) return;
  clearInterval(coreUpdateCheckTimer);
  coreUpdateCheckTimer = undefined;
}

function isProfileRunning(profileId) {
  return activeProfileWindows.has(profileId) || externalProcesses.has(profileId) || coreProcesses.has(profileId);
}

function profileConnectionDetails(profileId) {
  const profile = store.get().profiles.find((item) => item.id === profileId);
  if (!profile || profile.connectionMode !== 'node' || !profile.nodeId) return connectionDetails(null, directConnectionHealth);
  const node = hydrateNode(store.get().nodes.find((item) => item.id === profile.nodeId));
  return connectionDetails(node);
}

function profileBookmarks(profileId) {
  const profile = store.get().profiles.find((item) => item.id === safeProfileId(profileId));
  return normalizeBookmarks(profile?.bookmarks);
}

async function fetchBookmarkFavicon(profileSession, url) {
  try {
    const response = await profileSession.fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return '';
    const mimeType = safeText(response.headers.get('content-type')).split(';')[0].toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/.test(mimeType)) return '';
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BOOKMARK_FAVICON_BYTES) return '';

    const reader = response.body?.getReader();
    if (!reader) {
      const body = Buffer.from(await response.arrayBuffer());
      if (!body.length || body.length > MAX_BOOKMARK_FAVICON_BYTES) return '';
      return `data:${mimeType};base64,${body.toString('base64')}`;
    }

    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BOOKMARK_FAVICON_BYTES) {
        await reader.cancel().catch(() => {});
        return '';
      }
      chunks.push(Buffer.from(value));
    }
    if (!length) return '';
    return `data:${mimeType};base64,${Buffer.concat(chunks, length).toString('base64')}`;
  } catch {
    return '';
  }
}

async function loadProfilePageFavicon(profileId, input) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');

  const suppliedFavicon = normalizeFavicon(input?.favicon);
  if (/^data:image\//i.test(suppliedFavicon) && suppliedFavicon.length <= MAX_BOOKMARK_FAVICON_BYTES) {
    return { profileId: profileKey, favicon: suppliedFavicon, source: suppliedFavicon };
  }

  let defaultFavicon = '';
  try {
    const pageUrl = new URL(safeText(input?.url));
    if (['http:', 'https:'].includes(pageUrl.protocol)) {
      pageUrl.username = '';
      pageUrl.password = '';
      defaultFavicon = new URL('/favicon.ico', pageUrl).toString();
    }
  } catch {
    // The page may have navigated away before the favicon request was sent.
  }

  const candidates = [suppliedFavicon, defaultFavicon]
    .filter((url, index, list) => url && !/^data:/i.test(url) && list.indexOf(url) === index);
  const profileSession = profileSessionRefs.get(profileKey) || session.fromPartition(profilePartition(profileKey));
  for (const candidate of candidates) {
    const favicon = await fetchBookmarkFavicon(profileSession, candidate);
    if (favicon) return { profileId: profileKey, favicon, source: candidate };
  }
  return { profileId: profileKey, favicon: '', source: '' };
}

async function loadProfileBookmarkFavicon(profileId, input) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  const bookmarkId = safeText(input?.id);
  const profile = store.get().profiles.find((item) => item.id === profileKey);
  const bookmark = normalizeBookmarks(profile?.bookmarks).find((item) => item.id === bookmarkId && item.type === 'bookmark');
  if (!profile || !bookmark) return { profileId: profileKey, favicon: '' };
  if (/^data:image\//i.test(bookmark.favicon)) return { profileId: profileKey, favicon: bookmark.favicon };

  const suppliedFavicon = normalizeFavicon(input?.favicon);
  if (/^data:image\//i.test(suppliedFavicon)) {
    const favicon = suppliedFavicon;
    store.update((next) => {
      const targetProfile = next.profiles.find((item) => item.id === profileKey);
      if (!targetProfile) return;
      const records = normalizeBookmarks(targetProfile.bookmarks);
      const target = records.find((item) => item.id === bookmarkId && item.url === bookmark.url);
      if (!target || /^data:image\//i.test(target.favicon)) return;
      target.favicon = favicon;
      targetProfile.bookmarks = records;
    });
    return { profileId: profileKey, favicon, bookmarks: profileBookmarks(profileKey) };
  }

  const profileSession = profileSessionRefs.get(profileKey) || session.fromPartition(profilePartition(profileKey));
  const defaultFavicon = new URL('/favicon.ico', bookmark.url).toString();
  const candidates = [suppliedFavicon, defaultFavicon]
    .filter((url, index, list) => url && list.indexOf(url) === index);
  let favicon = '';
  for (const candidate of candidates) {
    favicon = await fetchBookmarkFavicon(profileSession, candidate);
    if (favicon) break;
  }
  if (!favicon) return { profileId: profileKey, favicon: '', bookmarks: profileBookmarks(profileKey) };

  store.update((next) => {
    const targetProfile = next.profiles.find((item) => item.id === profileKey);
    if (!targetProfile) return;
    const records = normalizeBookmarks(targetProfile.bookmarks);
    const target = records.find((item) => item.id === bookmarkId && item.url === bookmark.url);
    if (!target || /^data:image\//i.test(target.favicon)) return;
    target.favicon = favicon;
    targetProfile.bookmarks = records;
  });
  return { profileId: profileKey, favicon, bookmarks: profileBookmarks(profileKey) };
}

function profileNewTabSites(profileId) {
  const state = store.get();
  const profile = state.profiles.find((item) => item.id === safeProfileId(profileId));
  if (!profile) throw new Error('环境不存在');
  return recommendedSites(profile.newTabSiteVisits, state.settings.newTabSites);
}

function recordProfileNewTabSiteVisit(profileId, url) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  const currentState = store.get();
  const currentProfile = currentState.profiles.find((item) => item.id === profileKey);
  if (!currentProfile) throw new Error('环境不存在');
  if (!canonicalizeSite(url)) {
    return { profileId: profileKey, sites: recommendedSites(currentProfile.newTabSiteVisits, currentState.settings.newTabSites) };
  }

  let sites = [];
  store.update((next) => {
    const profile = next.profiles.find((item) => item.id === profileKey);
    if (!profile) throw new Error('环境不存在');
    profile.newTabSiteVisits = recordSiteVisit(profile.newTabSiteVisits, url);
    sites = recommendedSites(profile.newTabSiteVisits, next.settings.newTabSites);
  });
  return { profileId: profileKey, sites };
}

function profileSearchHistory(profileId) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  const profile = store.get().profiles.find((item) => item.id === profileKey);
  if (!profile) throw new Error('环境不存在');
  return normalizeSearchHistory(profile.searchHistory);
}

function recordProfileSearchQuery(profileId, query) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  if (!isSearchQuery(query)) {
    return { profileId: profileKey, searchHistory: profileSearchHistory(profileKey) };
  }
  let searchHistory = [];
  store.update((next) => {
    const profile = next.profiles.find((item) => item.id === profileKey);
    if (!profile) throw new Error('环境不存在');
    profile.searchHistory = recordSearchQuery(profile.searchHistory, query);
    searchHistory = profile.searchHistory;
  });
  return { profileId: profileKey, searchHistory };
}

function profileDownloads(profileId) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  return (profileDownloadRecords.get(profileKey) || []).map(publicDownloadRecord);
}

function saveProfileBookmark(profileId, input) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  let bookmark;
  let bookmarks;
  store.update((next) => {
    const profile = next.profiles.find((item) => item.id === profileKey);
    if (!profile) throw new Error('环境不存在');
    const result = addBookmarkRecord(profile.bookmarks, input);
    bookmark = result.bookmark;
    profile.bookmarks = result.bookmarks;
    bookmarks = result.bookmarks;
  });
  broadcastState();
  return { profileId: profileKey, bookmark, bookmarks };
}

function createProfileBookmarkFolder(profileId, input) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  let folder;
  let bookmarks;
  store.update((next) => {
    const profile = next.profiles.find((item) => item.id === profileKey);
    if (!profile) throw new Error('环境不存在');
    const result = createBookmarkFolder(profile.bookmarks, input);
    folder = result.folder;
    profile.bookmarks = result.bookmarks;
    bookmarks = result.bookmarks;
  });
  broadcastState();
  return { profileId: profileKey, bookmark: folder, bookmarks };
}

function updateProfileBookmark(profileId, input) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  let bookmark;
  let bookmarks;
  store.update((next) => {
    const profile = next.profiles.find((item) => item.id === profileKey);
    if (!profile) throw new Error('环境不存在');
    const result = updateBookmarkRecord(profile.bookmarks, input);
    bookmark = result.bookmark;
    profile.bookmarks = result.bookmarks;
    bookmarks = result.bookmarks;
  });
  broadcastState();
  return { profileId: profileKey, bookmark, bookmarks };
}

function deleteProfileBookmark(profileId, input) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  let bookmarks;
  store.update((next) => {
    const profile = next.profiles.find((item) => item.id === profileKey);
    if (!profile) throw new Error('环境不存在');
    bookmarks = deleteBookmarkRecord(profile.bookmarks, input);
    profile.bookmarks = bookmarks;
  });
  broadcastState();
  return { profileId: profileKey, bookmarks };
}

function sendBrowserConnectionDetails(profileId) {
  const win = profileWindows.get(profileId);
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('browser-shell:connection-updated', profileConnectionDetails(profileId));
  } catch {
    // The shell may be closing; the next launch will receive query defaults.
  }
}

function broadcastBrowserConnectionDetails(nodeId = '') {
  const state = store.get();
  for (const profile of state.profiles) {
    if (!nodeId || profile.nodeId === nodeId) sendBrowserConnectionDetails(profile.id);
  }
}

function sendBrowserSettings(profileId) {
  const win = profileWindows.get(profileId);
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('browser-shell:settings-updated', publicBrowserSettings(store.get(), profileId));
  } catch {
    // The shell may be closing; the next launch will receive current settings.
  }
}

function sendBrowserProfileDetails(profile) {
  const profileId = safeProfileId(profile?.id);
  const win = profileWindows.get(profileId);
  if (!profileId || !win || win.isDestroyed()) return;
  try {
    win.setTitle?.(`${safeText(profile.name, '浏览器环境')} · ${BRAND_NAME}`);
    win.webContents.send('browser-shell:profile-updated', {
      profileId,
      name: safeText(profile.name, '浏览器环境'),
      startUrl: safeText(profile.startUrl, 'about:blank'),
    });
  } catch {
    // The shell may be closing; the next launch will receive current details.
  }
}

function broadcastBrowserSettings() {
  for (const profileId of profileWindows.keys()) sendBrowserSettings(profileId);
}

function ensureUrl(input, fallback) {
  const value = safeText(input) || safeText(fallback) || 'about:blank';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 地址');
    return url.toString();
  } catch (error) {
    if (value === 'about:blank') return value;
    throw new Error(error.message || '启动地址无效');
  }
}

function publicExitIp(value) {
  const candidate = normalizeIp(value);
  return isPublicIp(candidate) ? candidate.toLowerCase() : '';
}

function normalizeProfile(input) {
  const current = input && typeof input === 'object' ? input : {};
  const name = safeText(current.name).slice(0, 80);
  if (!name) throw new Error('环境名称不能为空');
  const connectionMode = current.connectionMode === 'node' ? 'node' : 'direct';
  const state = store.get();
  const profileId = safeProfileId(current.id) || id('profile');
  const existingProfile = state.profiles.find((profile) => profile.id === profileId);
  if (connectionMode === 'node' && !state.nodes.some((node) => node.id === current.nodeId && node.supported !== false)) {
    throw new Error('所选节点不存在，请重新选择');
  }
  const now = new Date().toISOString();
  return {
    id: profileId,
    name,
    startUrl: ensureUrl(current.startUrl, state.settings.defaultStartUrl),
    connectionMode,
    nodeId: connectionMode === 'node' ? current.nodeId : null,
    note: safeText(current.note).slice(0, 240),
    color: /^#[0-9a-f]{6}$/i.test(current.color) ? current.color : '#4f8cff',
    bookmarks: normalizeBookmarks(current.bookmarks || existingProfile?.bookmarks),
    newTabSiteVisits: normalizeSiteVisits(existingProfile?.newTabSiteVisits),
    searchHistory: normalizeSearchHistory(existingProfile?.searchHistory),
    traffic: normalizeTraffic(existingProfile?.traffic),
    ...profileTestIdentity(current, existingProfile),
    createdAt: safeText(current.createdAt) || now,
    updatedAt: now,
    lastLaunchedAt: safeText(current.lastLaunchedAt),
    lastLaunchIp: publicExitIp(current.lastLaunchIp || existingProfile?.lastLaunchIp),
  };
}

function profileSaveConfig(profile) {
  const color = safeText(profile?.color).toLowerCase();
  return {
    connectionMode: profile?.connectionMode === 'node' ? 'node' : 'direct',
    nodeId: profile?.connectionMode === 'node' ? safeText(profile?.nodeId) : null,
    note: safeText(profile?.note || profile?.notes).slice(0, 240),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f8cff',
    bookmarks: normalizeBookmarks(profile?.bookmarks),
    testIdentityId: normalizeTestIdentityId(profile?.testIdentityId),
    testIdentityOrigins: normalizeTestIdentityOrigins(profile?.testIdentityOrigins),
  };
}

function profileSaveNeedsStopped(existingProfile, nextProfile) {
  if (!existingProfile || !nextProfile) return false;
  return JSON.stringify(profileSaveConfig(existingProfile)) !== JSON.stringify(profileSaveConfig(nextProfile));
}

function proxyForNode(node) {
  if (!node) return { mode: 'direct' };
  const protocol = node.protocol === 'socks5' ? 'socks5' : node.protocol;
  if (!['http', 'https', 'socks5'].includes(protocol)) {
    throw new Error(`暂不支持 ${node.protocol} 节点，请先转换为 HTTP 或 SOCKS5`);
  }
  const scheme = protocol === 'http' && node.tls ? 'https' : protocol;
  return {
    proxyRules: `${scheme}://${proxyHost(node.host)}:${node.port}`,
    proxyBypassRules: '<local>',
  };
}

function externalProxyArg(node) {
  if (!node) return null;
  const protocol = node.protocol === 'socks5' ? 'socks5' : node.protocol;
  if (!['http', 'https', 'socks5'].includes(protocol)) return null;
  const scheme = protocol === 'http' && node.tls ? 'https' : protocol;
  return `${scheme}://${proxyHost(node.host)}:${node.port}`;
}

function setWebRtcIpHandlingPolicy(contents, hasProxy) {
  if (!contents || typeof contents.setWebRTCIPHandlingPolicy !== 'function') return;
  try {
    contents.setWebRTCIPHandlingPolicy(hasProxy ? 'disable_non_proxied_udp' : 'default');
  } catch {
    // The contents may be tearing down while a profile is being stopped.
  }
}

async function startProxyCore({ kind, profileId, node, state }) {
  const selectedCore = node?.protocol === 'anytls' || node?.coreConfig?.type === 'anytls'
    ? 'singbox'
    : normalizeCore(kind || node?.core || state.settings.defaultCore);
  const info = corePathFor(selectedCore, state);
  if (!info.path) {
    throw new Error(`${selectedCore === 'singbox' ? 'sing-box' : 'Xray'} 核心未配置；请将官方核心放入 vendor/cores，或在设置中指定本地路径`);
  }
  const options = {
    profileId,
    node,
    executable: info.path,
    rootDir: app.getPath('userData'),
  };
  return selectedCore === 'singbox' ? startSingbox(options) : startCore(options);
}

function toggleGuestDevTools(contents) {
  if (!contents || contents.isDestroyed?.()) return;
  try {
    if (contents.isDevToolsOpened?.()) contents.closeDevTools?.();
    else contents.openDevTools?.({ mode: 'detach' });
  } catch {
    // The guest may be tearing down while the shortcut is being handled.
  }
}

function profileIdForGuestContents(contents) {
  for (const [profileId, guests] of profileGuests.entries()) {
    if (guests?.has(contents)) return profileId;
  }
  return '';
}

function performGuestGestureAction(contents, action) {
  if (!contents || contents.isDestroyed?.()) return;
  try {
    if (action === 'back' && contents.canGoBack?.()) contents.goBack();
    else if (action === 'forward' && contents.canGoForward?.()) contents.goForward();
    else if (action === 'reload') contents.reload();
    else if (action === 'devtools') toggleGuestDevTools(contents);
  } catch {
    // Navigation may race with a guest teardown.
  }
}

function sendProfileTabOpen(profileId, url, focus = true) {
  const hostWindow = profileWindows.get(profileId);
  const targetUrl = safeText(url);
  if (!hostWindow || hostWindow.isDestroyed() || !isAllowedNavigation(targetUrl)) return false;
  try {
    hostWindow.webContents.send('browser-shell:open-new-tab', {
      url: targetUrl,
      focus: focus !== false,
    });
    return true;
  } catch {
    return false;
  }
}

function downloadGuestResource(contents, url) {
  const targetUrl = safeText(url);
  if (!targetUrl || !isAllowedNavigation(targetUrl) || typeof contents?.downloadURL !== 'function') return false;
  try {
    if (/^(?:blob|data):/i.test(targetUrl) && typeof contents.executeJavaScript === 'function') {
      const encoded = JSON.stringify(targetUrl)?.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      if (!encoded || encoded.length > 1024 * 1024) return false;
      void contents.executeJavaScript(`(() => { const link = document.createElement('a'); link.href = ${encoded}; link.download = ''; link.click(); })()`, true);
      return true;
    }
    contents.downloadURL(targetUrl);
    return true;
  } catch {
    return false;
  }
}

function toggleGuestMedia(contents, params = {}) {
  if (typeof contents?.executeJavaScript !== 'function') return;
  const x = Number(params.x);
  const y = Number(params.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const script = `(() => { const media = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)}); if (!(media instanceof HTMLMediaElement)) return false; if (media.paused) { void media.play(); } else media.pause(); return true; })()`;
  void contents.executeJavaScript(script, true).catch(() => {});
}

function showGuestMediaControls(contents, params = {}) {
  if (typeof contents?.executeJavaScript !== 'function') return;
  const x = Number(params.x);
  const y = Number(params.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const script = `(() => { const media = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)}); if (!(media instanceof HTMLMediaElement)) return false; media.controls = true; return true; })()`;
  void contents.executeJavaScript(script, true).catch(() => {});
}

async function showPageQrCode(hostWindow, pageUrl) {
  const targetUrl = safeText(pageUrl);
  if (!targetUrl || !hostWindow || hostWindow.isDestroyed()) return;
  try {
    const image = await QRCode.toDataURL(targetUrl, { errorCorrectionLevel: 'M', margin: 2, width: 280 });
    const escapedUrl = targetUrl.replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]));
    const qrWindow = new BrowserWindow({
      parent: hostWindow,
      modal: false,
      width: 360,
      height: 420,
      resizable: false,
      title: '页面二维码',
      backgroundColor: '#fff',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const html = `<!doctype html><meta charset="utf-8"><title>页面二维码</title><style>body{margin:0;padding:24px;background:#fff;color:#172033;font-family:Segoe UI,Microsoft YaHei,sans-serif;text-align:center}img{display:block;width:280px;height:280px;margin:0 auto 18px}p{margin:0;word-break:break-all;font-size:12px;line-height:1.5;color:#526078}</style><img src="${image}" alt="页面二维码"><p>${escapedUrl}</p>`;
    await qrWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    qrWindow.show();
  } catch (error) {
    console.error(`生成页面二维码失败：${error.message}`);
  }
}

function guestContextMenuTemplate(profileId, hostWindow, guestContents, params = {}) {
  const linkUrl = safeText(params.linkURL);
  const mediaUrl = safeText(params.srcURL);
  const mediaType = String(params.mediaType || 'none').toLowerCase();
  const selection = safeText(params.selectionText);
  const menu = [];
  const addSeparator = () => {
    if (menu.length && menu.at(-1).type !== 'separator') menu.push({ type: 'separator' });
  };
  const openTab = (url, focus = true) => sendProfileTabOpen(profileId, url, focus);
  const copy = (value) => {
    if (value) clipboard.writeText(value);
  };

  if (linkUrl) {
    menu.push(
      { label: '在新标签页中打开链接', click: () => openTab(linkUrl, true) },
      { label: '在新窗口中打开链接', click: () => openTab(linkUrl, true) },
      { label: '在拆分视图中打开链接', click: () => openTab(linkUrl, true) },
      { label: '在隐身窗口中打开链接', click: () => openTab(linkUrl, true) },
      { label: '以其他身份打开链接', submenu: [{ label: '当前浏览器环境', click: () => openTab(linkUrl, true) }] },
      { label: '保存链接为…', enabled: isAllowedNavigation(linkUrl), click: () => downloadGuestResource(guestContents, linkUrl) },
      { label: '复制链接地址', click: () => copy(linkUrl) },
    );
    addSeparator();
  }

  if (mediaType === 'video' || mediaType === 'audio') {
    const label = mediaType === 'video' ? '视频' : '音频';
    const mediaDownloadLabel = mediaType === 'video' ? '下载视频' : '下载音频';
    menu.push(
      { label: '播放/暂停', click: () => toggleGuestMedia(guestContents, params) },
      { label: '显示控制条', click: () => showGuestMediaControls(guestContents, params) },
      { label: `在新标签页中打开${label}`, enabled: isAllowedNavigation(mediaUrl), click: () => openTab(mediaUrl, true) },
      { label: mediaDownloadLabel, enabled: isAllowedNavigation(mediaUrl), click: () => downloadGuestResource(guestContents, mediaUrl) },
      { label: `复制${label}地址`, enabled: Boolean(mediaUrl), click: () => copy(mediaUrl) },
    );
    addSeparator();
  } else if (mediaType === 'image' && mediaUrl) {
    menu.push(
      { label: '在新标签页中打开图片', click: () => openTab(mediaUrl, true) },
      { label: '图片另存为…', enabled: isAllowedNavigation(mediaUrl), click: () => downloadGuestResource(guestContents, mediaUrl) },
      { label: '复制图片地址', click: () => copy(mediaUrl) },
    );
    addSeparator();
  }

  if (selection) {
    menu.push(
      { role: 'copy', label: '复制', click: () => guestContents.copy?.() },
      { label: '搜索 Google', click: () => openTab(`https://www.google.com/search?q=${encodeURIComponent(selection)}`, true) },
    );
    addSeparator();
  }

  if (params.isEditable) {
    menu.push(
      { role: 'undo', label: '撤销', click: () => guestContents.undo?.() },
      { role: 'redo', label: '重做', click: () => guestContents.redo?.() },
      { type: 'separator' },
      { role: 'cut', label: '剪切', click: () => guestContents.cut?.() },
      { role: 'copy', label: '复制', click: () => guestContents.copy?.() },
      { role: 'paste', label: '粘贴', click: () => guestContents.paste?.() },
      { role: 'delete', label: '删除', click: () => guestContents.delete?.() },
      { type: 'separator' },
      { role: 'selectAll', label: '全选', click: () => guestContents.selectAll?.() },
    );
  } else if (!linkUrl && !selection && mediaType === 'none') {
    menu.push(
      { label: '后退', enabled: guestContents.canGoBack?.() === true, click: () => guestContents.goBack?.() },
      { label: '前进', enabled: guestContents.canGoForward?.() === true, click: () => guestContents.goForward?.() },
      { label: '重新加载', click: () => guestContents.reload?.() },
      { type: 'separator' },
      { label: '另存为…', enabled: isAllowedNavigation(params.pageURL), click: () => downloadGuestResource(guestContents, params.pageURL) },
      { label: '打印…', click: () => guestContents.print?.({}) },
      { label: '投放…', click: () => guestContents.executeJavaScript?.('navigator.mediaSession?.playbackState || "当前页面暂不支持投放"', true) },
      { label: '为此页面创建二维码', enabled: Boolean(params.pageURL), click: () => void showPageQrCode(hostWindow, params.pageURL) },
      { label: '翻译成中文（简体）', enabled: isAllowedNavigation(params.pageURL), click: () => openTab(`https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(params.pageURL)}`, true) },
      { type: 'separator' },
      { role: 'selectAll', label: '全选', click: () => guestContents.selectAll?.() },
    );
  }

  if (menu.length) addSeparator();
  menu.push({ label: '检查', click: () => guestContents.openDevTools?.({ mode: 'detach' }) });
  const filtered = menu.filter((item, index) => item.type !== 'separator' || (index > 0 && index < menu.length - 1));
  return filtered;
}

function showGuestContextMenu(profileId, hostWindow, guestContents, params) {
  const template = guestContextMenuTemplate(profileId, hostWindow, guestContents, params);
  if (!template.length || !hostWindow || hostWindow.isDestroyed()) return;
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: hostWindow });
}

function handleGuestShortcut(event, input, contents) {
  if (!input || !contents) return;
  if (input.type !== 'keyDown') return;
  const key = safeText(input.key || input.keyCode).toLowerCase();
  const profileId = profileIdForGuestContents(contents);
  const hostWindow = profileWindows.get(profileId);
  if ((input.control || input.meta) && key === 't') {
    event.preventDefault();
    if (hostWindow && !hostWindow.isDestroyed()) hostWindow.webContents.send('browser-shell:open-new-tab');
    return;
  }
  if (input.control && input.alt && key === 'd') {
    event.preventDefault();
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.webContents.send('browser-shell:toggle-bookmark-bar');
    }
    return;
  }
  const settings = store?.get?.().settings || {};
  const shortcuts = normalizedBrowserShortcuts(settings.browserShortcuts);
  if (shortcutMatches(input, shortcuts.reload)) {
    event.preventDefault();
    contents.reload?.();
  } else if (shortcutMatches(input, shortcuts.devtools)) {
    event.preventDefault();
    toggleGuestDevTools(contents);
  }
}

function handleGuestInput(contents, input) {
  if (!input || !contents) return;
  const gesture = normalizedMouseGesture(store?.get?.().settings?.mouseGesture);
  if (!gesture.enabled) {
    guestGestureStates.delete(contents);
    return;
  }
  const button = typeof input.button === 'string'
    ? input.button.toLowerCase()
    : ({ 0: 'left', 1: 'middle', 2: 'right' })[input.button] || '';
  let state = guestGestureStates.get(contents);
  if (input.type === 'mouseDown' && button === gesture.button) {
    state = {
      active: true,
      button,
      segmentStartX: Number(input.x) || 0,
      segmentStartY: Number(input.y) || 0,
      directions: [],
      suppressContextMenu: false,
    };
    guestGestureStates.set(contents, state);
    return;
  }
  if (!state?.active || (input.type !== 'mouseMove' && button !== state.button)) return;
  if (input.type === 'mouseMove') {
    const x = Number(input.x) || 0;
    const y = Number(input.y) || 0;
    const dx = x - state.segmentStartX;
    const dy = y - state.segmentStartY;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    if (distance < gesture.threshold) return;
    const direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    if (state.directions[state.directions.length - 1] !== direction) {
      state.directions.push(direction);
    }
    state.segmentStartX = x;
    state.segmentStartY = y;
    return;
  }
  if (input.type === 'mouseUp') {
    state.active = false;
    const matched = state.directions.length === gesture.sequence.length
      && state.directions.every((direction, index) => direction === gesture.sequence[index]);
    state.suppressContextMenu = matched || state.suppressContextMenu;
    if (matched) performGuestGestureAction(contents, gesture.action);
  }
}

function createShellWindow(profile, node, displayNode = node) {
  const partition = profilePartition(profile.id);
  const profileSession = session.fromPartition(partition);
  const win = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: `${profile.name} · ${BRAND_NAME}`,
    icon: BRAND_NATIVE_ICON_PATH,
    backgroundColor: '#10141c',
    // Let the shell's tab strip occupy the top row while keeping native
    // Windows controls available through Electron's title-bar overlay.
    ...(process.platform === 'win32' || process.platform === 'linux'
      ? {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#111722',
          symbolColor: '#92a1b8',
          height: 42,
        },
      }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'browser-shell-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: true,
      // Keep profile pages and embedded extension content active when minimized.
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);
  setWebRtcIpHandlingPolicy(win.webContents, Boolean(node));

  profileWindows.set(profile.id, win);
  activeProfileWindows.add(profile.id);
  profileAuth.set(win.webContents.id, node || null);
  profileSessions.set(profileSession, node || null);
  profileSessionRefs.set(profile.id, profileSession);
  profileGuests.set(profile.id, new Set());
  attachProfileTestIdentity(profileSession, profile);

  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.preload = path.join(__dirname, 'browser-password-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    if (params.src && !isAllowedNavigation(params.src)) event.preventDefault();
  });

  // Authentication requests from a <webview> use the guest WebContents ID.
  // Map that guest to the same node as soon as it is attached.
  win.webContents.on('did-attach-webview', (_event, guestContents) => {
    const guestContentsId = guestContents.id;
    const guests = profileGuests.get(profile.id);
    if (guests) guests.add(guestContents);
    // WebRTC policy belongs to WebContents, not Session. Apply it to every
    // guest before the page can gather ICE candidates.
    setWebRtcIpHandlingPolicy(guestContents, Boolean(node));
    profileAuth.set(guestContentsId, node || null);
    guestContents.setWindowOpenHandler((details) => {
      const targetUrl = safeText(details?.url) || 'about:blank';
      const focus = details?.disposition !== 'background-tab';
      sendProfileTabOpen(profile.id, targetUrl, focus);
      return { action: 'deny' };
    });
    guestContents.on('before-input-event', (event, input) => handleGuestShortcut(event, input, guestContents));
    guestContents.on('input-event', (_event, input) => handleGuestInput(guestContents, input));
    guestContents.on('context-menu', (event, params) => {
      const gesture = guestGestureStates.get(guestContents);
      if (gesture?.suppressContextMenu) {
        event.preventDefault();
        if (gesture) gesture.suppressContextMenu = false;
        return;
      }
      event.preventDefault();
      showGuestContextMenu(profile.id, profileWindows.get(profile.id), guestContents, params);
    });
    guestContents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault();
    });
    guestContents.once('destroyed', () => {
      profileAuth.delete(guestContentsId);
      profileGuests.get(profile.id)?.delete(guestContents);
    });
  });

  const shellContentsId = win.webContents.id;
  win.webContents.setWindowOpenHandler((details) => {
    const targetUrl = safeText(details?.url) || 'about:blank';
    sendProfileTabOpen(profile.id, targetUrl, details?.disposition !== 'background-tab');
    return { action: 'deny' };
  });
  let closeRequested = false;
  win.on('close', (event) => {
    // Closing a profile window is the same lifecycle boundary as pressing
    // the manager's stop action. Keep the window alive until its runtime is
    // cleaned up; app shutdown uses the separate global cleanup path below.
    if (quitCleanupStarted) return;
    event.preventDefault();
    if (closeRequested || profileStops.has(profile.id)) return;
    closeRequested = true;
    void stopProfile(profile.id).catch((error) => {
      console.error(`关闭环境时停止失败：${error.message}`);
      if (!win.isDestroyed()) {
        try { win.destroy(); } catch { /* The window may have closed concurrently. */ }
      }
      void stopProfile(profile.id).catch((retryError) => {
        console.error(`关闭环境时重复停止失败：${retryError.message}`);
      });
    });
  });
  win.on('closed', () => {
    detachProfileTestIdentity(profileSession);
    profileWindows.delete(profile.id);
    activeProfileWindows.delete(profile.id);
    profileRuntimeModes.delete(profile.id);
    retiredProfileWindows.delete(win);
    profileAuth.delete(shellContentsId);
    profileSessions.delete(profileSession);
    profileSessionRefs.delete(profile.id);
    profileGuests.delete(profile.id);
    profileAgentFileGrants.delete(profile.id);
    broadcastState();
    if (!quitCleanupStarted && !profileStops.has(profile.id)
      && (externalProcesses.has(profile.id) || coreProcesses.has(profile.id))) {
      void stopProfile(profile.id).catch((error) => {
        console.error(`关闭环境时停止运行时失败：${error.message}`);
      });
    }
  });

  const shellPath = path.join(__dirname, '..', 'renderer', 'browser-shell.html');
  const connection = connectionDetails(displayNode, displayNode ? null : directConnectionHealth);
  // Startup updates can arrive before the shell renderer registers its listeners.
  win.webContents.once('did-finish-load', () => {
    sendBrowserConnectionDetails(profile.id);
    const latestProfile = store.get().profiles.find((item) => item.id === profile.id);
    if (latestProfile) sendBrowserProfileDetails(latestProfile);
  });
  win.loadFile(shellPath, {
    query: {
      profileId: profile.id,
      profileName: profile.name,
      brandName: BRAND_NAME,
      startUrl: profile.startUrl,
      partition,
      connectionLabel: connection.label,
      connectionCountry: connection.country,
      connectionIp: connection.ip,
      connectionLatency: connection.latency,
    },
  });
  return win;
}

async function launchWithElectron(profile, node, connectionNode = node) {
  const partition = profilePartition(profile.id);
  const ses = session.fromPartition(partition);
  configureProfileSession(profile.id, ses);
  await ses.setProxy(proxyForNode(node));
  if (typeof ses.closeAllConnections === 'function') await ses.closeAllConnections();
  const extensionResult = await syncProfileExtensions(profile.id, ses);
  startProfileTrafficTracker(profile.id, ses);
  let win;
  try {
    const latestProfile = store.get().profiles.find((item) => item.id === profile.id);
    if (!latestProfile) throw new Error('环境不存在');
    profile.name = latestProfile.name;
    profile.startUrl = ensureUrl(latestProfile.startUrl, store.get().settings.defaultStartUrl);
    win = createShellWindow(profile, node, connectionNode);
  } catch (error) {
    stopProfileTraffic(profile.id);
    throw error;
  }
  profileRuntimeModes.set(profile.id, 'electron');
  win.once('ready-to-show', () => win.show());
  return {
    mode: 'electron',
    profileId: profile.id,
    warning: [
      node && (node.username || node.password) && node.protocol === 'socks5'
        ? 'Chromium 的 SOCKS5 认证兼容性有限；建议使用无认证 SOCKS5 或由本地代理客户端完成认证。'
        : '',
      ...extensionResult.warnings,
    ].filter(Boolean).join('；') || undefined,
  };
}

async function launchWithExternalEngine(profile, node, enginePath) {
  const profileId = safeProfileId(profile.id);
  if (!profileId) throw new Error('环境标识无效');
  const profileDataPath = path.join(app.getPath('userData'), 'profiles', profileId);
  fs.mkdirSync(profileDataPath, { recursive: true });
  const extensionPaths = store.get().extensions
    .filter((record) => extensionProfileIds(record).includes(profileId) && record.path && fs.existsSync(record.path))
    .map((record) => record.path);
  const proxyArg = externalProxyArg(node);
  const args = buildExternalEngineArgs({
    profileDataPath,
    startUrl: profile.startUrl,
    proxyArg,
    extensionPaths,
  });
  const child = spawn(enginePath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  externalProcesses.set(profile.id, child);
  child.on('error', (error) => {
    releaseRetiredExtensionRoots(profile.id);
    if (externalProcesses.get(profile.id) !== child) return;
    externalProcesses.delete(profile.id);
    broadcastState();
    console.error(`外部 Chromium 启动失败：${error.message}`);
    scheduleRuntimeCleanup(profile.id);
  });
  child.once('exit', () => {
    const isCurrent = externalProcesses.get(profile.id) === child;
    if (!isCurrent) {
      releaseRetiredExtensionRoots(profile.id);
      return;
    }
    externalProcesses.delete(profile.id);
    profileRuntimeModes.delete(profile.id);
    releaseRetiredExtensionRoots(profile.id);
    broadcastState();
    scheduleRuntimeCleanup(profile.id);
  });
  child.unref();
  try {
    await waitForProcessSpawn(child);
  } catch (error) {
    externalProcesses.delete(profile.id);
    profileRuntimeModes.delete(profile.id);
    terminateExternalProcess(child);
    throw new Error(`外部 Chromium 启动失败：${error.message}`);
  }
  if (externalProcesses.get(profile.id) !== child || child.exitCode !== null) {
    externalProcesses.delete(profile.id);
    profileRuntimeModes.delete(profile.id);
    throw new Error('外部 Chromium 启动后立即退出，请检查该浏览器版本和用户数据目录');
  }
  profileRuntimeModes.set(profile.id, 'external');
  broadcastState();
  const warnings = [];
  if (profile.testIdentityOrigins?.length) {
    warnings.push('授权测试身份仅在内置 Electron 引擎中按来源添加请求头；外部 Chromium 不支持该功能。');
  }
  if (node && (node.username || node.password)) {
    warnings.push('外部 Chromium 启动不会自动填充代理凭据，请使用无认证本地代理或在系统代理层处理认证。');
  }
  return {
    mode: 'external',
    profileId: profile.id,
    warning: warnings.join('；') || undefined,
  };
}

function createProfileLaunchConfirmation(profile, previousIp, currentIp) {
  const confirmationToken = crypto.randomUUID();
  profileLaunchConfirmations.set(profile.id, {
    confirmationToken,
    previousIp,
    currentIp,
    connectionMode: profile.connectionMode === 'node' ? 'node' : 'direct',
    nodeId: safeText(profile.nodeId),
    createdAt: Date.now(),
  });
  return {
    mode: 'confirmation-required',
    confirmationRequired: true,
    profileId: profile.id,
    confirmationToken,
    previousIp,
    currentIp,
  };
}

async function launchProfileInternal(profileId, options = {}) {
  if (profileStops.has(profileId)) throw new Error('环境正在停止，请稍后重试');
  const state = store.get();
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error('环境不存在');
  const runtimeProfile = {
    ...profile,
    startUrl: ensureUrl(profile.startUrl, state.settings.defaultStartUrl),
  };
  if (isProfileRunning(profileId)) {
    const existing = profileWindows.get(profileId);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
    }
    hideManagerWindowToTray();
    return { mode: 'existing', profileId };
  }
  const rawNode = profile.connectionMode === 'node'
    ? state.nodes.find((node) => node.id === profile.nodeId)
    : null;
  const node = hydrateNode(rawNode);
  if (profile.connectionMode === 'node' && !node) throw new Error('节点不存在');

  let launchIp = publicExitIp(options.checkedIp);
  if (!options.ipChecked) {
    let connectionCheck;
    try {
      connectionCheck = await checkProfileConnection(profileId);
    } catch {
      // An unavailable IP probe must not change the existing launch behavior.
    }
    launchIp = publicExitIp(connectionCheck?.ipAddress);
    const previousIp = publicExitIp(profile.lastLaunchIp);
    if (previousIp && launchIp && previousIp !== launchIp) {
      return createProfileLaunchConfirmation(profile, previousIp, launchIp);
    }
  }

  const enginePath = validateEnginePath(state.settings.enginePath);
  let effectiveNode = node;
  let coreRuntime;
  let coreRuntimeRecord;
  if (node?.requiresCore) {
    const selectedCore = node.protocol === 'anytls' || node.coreConfig?.type === 'anytls'
      ? 'singbox'
      : normalizeCore(node.core || state.settings.defaultCore);
    coreRuntime = await startProxyCore({ kind: selectedCore, profileId, node, state });
    const runtime = { ...coreRuntime, core: selectedCore, nodeId: node.id, exited: false };
    coreRuntimeRecord = runtime;
    coreProcesses.set(profileId, runtime);
    coreRuntime.child.once('exit', () => {
      runtime.exited = true;
      if (coreProcesses.get(profileId) === runtime) {
        coreProcesses.delete(profileId);
        cleanupRuntime(runtime);
        broadcastState();
        scheduleRuntimeCleanup(profileId);
      }
    });
    effectiveNode = { protocol: 'socks5', host: '127.0.0.1', port: coreRuntime.port };
  }
  let result;
  try {
    // A core can exit immediately after its port becomes reachable. Do not
    // start a browser against a dead local proxy, and re-check after launch
    // because the exit may race with browser startup.
    if (coreRuntimeRecord && !isCoreRuntimeAlive(coreRuntimeRecord)) {
      throw new Error('代理核心启动后立即退出，请检查节点或核心配置');
    }
    const latestProfile = store.get().profiles.find((item) => item.id === profileId);
    if (!latestProfile) throw new Error('环境不存在');
    runtimeProfile.name = latestProfile.name;
    runtimeProfile.startUrl = ensureUrl(latestProfile.startUrl, store.get().settings.defaultStartUrl);
    if (enginePath) {
      result = await launchWithExternalEngine(runtimeProfile, effectiveNode, enginePath);
    } else {
      result = await launchWithElectron(runtimeProfile, effectiveNode, node || effectiveNode);
    }
    if (coreRuntimeRecord && !isCoreRuntimeAlive(coreRuntimeRecord)) {
      throw new Error('代理核心在浏览器启动期间退出，环境未启动');
    }
    if (enginePath) {
      const external = externalProcesses.get(profileId);
      if (!external || childHasExited(external)) {
        throw new Error('外部 Chromium 启动后立即退出，请检查该浏览器版本和用户数据目录');
      }
    }
  } catch (error) {
    const createdWindow = profileWindows.get(profileId);
    if (createdWindow && !createdWindow.isDestroyed()) {
      try { await detachProfileWindow(profileId, createdWindow); } catch { /* Best effort after a failed launch. */ }
    }
    await stopTrackedExternalProcess(profileId);
    await stopTrackedCoreProcess(profileId);
    if (!externalProcesses.has(profileId) && !profileWindows.has(profileId)) profileRuntimeModes.delete(profileId);
    throw error;
  }
  if (profileStops.has(profileId) || !store.get().profiles.some((item) => item.id === profileId)) {
    const createdWindow = profileWindows.get(profileId);
    if (createdWindow) await detachProfileWindow(profileId, createdWindow);
    await stopTrackedExternalProcess(profileId);
    profileRuntimeModes.delete(profileId);
    await stopTrackedCoreProcess(profileId);
    throw new Error('环境在启动过程中被停止');
  }
  store.update((next) => {
    const item = next.profiles.find((entry) => entry.id === profileId);
    if (item) {
      item.lastLaunchedAt = new Date().toISOString();
      if (launchIp) item.lastLaunchIp = launchIp;
    }
  });
  broadcastState();
  hideManagerWindowToTray();
  if (node?.id) void checkNodeConnection(node.id).catch(() => {});
  return result;
}

async function launchProfile(profileId, options = {}) {
  if (profileStops.has(profileId)) throw new Error('环境正在停止，请稍后重试');
  const pending = profileLaunches.get(profileId);
  if (pending) return pending;
  const launch = launchProfileInternal(profileId, options);
  profileLaunches.set(profileId, launch);
  try {
    return await launch;
  } finally {
    if (profileLaunches.get(profileId) === launch) {
      profileLaunches.delete(profileId);
      scheduleRuntimeCleanup(profileId);
    }
  }
}

async function resolveProfileLaunchConfirmation(profileId, confirmationToken, confirmed) {
  const profileKey = safeProfileId(profileId);
  const challenge = profileLaunchConfirmations.get(profileKey);
  if (!challenge || challenge.confirmationToken !== safeText(confirmationToken)) {
    throw new Error('启动确认已失效，请重新点击启动');
  }
  profileLaunchConfirmations.delete(profileKey);
  if (Date.now() - challenge.createdAt > PROFILE_LAUNCH_CONFIRMATION_TTL_MS) {
    throw new Error('启动确认已过期，请重新点击启动');
  }
  if (!confirmed) return { profileId: profileKey, cancelled: true };

  const profile = store.get().profiles.find((item) => item.id === profileKey);
  if (!profile
    || (profile.connectionMode === 'node' ? 'node' : 'direct') !== challenge.connectionMode
    || safeText(profile.nodeId) !== challenge.nodeId
    || publicExitIp(profile.lastLaunchIp) !== challenge.previousIp) {
    throw new Error('环境连接已变化，请重新点击启动并确认');
  }
  return launchProfile(profileKey, { ipChecked: true, checkedIp: challenge.currentIp });
}

async function detachProfileWindow(profileId, win) {
  if (!win || win.isDestroyed()) return;
  const shellContentsId = win.webContents.id;
  try { win.hide(); } catch { /* The window may have closed concurrently. */ }

  // Electron 44 can block when executeJavaScript/close touches a live webview.
  // Ask the local shell renderer to remove it and only wait on its destroyed event.
  if (!quitCleanupStarted) {
    try {
      win.webContents.send('browser-shell:teardown');
    } catch {
      // The renderer may already be closing; continue with native teardown.
    }
    await waitForGuestTeardown(profileId, PROFILE_TEARDOWN_TIMEOUT_MS);
  }
  const profileSession = profileSessionRefs.get(profileId);
  for (const [panelKey, panel] of extensionPanelWindows.entries()) {
    if (!panelKey.startsWith(`${profileId}:`)) continue;
    extensionPanelWindows.delete(panelKey);
    if (!panel.isDestroyed()) panel.close();
  }
  if (profileSession) {
    const records = store.get().extensions.filter((record) => extensionProfileIds(record).includes(profileId));
    for (const record of records) await unloadSessionExtension(profileId, profileSession, record);
    detachProfileTestIdentity(profileSession);
  }
  activeProfileWindows.delete(profileId);
  profileWindows.delete(profileId);
  profileAuth.delete(shellContentsId);
  if (profileSession) profileSessions.delete(profileSession);
  profileSessionRefs.delete(profileId);
  profileGuests.delete(profileId);
  profileAgentFileGrants.delete(profileId);
  profileRuntimeModes.delete(profileId);
  const destroyed = await destroyProfileWindow(win);
  if (!destroyed && !win.isDestroyed()) retiredProfileWindows.add(win);
}

function childHasExited(child) {
  if (!child) return true;
  return child.exitCode != null || child.signalCode != null;
}

function isCoreRuntimeAlive(runtime) {
  return Boolean(runtime?.child) && !runtime.exited && !childHasExited(runtime.child);
}

function profileRequiresCore(profileId) {
  const state = store?.get?.();
  const profile = state?.profiles?.find((item) => item.id === profileId);
  if (!profile || profile.connectionMode !== 'node') return false;
  const node = state.nodes?.find((item) => item.id === profile.nodeId);
  return Boolean(node?.requiresCore || node?.coreConfig);
}

function scheduleRuntimeCleanup(profileId) {
  if (quitCleanupStarted) return;
  setTimeout(() => {
    if (quitCleanupStarted || profileStops.has(profileId) || profileLaunches.has(profileId)) return;
    const browserActive = profileWindows.has(profileId) || externalProcesses.has(profileId);
    const coreActive = coreProcesses.has(profileId);
    const coreExpected = profileRequiresCore(profileId);
    if (!((coreActive && !browserActive) || (coreExpected && browserActive && !coreActive))) return;
    void stopProfile(profileId).catch((error) => {
      console.error(`运行时退出后停止环境失败：${error.message}`);
    });
  }, 0);
}

function waitForChildExit(child, timeoutMs = 2500) {
  if (childHasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const onError = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function stopTrackedExternalProcess(profileId) {
  const child = externalProcesses.get(profileId);
  if (!child) return true;
  terminateExternalProcess(child);
  const exited = await waitForChildExit(child);
  if (!exited) return false;
  if (externalProcesses.get(profileId) === child) externalProcesses.delete(profileId);
  releaseRetiredExtensionRoots(profileId);
  return true;
}

async function stopTrackedCoreProcess(profileId) {
  const runtime = coreProcesses.get(profileId);
  if (!runtime) return true;
  terminateCore(runtime.child);
  const exited = await waitForChildExit(runtime.child);
  if (!exited) return false;
  cleanupRuntime(runtime);
  if (coreProcesses.get(profileId) === runtime) coreProcesses.delete(profileId);
  return true;
}

function settleWithin(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    Promise.resolve(promise).then(
      () => finish(true),
      () => finish(false),
    );
  });
}

function waitForGuestTeardown(profileId, timeoutMs) {
  const guests = profileGuests.get(profileId);
  if (!guests || guests.size === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const current = profileGuests.get(profileId);
      if (!current || current.size === 0 || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(!current || current.size === 0);
      }
    }, 25);
  });
}

function destroyProfileWindow(win, timeoutMs = PROFILE_TEARDOWN_TIMEOUT_MS) {
  if (!win || win.isDestroyed()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (destroyed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      win.removeListener('closed', onClosed);
      resolve(destroyed);
    };
    const onClosed = () => finish(true);
    win.once('closed', onClosed);
    timer = setTimeout(() => finish(false), timeoutMs);
    try {
      win.destroy();
    } catch {
      finish(false);
    }
  });
}

async function stopProfile(profileId) {
  if (profileStops.has(profileId)) return { profileId };
  profileStops.add(profileId);
  try {
    let cleanupError;
    const pending = profileLaunches.get(profileId);
    if (pending) {
      try { await pending; } catch { /* Stop/delete should continue after a failed launch. */ }
    }
    const win = profileWindows.get(profileId);
    if (win && !win.isDestroyed()) {
      await detachProfileWindow(profileId, win);
    }
    stopProfileTraffic(profileId);
    const externalStopped = await stopTrackedExternalProcess(profileId);
    if (!externalStopped) cleanupError = new Error('外部 Chromium 未能及时退出，已停止继续清理；请关闭残留窗口后重试');
    const coreStopped = await stopTrackedCoreProcess(profileId);
    if (!coreStopped) cleanupError ||= new Error('代理核心未能及时退出，已停止继续清理；请稍后重试');
    if (!externalProcesses.has(profileId) && !profileWindows.has(profileId)) profileRuntimeModes.delete(profileId);
    broadcastState();
    if (cleanupError) throw cleanupError;
    return { profileId };
  } finally {
    profileStops.delete(profileId);
  }
}

async function switchProfileNode(profileId, nodeId) {
  const profileKey = safeText(profileId);
  const selectedNodeId = safeText(nodeId);
  const state = store.get();
  const profile = state.profiles.find((item) => item.id === profileKey);
  if (!profile) throw new Error('环境不存在');
  if (selectedNodeId && !state.nodes.some((node) => node.id === selectedNodeId && node.supported !== false)) {
    throw new Error('所选节点不存在或暂不支持');
  }
  const wasRunning = isProfileRunning(profileKey);
  if (wasRunning) await stopProfile(profileKey);
  store.update((next) => {
    const current = next.profiles.find((item) => item.id === profileKey);
    if (current) {
      current.connectionMode = selectedNodeId ? 'node' : 'direct';
      current.nodeId = selectedNodeId || null;
      current.updatedAt = new Date().toISOString();
    }
  });
  const launchResult = wasRunning ? await launchProfile(profileKey) : null;
  broadcastState();
  return {
    profileId: profileKey,
    nodeId: selectedNodeId || null,
    restarted: wasRunning,
    launchConfirmation: launchResult?.confirmationRequired ? launchResult : null,
  };
}

async function clearProfileData(profileId) {
  const normalizedId = safeProfileId(profileId);
  if (!normalizedId) throw new Error('环境标识无效');
  const partition = profilePartition(normalizedId);
  const profileSession = session.fromPartition(partition);
  if (typeof profileSession.closeAllConnections === 'function') {
    await settleWithin(profileSession.closeAllConnections(), PROFILE_TEARDOWN_TIMEOUT_MS);
  }
  if (!await settleWithin(profileSession.clearStorageData(), PROFILE_DATA_CLEAR_TIMEOUT_MS)) {
    throw new Error('清理环境存储超时，请稍后重试');
  }
  if (!await settleWithin(profileSession.clearCache(), PROFILE_DATA_CLEAR_TIMEOUT_MS)) {
    throw new Error('清理环境缓存超时，请稍后重试');
  }

  const root = path.resolve(app.getPath('userData'), 'profiles');
  const target = path.resolve(root, normalizedId);
  const relative = path.relative(root, target);
  if (relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

async function saveApplicationSettings(input, sender) {
  const settings = input && typeof input === 'object' ? input : {};
  const currentState = store.get();
  const nextEnginePath = settings.enginePath === undefined
    ? currentState.settings.enginePath
    : validateEnginePath(settings.enginePath);
  if (!sameEnginePath(currentState.settings.enginePath, nextEnginePath)
    && currentState.profiles.some((profile) => isProfileRunning(profile.id))) {
    throw new Error('请先停止运行中的环境，再切换浏览器引擎');
  }
  const corePaths = [];
  for (const [key, label] of [['xrayPath', 'Xray'], ['singboxPath', 'sing-box']]) {
    if (settings[key] === undefined) continue;
    const corePath = safeText(settings[key]);
    if (corePath && !safeCorePath(corePath)) throw new Error(`${label} 核心路径不存在`);
    corePaths.push([key, corePath]);
  }
  const browserSettings = await prepareBrowserSettings(settings, currentState.settings, sender);
  store.update((next) => {
    if (settings.enginePath !== undefined) next.settings.enginePath = nextEnginePath;
    for (const [key, corePath] of corePaths) {
      const previousPath = safeText(next.settings[key]);
      if (previousPath !== corePath && !samePath(previousPath, corePath)) {
        const prefix = key === 'singboxPath' ? 'singbox' : 'xray';
        next.settings[`${prefix}Version`] = '';
        next.settings[`${prefix}Sha256`] = '';
        next.settings[`${prefix}InstalledAt`] = '';
      }
      next.settings[key] = corePath;
    }
    if (settings.defaultCore !== undefined) next.settings.defaultCore = normalizeCore(settings.defaultCore);
    if (settings.defaultStartUrl) {
      next.settings.defaultStartUrl = ensureUrl(settings.defaultStartUrl, next.settings.defaultStartUrl);
    }
    Object.assign(next.settings, browserSettings.patch);
  });
  broadcastState();
  broadcastBrowserSettings();
  return {
    settings: publicBrowserSettings(store.get()),
    agentKeyStatus: browserSettings.agentKeyStatus,
    jevKeyStatus: browserSettings.jevKeyStatus,
  };
}

const AGENT_PROFILE_SETTING_KEYS = new Set([
  'agentApiUrl', 'agentProtocolSuffix', 'agentApi', 'agentProtocol', 'agentBaseUrl', 'agentModel',
  'agentContextBudgetTokens', 'agentMaxOutputTokens', 'agentTemperature', 'agentMaxSteps', 'agentReasoningEffort', 'agentKey',
  'agentToken', 'jevProvider', 'jevBaseUrl', 'jevModel', 'jevKey', 'jevToken',
]);

async function saveAgentProfileSettings(profileId, input, sender) {
  const profileKey = safeProfileId(profileId);
  if (!profileKey) throw new Error('环境标识无效');
  const state = store.get();
  if (!state.profiles.some((profile) => profile.id === profileKey)) throw new Error('环境不存在');
  const currentOverride = agentProfileOverride(state, profileKey) || {};
  const payload = input && typeof input === 'object' ? input : {};
  if (payload.useGlobal === true || payload.clearOverride === true) {
    store.update((next) => {
      if (next.settings.agentProfileOverrides) delete next.settings.agentProfileOverrides[profileKey];
    });
    broadcastState();
    broadcastBrowserSettings();
    return {
      profileId: profileKey,
      settings: publicBrowserSettings(store.get(), profileKey),
      agentKeyStatus: 'unchanged',
      jevKeyStatus: 'unchanged',
    };
  }
  const effective = { ...state.settings, ...currentOverride };
  const prepared = await prepareBrowserSettings(payload, effective, sender);
  const patch = Object.fromEntries(Object.entries(prepared.patch).filter(([key]) => AGENT_PROFILE_SETTING_KEYS.has(key)));
  if (payload.agentEnabled !== undefined) patch.enabled = Boolean(payload.agentEnabled);
  store.update((next) => {
    if (!next.settings.agentProfileOverrides || typeof next.settings.agentProfileOverrides !== 'object') {
      next.settings.agentProfileOverrides = {};
    }
    next.settings.agentProfileOverrides[profileKey] = {
      ...currentOverride,
      ...patch,
    };
  });
  broadcastState();
  broadcastBrowserSettings();
  return {
    profileId: profileKey,
    settings: publicBrowserSettings(store.get(), profileKey),
    agentKeyStatus: prepared.agentKeyStatus,
    jevKeyStatus: prepared.jevKeyStatus,
  };
}

function publicAgentProfileSettings(profileId) {
  const state = store.get();
  const profileKey = safeProfileId(profileId);
  if (!profileKey || !state.profiles.some((profile) => profile.id === profileKey)) throw new Error('环境不存在');
  const settings = publicBrowserSettings(state, profileKey);
  return {
    ...settings,
    configured: Boolean(agentProfileOverride(state, profileKey)),
  };
}

function passwordWebsiteOrigin(value) {
  try {
    const parsed = new URL(safeText(value));
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return parsed.origin.toLowerCase();
  } catch {
    return '';
  }
}

function passwordServiceForWebsite(value) {
  try {
    const parsed = new URL(safeText(value));
    return safeText(parsed.hostname, '网页登录');
  } catch {
    return '网页登录';
  }
}

function publicPasswordSuggestions(profileId, website) {
  const profileKey = requirePasswordProfile(store.get().profiles, profileId);
  const origin = passwordWebsiteOrigin(website);
  if (!origin) return [];
  return store.get().passwordEntries
    .filter((entry) => entry?.profileId === profileKey && passwordWebsiteOrigin(entry.website) === origin)
    .map(publicPasswordEntry);
}

function revealBrowserPassword(profileId, entryId, website) {
  const profileKey = requirePasswordProfile(store.get().profiles, profileId);
  const origin = passwordWebsiteOrigin(website);
  if (!origin) throw new Error('登录地址必须是有效的 HTTP 或 HTTPS 地址');
  const entry = store.get().passwordEntries.find((item) => (
    item?.id === safeText(entryId) && item?.profileId === profileKey
  ));
  if (!entry || passwordWebsiteOrigin(entry.website) !== origin) throw new Error('密码记录不存在');
  return getPasswordEntry(store.get().passwordEntries, profileKey, entry.id, revealSecret);
}

function saveBrowserPassword(profileId, input) {
  const profileKey = requirePasswordProfile(store.get().profiles, profileId);
  const source = input && typeof input === 'object' ? input : {};
  const website = safeText(source.website);
  const account = safeText(source.account);
  const password = typeof source.password === 'string' ? source.password : '';
  if (!password) throw new Error('密码不能为空');
  if (!account) throw new Error('账号不能为空');
  if (!passwordWebsiteOrigin(website)) throw new Error('登录地址必须是有效的 HTTP 或 HTTPS 地址');
  const origin = passwordWebsiteOrigin(website);
  const existing = store.get().passwordEntries.find((entry) => (
    entry?.profileId === profileKey
    && entry?.account === account
    && passwordWebsiteOrigin(entry.website) === origin
  ));
  const nextEntries = savePasswordEntry(store.get().passwordEntries, {
    id: existing?.id || '',
    service: safeText(source.service) || passwordServiceForWebsite(website),
    account,
    website,
    notes: safeText(source.notes),
    password,
  }, {
    profileId: profileKey,
    makeId: () => id('password'),
    protectSecret,
  });
  const entryId = existing?.id || nextEntries[0]?.id || '';
  store.update((next) => { next.passwordEntries = nextEntries; });
  broadcastState();
  return { profileId: profileKey, entryId, created: !existing };
}

function publicResult(result) {
  return { ok: true, ...result, state: publicState() };
}

function errorResult(error) {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function readResponseTextLimited(response, maxBytes) {
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('订阅内容超过 2MB 限制');
    return text;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('订阅内容超过 2MB 限制');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

const MAX_SUBSCRIPTION_BYTES = 2 * 1024 * 1024;
const MAX_SUBSCRIPTION_REDIRECTS = 5;

async function fetchSubscription(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('订阅地址无效');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('订阅地址必须使用 HTTP 或 HTTPS');
  if (parsed.username || parsed.password) throw new Error('订阅地址不得包含账号密码');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let current = parsed;
    for (let redirects = 0; ; redirects += 1) {
      // Chromium's network stack uses the Windows certificate store, which is
      // also what users expect from v2rayN/browser subscription requests. The
      // Node/Undici fetch path can reject otherwise trusted Windows chains.
      const requestFetch = typeof electronNet?.fetch === 'function'
        ? electronNet.fetch.bind(electronNet)
        : globalThis.fetch;
      let response;
      try {
        response = await requestFetch(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': `ChromeProfileBrowser/${APP_VERSION}` },
        });
      } catch (error) {
        if (controller.signal.aborted) throw new Error('订阅请求超时（15 秒）');
        const reason = error?.cause?.message || error?.message;
        throw new Error(reason ? `订阅连接失败：${reason}` : '订阅连接失败，请检查网络或证书');
      }
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        try {
          if (redirects >= MAX_SUBSCRIPTION_REDIRECTS) {
            throw new Error('订阅重定向次数过多');
          }
          current = resolveSubscriptionRedirect(current, location);
        } finally {
          try { await response.body?.cancel(); } catch { /* Ignore redirect body cleanup errors. */ }
        }
        continue;
      }
      if (!response.ok) throw new Error(`订阅请求失败：HTTP ${response.status}`);
      const length = Number(response.headers.get('content-length') || 0);
      if (length > MAX_SUBSCRIPTION_BYTES) throw new Error('订阅内容超过 2MB 限制');
      const text = await readResponseTextLimited(response, MAX_SUBSCRIPTION_BYTES);
      return { text, source: sanitizeSource(current.toString()), headers: response.headers };
    }
  } finally {
    clearTimeout(timer);
  }
}

function persistParsedNode(raw, sourceId = '', options = {}) {
  const defaultCore = normalizeCore(store.get().settings?.defaultCore);
  const retainSecrets = options.retainSecrets !== false;
  const plainSecrets = options.plainSecrets === true;
  const persistSecret = (value) => {
    const text = safeText(value);
    return !retainSecrets ? '' : plainSecrets ? text : protectSecret(text);
  };
  const node = {
    id: safeText(raw.id) || id('node'),
    name: safeText(raw.name, `${raw.protocol || 'node'} · ${raw.host}:${raw.port}`).slice(0, 120),
    protocol: safeText(raw.protocol).toLowerCase(),
    host: safeText(raw.host),
    port: Number(raw.port),
    username: persistSecret(raw.username),
    password: persistSecret(raw.password),
    udp: Boolean(raw.udp),
    source: sanitizeSource(raw.source),
    sourceType: raw.source && raw.source !== 'manual' ? 'subscription' : 'manual',
    importedAt: new Date().toISOString(),
  };
  const suppliedIp = safeText(raw.ipAddress || raw.ip || raw.resolvedIp);
  if (suppliedIp || net.isIP(node.host)) node.ipAddress = suppliedIp || node.host;
  const suppliedCountryValue = safeText(raw.country || raw.countryName || raw.countryCode);
  const suppliedCountry = countryName(suppliedCountryValue)
    || inferCountryFromText(suppliedCountryValue)
    || suppliedCountryValue.slice(0, 64);
  if (suppliedCountry) node.country = suppliedCountry;
  if (sourceId) node.sourceId = sourceId;
  if (raw.requiresCore || raw.coreConfig) {
    node.requiresCore = true;
    node.core = raw.protocol === 'anytls' || raw.coreConfig?.type === 'anytls'
      ? 'singbox'
      : (raw.core ? normalizeCore(raw.core) : defaultCore);
    node.coreConfig = !retainSecrets
      ? stripCoreSecrets(raw.coreConfig)
      : plainSecrets
        ? hydrateCoreConfig(raw.coreConfig)
        : protectCoreConfig(raw.coreConfig);
  }
  for (const key of ['tls', 'sni', 'remoteDns', 'skipCertVerify']) {
    if (raw[key] !== undefined) node[key] = raw[key];
  }
  if (raw.status === 'unsupported' || raw.unsupported === true || raw.supported === false) {
    return {
      ...node,
      supported: false,
      status: 'unsupported',
      reason: safeText(raw.reason, '该协议需要先转换为 HTTP 或 SOCKS5'),
      port: Number.isInteger(node.port) && node.port > 0 ? node.port : null,
      username: '',
      password: '',
    };
  }
  if (!node.host || !Number.isInteger(node.port) || node.port < 1 || node.port > 65535) return null;
  return node;
}

function manualFlag(value) {
  return value === true || value === 1 || /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function normalizeManualNode(input) {
  const current = input && typeof input === 'object' ? input : {};
  const protocol = safeText(current.protocol).toLowerCase();
  if (!['http', 'https', 'socks5'].includes(protocol)) {
    throw new Error('协议必须是 HTTP、HTTPS 或 SOCKS5');
  }
  const normalized = normalizeProxyNode({
    type: protocol,
    name: safeText(current.name).slice(0, 120) || undefined,
    server: safeText(current.host).slice(0, 253),
    port: current.port === undefined || current.port === null ? '' : String(current.port).trim(),
    username: safeText(current.username).slice(0, 256) || undefined,
    password: safeText(current.password).slice(0, 1024) || undefined,
    // HTTPS is represented as an HTTP proxy with a TLS transport flag.
    tls: protocol === 'https' || (protocol === 'http' && manualFlag(current.tls)),
    sni: (protocol === 'http' || protocol === 'https')
      ? safeText(current.sni).slice(0, 253) || undefined
      : undefined,
    remoteDns: protocol === 'socks5' && manualFlag(current.remoteDns),
  }, { source: 'manual' });
  if (normalized.status !== 'supported') {
    throw new Error(normalized.reason || '节点字段无效');
  }
  const suppliedId = safeText(current.id);
  normalized.id = /^[A-Za-z0-9_-]{1,128}$/.test(suppliedId) ? suppliedId : id('node');
  normalized.source = 'manual';
  return normalized;
}

function nodeStorageKey(node) {
  const keyParts = [
    node.protocol,
    String(node.host || '').toLowerCase(),
    node.port,
    node.name,
    node.tls ? 'tls' : '',
    node.remoteDns ? 'remote-dns' : '',
    node.sni || '',
    revealSecret(node.username),
    revealSecret(node.password),
    JSON.stringify(hydrateCoreConfig(node.coreConfig) || null),
  ];
  return JSON.stringify(keyParts);
}

async function saveManualNode(input, sender) {
  const normalized = normalizeManualNode(input);
  const currentState = store.get();
  const existing = currentState.nodes.find((node) => node.id === normalized.id);
  if (existing && !nodeHasSecrets(normalized) && nodeHasSecrets(existing)) {
    const hydrated = hydrateNode(existing);
    normalized.username = hydrated.username;
    normalized.password = hydrated.password;
  }
  const retention = await confirmSecretRetention([normalized], sender);
  const persisted = persistParsedNode(normalized, '', { retainSecrets: retention.retain });
  if (!persisted) throw new Error('节点地址或端口无效');

  if (existing && currentState.profiles.some((profile) => (
    profile.nodeId === existing.id && isProfileRunning(profile.id)
  ))) {
    throw new Error('该节点正在被运行中的环境使用，请先停止环境');
  }
  const duplicate = currentState.nodes.find((node) => (
    node.id !== persisted.id && nodeStorageKey(node) === nodeStorageKey(persisted)
  ));
  if (duplicate) throw new Error('相同的节点已经存在');

  if (existing) {
    persisted.importedAt = existing.importedAt || persisted.importedAt;
    persisted.lastCheckedAt = '';
    persisted.lastCheckPhase = '';
    persisted.latencyMs = null;
    persisted.lastCheckError = '';
  }
  store.update((next) => {
    const index = next.nodes.findIndex((node) => node.id === persisted.id);
    if (index === -1) next.nodes.push(persisted);
    else next.nodes[index] = persisted;
  });
  broadcastState();
  if (persisted.ipAddress) void lookupNodeCountry(persisted.ipAddress);
  return {
    node: publicNode(persisted),
    created: !existing,
    secretsRetained: retention.retain && nodeHasSecrets(normalized),
    secretsOmitted: !retention.retain && nodeHasSecrets(normalized),
  };
}

function updateCoreEndpoint(value, host, port) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = Array.isArray(value) ? value.slice() : { ...value };
  if (Object.prototype.hasOwnProperty.call(result, 'address')) result.address = host;
  else if (Object.prototype.hasOwnProperty.call(result, 'server')) result.server = host;
  else if (Object.prototype.hasOwnProperty.call(result, 'host')) result.host = host;
  if (Object.prototype.hasOwnProperty.call(result, 'port')) result.port = port;
  return result;
}

async function updateImportedNode(input) {
  const currentInput = input && typeof input === 'object' ? input : {};
  const nodeId = safeText(currentInput.id);
  if (!nodeId) throw new Error('节点标识无效');
  const state = store.get();
  const existing = state.nodes.find((node) => node.id === nodeId);
  if (!existing) throw new Error('节点不存在');
  if (state.profiles.some((profile) => profile.nodeId === nodeId && isProfileRunning(profile.id))) {
    throw new Error('该节点正在被运行中的环境使用，请先停止环境');
  }
  const host = safeText(currentInput.host, safeText(existing.host));
  const portValue = currentInput.port === undefined || currentInput.port === ''
    ? Number(existing.port)
    : Number(currentInput.port);
  const unsupportedWithoutPort = existing.supported === false && (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535);
  if (!host || (!unsupportedWithoutPort && (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535))) {
    throw new Error('节点地址或端口无效');
  }
  const next = {
    ...existing,
    name: safeText(currentInput.name, safeText(existing.name, '未命名节点')).slice(0, 120),
    host: host.slice(0, 253),
    port: unsupportedWithoutPort ? existing.port : portValue,
    lastCheckedAt: '',
    lastCheckPhase: '',
    latencyMs: null,
    lastCheckError: '',
    status: existing.supported === false ? 'unsupported' : 'unknown',
  };
  const userEdits = existing.userEdits && typeof existing.userEdits === 'object'
    ? { ...existing.userEdits }
    : {};
  if (currentInput.name !== undefined && safeText(currentInput.name) !== safeText(existing.name)) userEdits.name = true;
  if (currentInput.host !== undefined && host !== safeText(existing.host)) userEdits.host = true;
  if (currentInput.port !== undefined && String(currentInput.port) !== String(existing.port)) userEdits.port = true;
  if (!existing.requiresCore) {
    if (currentInput.tls !== undefined) {
      next.tls = Boolean(currentInput.tls);
      if (next.tls !== Boolean(existing.tls)) userEdits.tls = true;
    }
    if (currentInput.sni !== undefined) {
      next.sni = safeText(currentInput.sni).slice(0, 253);
      if (next.sni !== safeText(existing.sni)) userEdits.sni = true;
    }
    if (currentInput.remoteDns !== undefined) {
      next.remoteDns = Boolean(currentInput.remoteDns);
      if (next.remoteDns !== Boolean(existing.remoteDns)) userEdits.remoteDns = true;
    }
  } else {
    next.coreConfig = updateCoreEndpoint(existing.coreConfig, next.host, next.port);
  }
  next.userEdits = userEdits;
  // Empty credential inputs mean "keep the existing value" in the edit form.
  // Subscription records intentionally retain their local plaintext fields.
  if (safeText(currentInput.username)) {
    next.username = existing.sourceId ? safeText(currentInput.username) : protectSecret(safeText(currentInput.username));
  }
  if (safeText(currentInput.password)) {
    next.password = existing.sourceId ? safeText(currentInput.password) : protectSecret(safeText(currentInput.password));
  }
  store.update((nextState) => {
    const index = nextState.nodes.findIndex((node) => node.id === nodeId);
    if (index >= 0) nextState.nodes[index] = next;
  });
  broadcastState();
  if (next.ipAddress) void lookupNodeCountry(next.ipAddress);
  return { node: publicNode(next), created: false, updated: true };
}

async function saveNodeRecord(input, sender) {
  const nodeId = safeText(input?.id);
  const existing = nodeId ? store.get().nodes.find((node) => node.id === nodeId) : null;
  if (existing && (existing.sourceId || existing.requiresCore || existing.supported === false)) {
    return updateImportedNode(input);
  }
  return saveManualNode(input, sender);
}

function setNodeCore(nodeId, core) {
  const idValue = safeText(nodeId);
  const selectedCore = normalizeCore(core);
  const state = store.get();
  const node = state.nodes.find((item) => item.id === idValue);
  if (!node) throw new Error('节点不存在');
  if (!node.requiresCore) throw new Error('HTTP/SOCKS5 节点不需要选择代理核心');
  if ((node.protocol === 'anytls' || node.coreConfig?.type === 'anytls') && selectedCore !== 'singbox') {
    throw new Error('AnyTLS 仅支持 sing-box 核心');
  }
  if (state.profiles.some((profile) => profile.nodeId === idValue && isProfileRunning(profile.id))) {
    throw new Error('该节点正在被运行中的环境使用，请先停止环境');
  }
  store.update((next) => {
    const current = next.nodes.find((item) => item.id === idValue);
    if (current) {
      current.core = selectedCore;
      current.userEdits = { ...(current.userEdits || {}), core: true };
    }
  });
  broadcastState();
  return { nodeId: idValue, core: selectedCore };
}

async function importSubscription(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const requestedSortOrder = parseSubscriptionSortOrder(input.sortOrder, { allowMissing: true });
  let text = safeText(input.text);
  let source = '粘贴内容';
  let sourceId = safeText(input.subscriptionId);
  let sourceUrl = '';
  let responseHeaders;
  if (input.url) {
    sourceUrl = safeText(input.url);
    sourceId = sourceId || id('subscription');
    const fetched = await fetchSubscription(sourceUrl);
    text = fetched.text;
    source = fetched.source;
    responseHeaders = fetched.headers;
  }
  if (!text) throw new Error('请填写订阅地址或粘贴订阅内容');
  if (Buffer.byteLength(text, 'utf8') > MAX_SUBSCRIPTION_BYTES) throw new Error('订阅内容超过 2MB 限制');
  const parsed = parseSubscriptionContent(text, { source });
  const coreParsed = parseV2raySubscriptionContent(text, { source });
  const parsedNodesRaw = [
    ...(Array.isArray(parsed.nodes) ? parsed.nodes : []),
    ...(Array.isArray(coreParsed.nodes) ? coreParsed.nodes : []),
  ];
  const coreRecords = [
    ...(Array.isArray(coreParsed.nodes) ? coreParsed.nodes : []),
    ...(Array.isArray(coreParsed.unsupported) ? coreParsed.unsupported : []),
  ];
  const coreProtocols = new Set(['vmess', 'vless', 'trojan', 'ss', 'shadowsocks', 'anytls']);
  const baseUnsupported = (Array.isArray(parsed.unsupported) ? parsed.unsupported : []).filter((node) => {
    if (!coreProtocols.has(node.protocol)) return true;
    return !coreRecords.some((candidate) => candidate.protocol === node.protocol
      && candidate.host === node.host && Number(candidate.port) === Number(node.port));
  });
  const unsupportedNodesRaw = [
    ...baseUnsupported,
    ...(Array.isArray(coreParsed.unsupported) ? coreParsed.unsupported : []),
  ].filter((node, index, list) => list.findIndex((item) => item.id === node.id) === index);
  const metadataResult = extractSubscriptionMetadata({
    headers: responseHeaders,
    nodes: [...parsedNodesRaw, ...unsupportedNodesRaw],
  });
  const parsedNodes = parsedNodesRaw.filter((node) => !isSubscriptionInfoNode(node));
  const unsupportedNodes = unsupportedNodesRaw.filter((node) => !isSubscriptionInfoNode(node));
  // Subscription records must remain refreshable after an application restart.
  // Their URL and imported node credentials are intentionally stored as local
  // plaintext; manual nodes keep the existing safe-storage confirmation flow.
  const retention = { retain: true, prompted: false, count: 0 };
  const persisted = [...parsedNodes, ...unsupportedNodes]
    .map((node) => persistParsedNode(node, sourceId, { retainSecrets: retention.retain, plainSecrets: true }))
    .filter(Boolean);
  const unsupported = persisted.filter((node) => node.supported === false).map(publicNode);
  if (sourceUrl && persisted.length === 0 && !metadataResult.metadata) throw new Error('订阅未包含可识别的节点，已保留上一份配置');
  store.update((next) => {
    // A successful refresh is authoritative: replace every node owned by the subscription.
    const nodesForStorage = persisted;
    if (sourceId) {
      const oldNodes = next.nodes.filter((node) => node.sourceId === sourceId);
      const oldIds = new Set(oldNodes.map((node) => node.id));
      const newIds = new Set(persisted.map((node) => node.id));
      next.nodes = next.nodes.filter((node) => node.sourceId !== sourceId);
      for (const profile of next.profiles) {
        if (profile.nodeId && oldIds.has(profile.nodeId) && !newIds.has(profile.nodeId)) {
          profile.connectionMode = 'direct';
          profile.nodeId = null;
        }
      }
    }
    const keys = new Set(next.nodes.map(nodeStorageKey));
    for (const node of nodesForStorage) {
      const key = nodeStorageKey(node);
      if (!keys.has(key)) {
        next.nodes.push(node);
        keys.add(key);
      }
    }
    if (sourceUrl) {
      const existing = next.subscriptions.find((item) => item.id === sourceId);
      const record = existing || { id: sourceId || id('subscription'), createdAt: new Date().toISOString() };
      sourceId = record.id;
      record.name = resolveSubscriptionName({
        name: input.name,
        existingName: existing?.name,
        url: sourceUrl,
      });
      if (requestedSortOrder !== null) record.sortOrder = requestedSortOrder;
      else if (!existing) record.sortOrder = next.subscriptions.length;
      record.url = sourceUrl;
      record.source = source;
      record.nodeIds = nodesForStorage.map((node) => node.id);
      record.metadata = metadataResult.metadata;
      record.lastUpdatedAt = new Date().toISOString();
      record.status = 'ok';
      record.error = '';
      if (!existing) next.subscriptions.push(record);
      else Object.assign(existing, record);
    }
  });
  broadcastState();
  for (const node of persisted) {
    if (node.ipAddress) void lookupNodeCountry(node.ipAddress);
  }
  return {
    imported: persisted.filter((node) => node.supported !== false).length,
    recordedUnsupported: persisted.filter((node) => node.supported === false).length,
    unsupported,
    errors: [
      ...(Array.isArray(parsed.errors) ? parsed.errors : []),
      ...(Array.isArray(coreParsed.errors) ? coreParsed.errors : []),
    ],
    format: parsed.format !== 'unknown' ? parsed.format : (coreParsed.format || 'unknown'),
    subscriptionId: sourceId || undefined,
    metadata: metadataResult.metadata,
    secretsRetained: false,
    secretsOmitted: false,
    subscriptionUrlOmitted: false,
    state: publicState(),
  };
}

function renameSubscription(subscriptionId, name) {
  const idValue = safeText(subscriptionId);
  if (!idValue) throw new Error('订阅源标识无效');
  const nextName = normalizeSubscriptionName(name);
  if (!nextName) throw new Error('订阅名称不能为空');
  const current = store.get().subscriptions.find((item) => item.id === idValue);
  if (!current) throw new Error('订阅源不存在');
  store.update((next) => {
    const record = next.subscriptions.find((item) => item.id === idValue);
    if (record) record.name = nextName;
  });
  broadcastState();
  return { subscriptionId: idValue, name: nextName };
}

function subscriptionEditData(subscriptionId) {
  const idValue = safeText(subscriptionId);
  if (!idValue) throw new Error('订阅源标识无效');
  const record = store.get().subscriptions.find((item) => item.id === idValue);
  if (!record) throw new Error('订阅源不存在');
  return {
    subscriptionId: idValue,
    name: safeText(record.name, '在线订阅'),
    sortOrder: parseSubscriptionSortOrder(record.sortOrder, { allowMissing: true }) ?? 0,
    url: revealSecret(record.url),
  };
}

function editSubscription(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const idValue = safeText(input.subscriptionId);
  if (!idValue) throw new Error('订阅源标识无效');
  const nextName = normalizeSubscriptionName(input.name);
  if (!nextName) throw new Error('订阅名称不能为空');
  const nextSortOrder = parseSubscriptionSortOrder(input.sortOrder);
  const current = store.get().subscriptions.find((item) => item.id === idValue);
  if (!current) throw new Error('订阅源不存在');
  store.update((next) => {
    const record = next.subscriptions.find((item) => item.id === idValue);
    if (record) {
      record.name = nextName;
      record.sortOrder = nextSortOrder;
    }
  });
  broadcastState();
  return { subscriptionId: idValue, name: nextName, sortOrder: nextSortOrder };
}

function moveSubscription(subscriptionId, direction) {
  const idValue = safeText(subscriptionId);
  if (!idValue || !['up', 'down'].includes(direction)) throw new Error('订阅排序操作无效');
  const ordered = orderedSubscriptions(store.get().subscriptions);
  const index = ordered.findIndex((item) => item.id === idValue);
  if (index < 0) throw new Error('订阅源不存在');
  const nextIndex = index + (direction === 'up' ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= ordered.length) return { subscriptionId: idValue, sortOrder: index };
  [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
  persistSubscriptionOrder(ordered.map((item) => item.id));
  broadcastState();
  return { subscriptionId: idValue, sortOrder: nextIndex };
}

function reorderSubscription(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const idValue = safeText(input.subscriptionId);
  const targetId = safeText(input.targetId);
  const position = input.position === 'after' ? 'after' : 'before';
  if (!idValue || !targetId || idValue === targetId) throw new Error('订阅拖拽排序目标无效');
  const ordered = orderedSubscriptions(store.get().subscriptions);
  const sourceIndex = ordered.findIndex((item) => item.id === idValue);
  const targetIndex = ordered.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) throw new Error('订阅源不存在');
  const [source] = ordered.splice(sourceIndex, 1);
  const adjustedTargetIndex = ordered.findIndex((item) => item.id === targetId);
  ordered.splice(adjustedTargetIndex + (position === 'after' ? 1 : 0), 0, source);
  persistSubscriptionOrder(ordered.map((item) => item.id));
  broadcastState();
  return { subscriptionId: idValue, sortOrder: ordered.findIndex((item) => item.id === idValue) };
}

async function refreshSubscription(subscriptionId) {
  const idValue = safeText(subscriptionId);
  const record = store.get().subscriptions.find((item) => item.id === idValue);
  if (!record) throw new Error('订阅源不存在');
  const url = revealSecret(record.url);
  if (!url) throw new Error('订阅地址无法解密，请重新添加订阅');
  try {
    const result = await importSubscription({ url, subscriptionId: idValue, name: record.name });
    // Migrate legacy safe-storage records after a successful read so future
    // restarts do not depend on a keyring entry that may no longer exist.
    if (record.url !== url) {
      store.update((next) => {
        const current = next.subscriptions.find((item) => item.id === idValue);
        if (current) current.url = url;
      });
      broadcastState();
    }
    return result;
  } catch (error) {
    store.update((next) => {
      const current = next.subscriptions.find((item) => item.id === idValue);
      if (current) {
        current.status = 'error';
        current.error = error instanceof Error ? error.message : String(error);
      }
    });
    broadcastState();
    throw error;
  }
}

async function deleteSubscription(subscriptionId) {
  const idValue = safeText(subscriptionId);
  const record = store.get().subscriptions.find((item) => item.id === idValue);
  if (!record) throw new Error('订阅源不存在');
  const nodeIds = new Set(store.get().nodes.filter((node) => node.sourceId === idValue).map((node) => node.id));
  if ([...store.get().profiles].some((profile) => profile.nodeId && nodeIds.has(profile.nodeId) && isProfileRunning(profile.id))) {
    throw new Error('订阅节点正在被运行中的环境使用，请先停止环境');
  }
  store.update((next) => {
    next.nodes = next.nodes.filter((node) => node.sourceId !== idValue);
    next.profiles = next.profiles.map((profile) => nodeIds.has(profile.nodeId)
      ? { ...profile, connectionMode: 'direct', nodeId: null }
      : profile);
    next.subscriptions = next.subscriptions.filter((item) => item.id !== idValue);
  });
  broadcastState();
  return { subscriptionId: idValue };
}

function registerIpc() {
  ipcMain.on('app:confirmation-response', (event, payload) => {
    const requestId = safeText(payload?.requestId);
    const pending = pendingUiConfirmations.get(requestId);
    if (!pending || pending.sender !== event.sender) return;
    pending.finish(payload?.confirmed === true);
  });

  const handle = (channel, handler) => ipcMain.handle(channel, (event, ...args) => {
    if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
      throw new Error('未授权的渲染进程');
    }
    return handler(event, ...args);
  });
  const shellHandle = (channel, handler) => ipcMain.handle(channel, (event, ...args) => {
    const profileId = profileIdForSender(event.sender);
    if (!profileId) throw new Error('未授权的浏览器窗口');
    return handler(event, profileId, ...args);
  });

  handle('app:set-interface-zoom', (_event, value) => {
    const factor = validatedInterfaceZoomFactor(value);
    mainWindow.webContents.setZoomFactor(factor);
    return { ok: true, factor };
  });

  handle('state:get', () => publicState());

  handle('password:save', (_event, input) => {
    try {
      const profileId = requirePasswordProfile(store.get().profiles, input?.profileId);
      const nextEntries = savePasswordEntry(store.get().passwordEntries, input?.entry, {
        profileId,
        makeId: () => id('password'),
        protectSecret,
      });
      const entryId = safeText(input?.entry?.id) || nextEntries[0].id;
      store.update((next) => { next.passwordEntries = nextEntries; });
      broadcastState();
      return publicResult({ profileId, entryId });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('password:delete', (_event, entryId) => {
    try {
      const profileId = requirePasswordProfile(store.get().profiles, entryId?.profileId);
      const nextEntries = deletePasswordEntry(store.get().passwordEntries, profileId, entryId?.entryId);
      store.update((next) => { next.passwordEntries = nextEntries; });
      broadcastState();
      return publicResult({ profileId, entryId: safeText(entryId?.entryId) });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('password:reveal', (_event, entryId) => {
    try {
      const profileId = requirePasswordProfile(store.get().profiles, entryId?.profileId);
      return {
        ok: true,
        password: getPasswordEntry(store.get().passwordEntries, profileId, entryId?.entryId, revealSecret),
      };
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Chromium 插件',
      properties: ['openFile'],
      filters: [
        { name: '插件压缩包', extensions: ['crx', 'zip'] },
        { name: '所有文件', extensions: [''] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: true, canceled: true };
    const selectedPath = result.filePaths[0];
    const metadata = inspectExtensionSource(selectedPath);
    return { ok: true, path: selectedPath, metadata };
  });

  handle('extension:choose-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择未打包插件文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: true, canceled: true };
    const selectedPath = result.filePaths[0];
    const metadata = inspectExtensionSource(selectedPath);
    if (metadata.managed) throw new Error('请选择未打包插件文件夹，而不是压缩包');
    return { ok: true, path: selectedPath, metadata };
  });

  handle('extension:inspect', (_event, sourcePath) => {
    try {
      return { ok: true, metadata: inspectExtensionSource(safeText(sourcePath)) };
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:install', async (_event, input) => {
    try {
      return publicResult(await installExtension(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:install-store', async (_event, input) => {
    try {
      return publicResult(await installChromeWebStoreExtension(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:select-official-store-proxy', async () => {
    try {
      const node = await selectRandomExtensionStoreNode();
      return publicResult({ proxyNodeId: node.id });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:store-search', async (_event, input) => {
    try {
      const payload = input && typeof input === 'object' ? input : {};
      const search = await withExtensionStoreNode(payload.proxyNodeId, (requestFetch) => (
        searchCrxSosoExtensions(payload, requestFetch)
      ));
      return publicResult({ search });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:official-search', async (_event, input) => {
    try {
      const payload = input && typeof input === 'object' ? input : {};
      const search = await withExtensionStoreNode(payload.proxyNodeId, (requestFetch) => (
        searchOfficialExtensionStore(payload, requestFetch)
      ));
      return publicResult({ search });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:official-detail', async (_event, input) => {
    try {
      const payload = input && typeof input === 'object' ? input : { extensionId: input };
      const detail = await withExtensionStoreNode(payload.proxyNodeId, (requestFetch) => (
        getOfficialExtensionStoreDetail(payload.extensionId, requestFetch)
      ));
      return publicResult({ detail });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:store-detail', async (_event, input) => {
    try {
      const payload = input && typeof input === 'object' ? input : { extensionId: input };
      const detail = await withExtensionStoreNode(payload.proxyNodeId, (requestFetch) => (
        getCrxSosoExtensionDetails(payload.extensionId, requestFetch)
      ));
      return publicResult({ detail });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:install-crxsoso', async (_event, input) => {
    try {
      return publicResult(await installCrxSosoExtension(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:set-profiles', async (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(await setExtensionProfiles(input.extensionId, input.profileIds));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:set-profile', async (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(await setExtensionEnabledForProfile(input.profileId, input.extensionId, Boolean(input.enabled)));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:delete', async (_event, extensionId) => {
    try {
      return publicResult(await deleteExtension(extensionId));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:check-update', async (_event, extensionId) => {
    try {
      return publicResult({ update: await checkExtensionUpdate(extensionId) });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('extension:update', async (_event, extensionId) => {
    try {
      return publicResult(await updateExtension(extensionId));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('agent:get-profile-settings', (_event, profileId) => {
    try {
      return { ok: true, profileId: safeProfileId(profileId), settings: publicAgentProfileSettings(profileId) };
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('agent:save-profile-settings', async (event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(await saveAgentProfileSettings(input.profileId, input, event.sender));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('agent:fetch-models', async (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return await requestAgentModels(input.profileId, input);
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('agent:test-connection', async (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return await requestAgentModels(input.profileId, input, { testOnly: true });
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:get-extensions', (_event, profileId) => ({
    ok: true,
    profileId,
    extensions: publicBrowserExtensions(profileId),
  }));

  shellHandle('browser-shell:get-settings', (_event, profileId) => ({
    ok: true,
    settings: publicBrowserSettings(store.get(), profileId),
  }));

  shellHandle('browser-shell:get-bookmarks', (_event, profileId) => ({
    ok: true,
    profileId,
    bookmarks: profileBookmarks(profileId),
  }));

  shellHandle('browser-shell:get-bookmark-favicon', async (_event, profileId, input) => {
    try {
      return { ok: true, ...await loadProfileBookmarkFavicon(profileId, input) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:get-page-favicon', async (_event, profileId, input) => {
    try {
      return { ok: true, ...await loadProfilePageFavicon(profileId, input) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:get-common-sites', (_event, profileId) => ({
    ok: true,
    profileId,
    sites: profileNewTabSites(profileId),
  }));

  shellHandle('browser-shell:record-common-site-visit', (_event, profileId, url) => {
    try {
      return { ok: true, ...recordProfileNewTabSiteVisit(profileId, url) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:get-search-history', (_event, profileId) => {
    try {
      return { ok: true, profileId, searchHistory: profileSearchHistory(profileId) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:record-search-query', (_event, profileId, query) => {
    try {
      return { ok: true, ...recordProfileSearchQuery(profileId, query) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:get-password-suggestions', (_event, profileId, input) => {
    try {
      return {
        ok: true,
        profileId,
        suggestions: publicPasswordSuggestions(profileId, input?.url),
      };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:reveal-password', (_event, profileId, input) => {
    try {
      return {
        ok: true,
        requestId: safeText(input?.requestId),
        entryId: safeText(input?.entryId),
        password: revealBrowserPassword(profileId, input?.entryId, input?.url),
      };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:save-password', (_event, profileId, input) => {
    try {
      return { ok: true, requestId: safeText(input?.requestId), ...saveBrowserPassword(profileId, input) };
    } catch (error) {
      return { ...errorResult(error), requestId: safeText(input?.requestId) };
    }
  });

  shellHandle('browser-shell:get-downloads', (_event, profileId) => ({
    ok: true,
    profileId,
    downloads: profileDownloads(profileId),
  }));

  shellHandle('browser-shell:get-local-listeners', async (_event, profileId) => {
    try {
      return { ok: true, profileId, listeners: await listLocalTcpListeners() };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:stop-local-listener', async (_event, profileId, input) => {
    try {
      return { ok: true, profileId, ...(await stopLocalListener(input)) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:open-download', async (_event, profileId, input) => {
    try {
      return await openProfileDownload(profileId, input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:cancel-download', (_event, profileId, downloadId) => {
    try {
      return cancelProfileDownload(profileId, downloadId);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:clear-downloads', (_event, profileId) => {
    try {
      return clearCompletedProfileDownloads(profileId);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:clear-browsing-data', async (_event, profileId) => {
    try {
      const profileKey = safeProfileId(profileId);
      const profileSession = profileSessionRefs.get(profileKey);
      if (!profileSession?.clearStorageData) throw new Error('当前环境暂不可清理浏览数据');
      await profileSession.clearStorageData({ storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'serviceworkers', 'cachestorage', 'websql'] });
      store.update((next) => {
        const profile = next.profiles.find((item) => item.id === profileKey);
        if (profile) {
          profile.newTabSiteVisits = [];
          profile.searchHistory = [];
        }
      });
      return { ok: true };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-choose-files', async (_event, profileId, input) => {
    try {
      return await chooseAgentFiles(profileId, input, 'files');
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-choose-directory', async (_event, profileId, input) => {
    try {
      return await chooseAgentFiles(profileId, input, 'directory');
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-list-files', (_event, profileId, input) => {
    try {
      return listAgentFiles(profileId, input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-read-file', (_event, profileId, input) => {
    try {
      return readAgentFile(profileId, input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-upload-files', async (_event, profileId, input) => {
    try {
      return await uploadAgentFiles(profileId, input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:save-bookmark', (_event, profileId, input) => {
    try {
      return { ok: true, ...saveProfileBookmark(profileId, input) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:create-bookmark-folder', (_event, profileId, input) => {
    try {
      return { ok: true, ...createProfileBookmarkFolder(profileId, input) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:update-bookmark', (_event, profileId, input) => {
    try {
      return { ok: true, ...updateProfileBookmark(profileId, input) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:delete-bookmark', (_event, profileId, input) => {
    try {
      return { ok: true, ...deleteProfileBookmark(profileId, input) };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:save-settings', async (event, profileId, input) => {
    try {
      const result = input && input.agentOnly
        ? await saveAgentProfileSettings(profileId, input, event.sender)
        : await saveApplicationSettings(input, event.sender);
      return { ok: true, ...result };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-observe', async (event, _profileId, options) => {
    try {
      return await invokeBrowserAgent(event.sender, 'observe', options);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-capture', async (event, _profileId, rect) => {
    try {
      const source = rect && typeof rect === 'object' ? rect : {};
      const value = (key, fallback = 0) => {
        const number = Number(source[key]);
        return Number.isFinite(number) ? Math.round(number) : fallback;
      };
      const captureRect = {
        x: Math.max(0, value('x')),
        y: Math.max(0, value('y')),
        width: Math.min(20000, Math.max(1, value('width'))),
        height: Math.min(20000, Math.max(1, value('height'))),
      };
      if (!event.sender || event.sender.isDestroyed()) throw new Error('浏览器环境已关闭');
      let image = await event.sender.capturePage(captureRect);
      const imageSize = image.getSize();
      if ((imageSize.width !== captureRect.width || imageSize.height !== captureRect.height) && typeof image.resize === 'function') {
        image = image.resize({ width: captureRect.width, height: captureRect.height });
      }
      return { ok: true, dataUrl: image.toDataURL(), size: image.getSize() };
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-capabilities', async (event) => {
    try {
      return await invokeBrowserAgent(event.sender, 'capabilities');
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-execute', async (event, _profileId, action) => {
    try {
      return await invokeBrowserAgent(event.sender, 'execute', action);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-execute-batch', async (event, _profileId, actions) => {
    try {
      return await invokeBrowserAgent(event.sender, 'executeBatch', actions);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-tabs', async (event) => {
    try {
      return await invokeBrowserAgent(event.sender, 'tabs');
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-open-tab', async (event, _profileId, input) => {
    try {
      return await invokeBrowserAgent(event.sender, 'openTab', input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-switch-tab', async (event, _profileId, tabId) => {
    try {
      return await invokeBrowserAgent(event.sender, 'switchTab', tabId);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-close-tab', async (event, _profileId, tabId) => {
    try {
      return await invokeBrowserAgent(event.sender, 'closeTab', tabId);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-navigate', async (event, _profileId, input) => {
    try {
      return await invokeBrowserAgent(event.sender, 'navigate', input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-tab-control', async (event, _profileId, input) => {
    try {
      return await invokeBrowserAgent(event.sender, 'tabControl', input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:agent-chat', async (_event, profileId, input) => {
    try {
      return await requestAgentModel(profileId, input);
    } catch (error) {
      return errorResult(error);
    }
  });

  ipcMain.on('browser-shell:agent-chat-stream', (event, requestId, input) => {
    const profileId = profileIdForSender(event.sender);
    const safeRequestId = String(requestId || '').slice(0, 160);
    const send = (payload) => {
      if (!safeRequestId || !event.sender || event.sender.isDestroyed()) return;
      try { event.sender.send('browser-shell:agent-stream', { requestId: safeRequestId, ...payload }); } catch { /* The shell may be closing. */ }
    };
    if (!profileId) {
      send({ type: 'error', error: '未授权的浏览器窗口' });
      return;
    }
    void requestAgentModelStream(profileId, input, (delta) => send(delta))
      .then((result) => send({ type: 'done', result }))
      .catch((error) => send({ type: 'error', error: error?.message || 'Agent 模型请求失败' }));
  });

  shellHandle('browser-shell:agent-models', async (_event, profileId, input) => {
    try {
      return await requestAgentModels(profileId, input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:jev-decision', async (_event, profileId, input) => {
    try {
      return await requestJevDecision(profileId, input);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:set-extension', async (_event, profileId, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(await setExtensionEnabledForProfile(profileId, input.extensionId, Boolean(input.enabled)));
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:set-extension-pinned', (_event, profileId, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(setExtensionPinnedForProfile(profileId, input.extensionId, Boolean(input.pinned)));
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:open-extension-panel', async (_event, profileId, extensionId) => {
    try {
      return await openExtensionPanel(profileId, extensionId);
    } catch (error) {
      return errorResult(error);
    }
  });

  shellHandle('browser-shell:open-manager', (_event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('manager:navigate', 'extensions');
    }
    return { ok: true };
  });

  handle('profile:save', (_event, input) => {
    try {
      const nextProfile = normalizeProfile(input);
      const currentState = store.get();
      const existing = currentState.profiles.find((profile) => profile.id === nextProfile.id);
      const collision = currentState.profiles.find((profile) => (
        profile.id !== nextProfile.id
        && String(profile.id).toLocaleLowerCase() === String(nextProfile.id).toLocaleLowerCase()
      ));
      if (collision) throw new Error('环境标识忽略大小写后已存在，请使用其他环境');
      const running = Boolean(existing && (
        isProfileRunning(existing.id)
        || profileLaunches.has(existing.id)
        || profileStops.has(existing.id)
      ));
      if (running && profileSaveNeedsStopped(existing, nextProfile)) {
        throw new Error('请先停止运行中的环境，再编辑环境配置');
      }
      store.update((next) => {
        const index = next.profiles.findIndex((profile) => profile.id === nextProfile.id);
        if (index === -1) next.profiles.push(nextProfile);
        else next.profiles[index] = nextProfile;
      });
      if (running) sendBrowserProfileDetails(nextProfile);
      broadcastState();
      void refreshConnectionStatus();
      const {
        newTabSiteVisits: _newTabSiteVisits,
        searchHistory: _searchHistory,
        ...publicProfile
      } = nextProfile;
      return publicResult({ profile: publicProfile });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('profile:delete', async (_event, profileId) => {
    try {
      const idValue = safeText(profileId);
      await stopProfile(idValue);
      await clearProfileData(idValue);
      profileDownloadRecords.delete(idValue);
      for (const [downloadId, entry] of profileDownloadItems.entries()) {
        if (entry.profileId === idValue) profileDownloadItems.delete(downloadId);
      }
      store.update((next) => {
        next.profiles = next.profiles.filter((profile) => profile.id !== idValue);
        next.passwordEntries = next.passwordEntries.filter((entry) => entry.profileId !== idValue);
        next.extensions = next.extensions.map((extension) => ({
          ...extension,
          profileIds: extensionProfileIds(extension).filter((profileId) => profileId !== idValue),
          pinnedProfileIds: extensionPinnedProfileIds(extension, next).filter((profileId) => profileId !== idValue),
        }));
        next.settings.agentProfileIds = normalizedAgentProfileIds(next.settings.agentProfileIds, {
          ...next,
          profiles: next.profiles,
        });
        if (next.settings.agentProfileOverrides) delete next.settings.agentProfileOverrides[idValue];
      });
      broadcastState();
      void refreshConnectionStatus();
      return publicResult({ profileId: idValue });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('profile:launch', async (_event, profileId) => {
    try {
      return publicResult(await launchProfile(safeText(profileId)));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('profile:resolve-launch-confirmation', async (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(await resolveProfileLaunchConfirmation(
        input.profileId,
        input.confirmationToken,
        input.confirmed === true,
      ));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('profile:stop', async (_event, profileId) => {
    try {
      return publicResult(await stopProfile(safeText(profileId)));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('profile:switch-node', async (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      const result = await switchProfileNode(input.profileId, input.nodeId);
      void refreshConnectionStatus();
      return publicResult(result);
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('profile:check-connection', async (_event, profileId) => {
    try {
      const result = await checkProfileConnection(profileId);
      return publicResult({ result });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('connection:check-direct', async () => {
    try {
      const result = await checkDirectConnection();
      return publicResult({ result });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('subscription:import', async (_event, payload) => {
    try {
      const result = await importSubscription(payload);
      void refreshConnectionStatus();
      return publicResult(result);
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('subscription:refresh', async (_event, subscriptionId) => {
    try {
      const result = await refreshSubscription(subscriptionId);
      void refreshConnectionStatus();
      return publicResult(result);
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('subscription:rename', (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(renameSubscription(input.subscriptionId, input.name));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('subscription:get-edit', (_event, subscriptionId) => {
    try {
      return publicResult(subscriptionEditData(subscriptionId));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('subscription:edit', (_event, payload) => {
    try {
      return publicResult(editSubscription(payload));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('subscription:move', (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(moveSubscription(input.subscriptionId, input.direction));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('subscription:reorder', (_event, payload) => {
    try {
      return publicResult(reorderSubscription(payload));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('subscription:delete', async (_event, subscriptionId) => {
    try {
      const result = await deleteSubscription(subscriptionId);
      void refreshConnectionStatus();
      return publicResult(result);
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('node:save', async (event, input) => {
    try {
      const result = await saveNodeRecord(input, event.sender);
      void refreshConnectionStatus();
      return publicResult(result);
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('node:set-core', (_event, payload) => {
    try {
      const input = payload && typeof payload === 'object' ? payload : {};
      return publicResult(setNodeCore(input.nodeId, input.core));
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('node:delete', (_event, nodeId) => {
    try {
      const idValue = safeText(nodeId);
      if (store.get().profiles.some((profile) => profile.nodeId === idValue && isProfileRunning(profile.id))) {
        throw new Error('该节点正在被运行中的环境使用，请先停止环境');
      }
      store.update((next) => {
        next.nodes = next.nodes.filter((node) => node.id !== idValue);
        next.profiles = next.profiles.map((profile) => (
          profile.nodeId === idValue
            ? { ...profile, connectionMode: 'direct', nodeId: null }
            : profile
        ));
      });
      broadcastState();
      void refreshConnectionStatus();
      return publicResult({ nodeId: idValue });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('node:check', async (_event, nodeId) => {
    try {
      const idValue = safeText(nodeId);
      const result = await checkNodeConnection(idValue);
      return { ok: true, result, state: publicState() };
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('node:check-batch', async (_event, nodeIds) => {
    try {
      const result = await checkNodeConnections(nodeIds);
      return { ok: true, ...result, state: publicState() };
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('settings:save', async (event, input) => {
    try {
      const result = await saveApplicationSettings(input, event.sender);
      void checkCoreUpdates();
      return { ok: true, ...result, state: publicState() };
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('settings:choose-engine', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Chromium 可执行文件',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: '应用程序', extensions: ['exe'] }]
        : [{ name: '可执行文件', extensions: ['app', ''] }],
    });
    return result.canceled ? { ok: true, canceled: true } : { ok: true, path: result.filePaths[0] };
  });

  handle('settings:choose-xray', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Xray 核心可执行文件',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: '应用程序', extensions: ['exe'] }]
        : [{ name: '可执行文件', extensions: [''] }],
    });
    return result.canceled ? { ok: true, canceled: true } : { ok: true, path: result.filePaths[0] };
  });

  handle('settings:choose-singbox', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 sing-box 核心可执行文件',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: '应用程序', extensions: ['exe'] }]
        : [{ name: '可执行文件', extensions: [''] }],
    });
    return result.canceled ? { ok: true, canceled: true } : { ok: true, path: result.filePaths[0] };
  });

  handle('core:install', async (_event, payload) => {
    try {
      const kind = normalizeCore(payload && typeof payload === 'object' ? payload.core : payload);
      const installed = await installLatestCore({ baseDir: app.getPath('userData'), core: kind });
      store.update((next) => {
        const prefix = kind === 'singbox' ? 'singbox' : 'xray';
        next.settings[`${prefix}Path`] = installed.path;
        next.settings[`${prefix}Version`] = installed.version;
        next.settings[`${prefix}Sha256`] = installed.sha256;
        next.settings[`${prefix}InstalledAt`] = new Date().toISOString();
      });
      coreUpdateState = coreUpdateState.filter((update) => update.core !== kind);
      broadcastState();
      return publicResult({ core: installed });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('browser:install', async () => {
    try {
      if (store.get().profiles.some((profile) => isProfileRunning(profile.id))) {
        throw new Error('请先停止运行中的环境，再更新浏览器内核');
      }
      const installed = await installLatestBrowser({ baseDir: app.getPath('userData') });
      store.update((next) => {
        next.settings.enginePath = installed.path;
        next.settings.engineVersion = installed.version;
        next.settings.engineSha256 = installed.sha256;
        next.settings.engineInstalledAt = new Date().toISOString();
      });
      browserUpdateState = null;
      broadcastState();
      return publicResult({ browser: installed });
    } catch (error) {
      return errorResult(error);
    }
  });

  handle('app:open-data-folder', async () => {
    await shell.openPath(path.dirname(stateFile));
    return { ok: true };
  });
}

function createManagerWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    title: BRAND_NAME,
    icon: BRAND_NATIVE_ICON_PATH,
    backgroundColor: '#0c1017',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
  });
  mainWindow.on('minimize', (event) => {
    if (quitCleanupStarted) return;
    event.preventDefault();
    hideManagerWindowToTray();
  });
  mainWindow.on('close', (event) => {
    if (quitCleanupStarted) return;
    event.preventDefault();
    hideManagerWindowToTray();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  Menu.setApplicationMenu(null);
  stateFile = path.join(app.getPath('userData'), 'state.json');
  store = createStore(stateFile);
  store.load();
  migrateProfileTestIdentities();
  migrateSubscriptionUrls();
  resetInterruptedNodeChecks();
  lookupKnownNodeCountries();
  registerIpc();
  createTray();
  if (process.platform === 'darwin' && app.dock?.setIcon) app.dock.setIcon(BRAND_NATIVE_ICON_PATH);
  app.on('login', (event, webContents, _request, authInfo, callback) => {
    if (!webContents || webContents.isDestroyed()) return;
    const node = profileAuth.get(webContents.id) || profileSessions.get(webContents.session);
    if (!node || (!node.username && !node.password) || !authInfo.isProxy) return;
    const authHost = normalizeAuthHost(authInfo.host);
    if (authHost !== normalizeAuthHost(node.host) || Number(authInfo.port) !== Number(node.port)) return;
    event.preventDefault();
    callback(node.username, node.password);
  });
  createManagerWindow();
  if (pendingSecondInstance) {
    pendingSecondInstance = false;
    showManagerWindow();
  }
  startConnectionMonitor();
  startCoreUpdateMonitor();
  app.on('activate', () => {
    if (!quitCleanupStarted) showManagerWindow();
  });
});

app.on('before-quit', (event) => {
  if (quitCleanupStarted) {
    event.preventDefault();
    return;
  }
  quitCleanupStarted = true;
  if (tray && !tray.isDestroyed?.()) tray.destroy();
  tray = null;
  stopConnectionMonitor();
  stopCoreUpdateMonitor();
  for (const profileId of [...profileTrafficTrackers.keys()]) stopProfileTraffic(profileId);
  event.preventDefault();
  const childWaits = [...externalProcesses.values()].map((child) => {
    terminateExternalProcess(child);
    return waitForChildExit(child);
  });
  const coreWaits = [...coreProcesses.values()].map((runtime) => {
    terminateCore(runtime.child);
    return waitForChildExit(runtime.child).then((exited) => {
      if (exited) cleanupRuntime(runtime);
      return exited;
    });
  });
  const extensionStoreCoreWaits = [...extensionStoreProxyCores].map((runtime) => {
    terminateCore(runtime.child);
    return waitForChildExit(runtime.child).then((exited) => {
      if (exited) {
        extensionStoreProxyCores.delete(runtime);
        cleanupRuntime(runtime);
      }
      return exited;
    });
  });
  // app.exit() closes all Electron windows immediately. Avoid touching a live
  // <webview> here because Electron 44 may block even on hide/destroy.
  Promise.all([...childWaits, ...coreWaits, ...extensionStoreCoreWaits])
    .catch((error) => console.error(`退出时清理浏览器环境失败：${error.message}`))
    .finally(() => app.exit(0));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = {
  ensureUrl,
  normalizeProfile,
  proxyForNode,
  publicNode,
};
