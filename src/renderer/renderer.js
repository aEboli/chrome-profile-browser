"use strict";

(() => {

/* The renderer is deliberately API-shaped: all filesystem, process and network work stays in main. */
const api = typeof window !== "undefined" && window.api ? window.api : {};

const initialState = {
  appVersion: "",
  brandName: "简约指纹",
  brandDescription: "",
  profiles: [],
  nodes: [],
  subscriptions: [],
  extensions: [],
  passwordEntries: [],
  coreUpdates: [],
  settings: {},
  meta: {},
  connection: { direct: null },
  core: {},
  engine: { mode: "electron", configured: false },
  engineUpdate: null,
  bookmarkImportSources: [],
  bookmarkImportSelectedSourceIds: [],
  bookmarkImportTargetId: "",
  bookmarkImportLoading: false,
  bookmarkImportBusy: false,
  bookmarkImportSourceError: "",
  bookmarkImportResult: null,
  extensionStore: {
    keyword: "",
    page: 1,
    token: "",
    hasMorePages: false,
    results: [],
    detail: null,
    loading: false,
    requestId: 0,
    view: "grid",
    source: "crxsoso",
    proxyNodeId: "",
    proxySelectionPending: false,
    proxySelectionRequired: false,
    proxyNodeSelectionExplicit: false,
    routePicker: { open: "", filter: "", groupId: "all" },
  },
};

const DEFAULT_THEME = Object.freeze({
  preset: "midnight",
  background: "#0f1423",
  surface: "#101f30",
  surfaceSoft: "#144a74",
  primary: "#2474b5",
  primaryHover: "#10aec2",
  secondary: "#0eb0c9",
  success: "#2c9678",
  warning: "#f7da94",
  danger: "#f1939c",
  text: "#f1f0ed",
  textMuted: "#9fa39a",
  textFaint: "#74787a",
  backgroundImage: "",
  backgroundOpacity: 0.72,
  blur: 18,
  radius: 12,
});

const THEME_PRESETS = {
  midnight: { ...DEFAULT_THEME },
  ocean: {
    ...DEFAULT_THEME,
    preset: "ocean",
    background: "#101f30",
    surface: "#144a74",
    surfaceSoft: "#2474b5",
    primary: "#0eb0c9",
    primaryHover: "#51c4d3",
    secondary: "#2474b5",
  },
  ink: {
    ...DEFAULT_THEME,
    preset: "ink",
    background: "#131824",
    surface: "#2d2e36",
    surfaceSoft: "#475164",
    primary: "#0eb0c9",
    primaryHover: "#29b7cb",
    secondary: "#5e616d",
  },
};

const appState = {
  ...initialState,
  activeView: "launchpad",
  profileFilter: "",
  nodeFilter: "",
  subscriptionFilter: "",
  nodeGroup: "all",
  extensionFilter: "",
  passwordFilter: "",
  passwordProfileId: "",
  profileStatuses: Object.create(null),
  connectionPicker: { profileId: "", filter: "", groupId: "" },
  batchChecking: false,
  profileChecks: Object.create(null),
  nodeChecks: Object.create(null),
  directCheck: false,
};

const shownCoreUpdateNotices = new Set();
let draggedSubscriptionId = "";
let agentFormProfileId = "";
let clearManagerAgentToken = false;
let clearManagerJevToken = false;
let agentModelFetchKey = "";
let agentModelFetchPromise = null;
let agentModelFetchGeneration = 0;
let agentModelRequestId = "";
let agentConnectionTestRequestId = "";
const passwordRevealRequests = new WeakMap();
let activeConfirmDialog = null;
let extensionStoreProxySelectionGeneration = 0;
let extensionStoreProxySelectionPromise = null;
let bookmarkImportSourceRequestId = 0;

const viewTitles = {
  launchpad: ["启动器", "环境选择"],
  overview: ["工作区", "概览"],
  profiles: ["工作区", "环境"],
  nodes: ["工作区", "连接节点"],
  passwords: ["工作区", "密码簿"],
  extensions: ["工作区", "插件管理"],
  agent: ["工作区", "Agent 配置"],
  settings: ["工作区", "设置"],
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function icon(name, className = "svg-icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

const DEFAULT_BRAND_DESCRIPTION = "本地隔离浏览器环境与连接节点管理";

function generatedBrandDescription(value) {
  const source = String(value || DEFAULT_BRAND_DESCRIPTION).replace(/\s+/g, "").trim();
  return Array.from(source || DEFAULT_BRAND_DESCRIPTION).slice(0, 30).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTheme(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const theme = { ...DEFAULT_THEME };
  for (const key of Object.keys(DEFAULT_THEME)) {
    if (typeof source[key] === "string" && source[key].trim()) theme[key] = source[key].trim();
  }
  for (const key of ["backgroundOpacity", "blur", "radius"]) {
    const number = Number(source[key]);
    if (Number.isFinite(number)) theme[key] = number;
  }
  if (!/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(theme.backgroundImage)) theme.backgroundImage = "";
  if (!["midnight", "ocean", "ink", "custom"].includes(theme.preset)) theme.preset = "custom";
  theme.backgroundOpacity = Math.min(1, Math.max(0, theme.backgroundOpacity));
  theme.blur = Math.min(40, Math.max(0, Math.round(theme.blur)));
  theme.radius = Math.min(24, Math.max(4, Math.round(theme.radius)));
  return theme;
}

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!match) return [0, 0, 0];
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
}

function rgba(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function applyTheme(value = {}) {
  if (typeof document === "undefined") return;
  const theme = normalizeTheme(value);
  const root = document.documentElement;
  const set = (name, color) => root.style.setProperty(name, color);
  set("--bg", theme.background);
  set("--surface", theme.surface);
  set("--surface-soft", theme.surfaceSoft);
  set("--line", rgba(theme.text, 0.12));
  set("--line-strong", rgba(theme.text, 0.24));
  set("--ink", theme.text);
  set("--ink-soft", theme.textMuted);
  set("--ink-faint", theme.textFaint);
  set("--nav", theme.background);
  set("--nav-soft", rgba(theme.surfaceSoft, 0.38));
  set("--nav-ink", theme.text);
  set("--nav-muted", theme.textMuted);
  set("--blue", theme.primary);
  set("--blue-dark", theme.primaryHover);
  set("--blue-soft", rgba(theme.primary, 0.18));
  set("--green", theme.success);
  set("--green-soft", rgba(theme.success, 0.18));
  set("--amber", theme.warning);
  set("--amber-soft", rgba(theme.warning, 0.18));
  set("--red", theme.danger);
  set("--red-soft", rgba(theme.danger, 0.18));
  set("--theme-background-image", theme.backgroundImage ? `url(${theme.backgroundImage})` : "none");
  set("--theme-image-opacity", String(theme.backgroundOpacity));
  set("--theme-blur", `${theme.blur}px`);
  set("--radius", `${theme.radius}px`);
  root.dataset.themePreset = theme.preset;
}

function valueOf(object, keys, fallback = "") {
  for (const key of keys) {
    if (object && object[key] !== undefined && object[key] !== null && object[key] !== "") {
      return object[key];
    }
  }
  return fallback;
}

function normalizeProfile(profile = {}) {
  const id = String(valueOf(profile, ["id", "profileId"], ""));
  const traffic = profile.traffic && typeof profile.traffic === "object" ? profile.traffic : {};
  const uploadedBytes = Number.isSafeInteger(Number(traffic.uploadedBytes)) && Number(traffic.uploadedBytes) >= 0 ? Number(traffic.uploadedBytes) : 0;
  const downloadedBytes = Number.isSafeInteger(Number(traffic.downloadedBytes)) && Number(traffic.downloadedBytes) >= 0 ? Number(traffic.downloadedBytes) : 0;
  return {
    ...profile,
    id,
    name: String(valueOf(profile, ["name", "title"], id ? `环境 ${id.slice(0, 6)}` : "未命名环境")),
    homepage: String(valueOf(profile, ["homepage", "startUrl", "url"], "")),
    nodeId: String(valueOf(profile, ["nodeId", "proxyId"], "")),
    notes: String(valueOf(profile, ["notes", "note", "description"], "")),
    testIdentityId: String(valueOf(profile, ["testIdentityId"], "")),
    testIdentityOrigins: asArray(profile.testIdentityOrigins).map((origin) => String(origin)),
    lastUsed: valueOf(profile, ["lastUsed", "lastLaunchedAt", "lastOpenedAt", "updatedAt", "createdAt"], ""),
    status: String(valueOf(profile, ["status"], "stopped")),
    runtimeMode: String(valueOf(profile, ["runtimeMode"], "")),
    traffic: {
      uploadedBytes,
      downloadedBytes,
      totalBytes: uploadedBytes + downloadedBytes,
      requestCount: Number.isSafeInteger(Number(traffic.requestCount)) && Number(traffic.requestCount) >= 0 ? Number(traffic.requestCount) : 0,
      lastUpdatedAt: String(valueOf(traffic, ["lastUpdatedAt"], "")),
    },
  };
}

function normalizeNode(node = {}) {
  node = node && typeof node === "object" ? node : {};
  const id = String(valueOf(node, ["id", "nodeId"], ""));
  const protocol = String(valueOf(node, ["protocol", "scheme", "type"], "unknown")).toLowerCase();
  const rawLatency = node.latencyMs === null || node.latencyMs === undefined || node.latencyMs === ""
    ? Number.NaN
    : Number(node.latencyMs);
  return {
    ...node,
    id,
    name: String(valueOf(node, ["name", "title", "remark"], id ? `节点 ${id.slice(0, 6)}` : "未命名节点")),
    protocol,
    host: String(valueOf(node, ["host", "server", "address"], "")),
    port: valueOf(node, ["port"], ""),
    status: String(valueOf(node, ["status", "health"], "unknown")).toLowerCase(),
    latencyMs: Number.isFinite(rawLatency) && rawLatency >= 0 ? Math.round(rawLatency) : null,
    source: String(valueOf(node, ["source"], "manual")),
    core: String(valueOf(node, ["core"], "xray")).toLowerCase() === "singbox" ? "singbox" : "xray",
    ipAddress: String(valueOf(node, ["ipAddress", "ip", "resolvedIp"], "")),
    country: String(valueOf(node, ["country", "countryName", "countryCode"], "")),
    ipSource: String(valueOf(node, ["ipSource", "ipSourceLabel"], "")),
    ipProperty: String(valueOf(node, ["ipProperty", "ipPropertyLabel"], "")),
  };
}

function normalizeSubscription(subscription = {}) {
  const source = subscription && typeof subscription === "object" ? subscription : {};
  const metadata = source.metadata && typeof source.metadata === "object" ? source.metadata : null;
  const rawSortOrder = source.sortOrder;
  const nodeCount = Number.isFinite(Number(source.nodeCount)) ? Math.max(0, Math.round(Number(source.nodeCount))) : 0;
  const unsupportedNodeCount = Number.isFinite(Number(source.unsupportedNodeCount))
    ? Math.min(nodeCount, Math.max(0, Math.round(Number(source.unsupportedNodeCount))))
    : 0;
  return {
    ...source,
    id: String(valueOf(source, ["id", "subscriptionId"], "")),
    name: String(valueOf(source, ["name", "title"], "在线订阅")),
    source: String(valueOf(source, ["source"], "")),
    sortOrder: (typeof rawSortOrder === "number" || typeof rawSortOrder === "string")
      && String(rawSortOrder).trim() !== ""
      && Number.isSafeInteger(Number(rawSortOrder))
      && Number(rawSortOrder) >= 0
      ? Number(rawSortOrder)
      : null,
    nodeCount,
    availableNodeCount: Number.isFinite(Number(source.availableNodeCount))
      ? Math.min(nodeCount, Math.max(0, Math.round(Number(source.availableNodeCount))))
      : nodeCount - unsupportedNodeCount,
    unsupportedNodeCount,
    metadata,
  };
}

function sortSubscriptions(value) {
  return asArray(value)
    .map((item, index) => ({ item, index, sortOrder: Number.isSafeInteger(item?.sortOrder) && item.sortOrder >= 0 ? item.sortOrder : index }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.index - right.index)
    .map(({ item }) => item);
}

function normalizeExtension(extension = {}) {
  const id = String(valueOf(extension, ["id", "extensionId"], ""));
  const profileIds = asArray(extension.profileIds || extension.activeProfileIds).map((profileId) => String(profileId));
  return {
    ...extension,
    id,
    name: String(valueOf(extension, ["name", "title"], id ? `插件 ${id.slice(0, 6)}` : "未命名插件")),
    version: String(valueOf(extension, ["version"], "未知版本")),
    description: String(valueOf(extension, ["description"], "")),
    path: String(valueOf(extension, ["path", "sourcePath"], "")),
    updateUrl: String(valueOf(extension, ["updateUrl"], "")),
    updateStatus: String(valueOf(extension, ["updateStatus"], extension.updateUrl ? "unknown" : "unavailable")),
    updateVersion: String(valueOf(extension, ["updateVersion"], "")),
    updateError: String(valueOf(extension, ["updateError"], "")),
    lastUpdateCheckedAt: String(valueOf(extension, ["lastUpdateCheckedAt"], "")),
    profileIds: [...new Set(profileIds)],
    runtime: extension.runtime && typeof extension.runtime === "object" ? extension.runtime : {},
  };
}

function normalizeState(nextState = {}) {
  const source = nextState && typeof nextState === "object" ? nextState : {};
  return {
    ...source,
    appVersion: String(valueOf(source, ["appVersion"], "")),
    brandName: String(valueOf(source, ["brandName"], "简约指纹")),
    brandDescription: generatedBrandDescription(valueOf(source, ["brandDescription"], "")),
    profiles: asArray(source.profiles).map(normalizeProfile),
    nodes: asArray(source.nodes).map(normalizeNode),
    subscriptions: sortSubscriptions(asArray(source.subscriptions).map(normalizeSubscription)),
    extensions: asArray(source.extensions).map(normalizeExtension),
    passwordEntries: asArray(source.passwordEntries).filter((item) => item && typeof item === "object").map((item) => ({
      id: String(valueOf(item, ["id"], "")),
      profileId: String(valueOf(item, ["profileId"], "")),
      service: String(valueOf(item, ["service"], "")),
      account: String(valueOf(item, ["account"], "")),
      website: String(valueOf(item, ["website"], "")),
      notes: String(valueOf(item, ["notes"], "")),
      updatedAt: String(valueOf(item, ["updatedAt"], "")),
    })),
    coreUpdates: asArray(source.coreUpdates).filter((item) => item && typeof item === "object").map((item) => ({
      ...item,
      core: String(valueOf(item, ["core"], "xray")),
      currentVersion: String(valueOf(item, ["currentVersion"], "")),
      latestVersion: String(valueOf(item, ["latestVersion"], "")),
    })),
    settings: source.settings && typeof source.settings === "object"
      ? { ...source.settings, theme: normalizeTheme(source.settings.theme) }
      : { theme: { ...DEFAULT_THEME } },
    meta: source.meta && typeof source.meta === "object" ? source.meta : {},
    connection: source.connection && typeof source.connection === "object"
      ? { direct: source.connection.direct && typeof source.connection.direct === "object" ? source.connection.direct : null }
      : { direct: null },
    core: source.core && typeof source.core === "object" ? source.core : {},
    engine: source.engine && typeof source.engine === "object"
      ? { mode: String(valueOf(source.engine, ["mode"], "electron")), configured: Boolean(source.engine.configured) }
      : { mode: "electron", configured: false },
    engineUpdate: source.engineUpdate && typeof source.engineUpdate === "object"
      ? {
        ...source.engineUpdate,
        currentVersion: String(valueOf(source.engineUpdate, ["currentVersion"], "")),
        latestVersion: String(valueOf(source.engineUpdate, ["latestVersion"], "")),
      }
      : null,
  };
}

function mergeState(nextState) {
  const normalized = normalizeState(nextState);
  const previousCoreUpdates = new Map(appState.coreUpdates.map((update) => [`${update.core}:${update.latestVersion}`, update]));
  const previousEngineUpdate = appState.engineUpdate;
  appState.appVersion = normalized.appVersion;
  appState.brandName = normalized.brandName;
  appState.brandDescription = normalized.brandDescription;
  appState.profiles = normalized.profiles;
  appState.nodes = normalized.nodes;
  appState.subscriptions = normalized.subscriptions;
  appState.extensions = normalized.extensions;
  appState.passwordEntries = normalized.passwordEntries;
  appState.coreUpdates = normalized.coreUpdates;
  appState.settings = normalized.settings;
  appState.meta = normalized.meta;
  appState.connection = normalized.connection;
  appState.core = normalized.core;
  appState.engine = normalized.engine;
  appState.engineUpdate = normalized.engineUpdate;
  applyTheme(normalized.settings.theme);
  // 启动或停止完成后，以主进程推送的状态为准。
  for (const [id] of Object.entries(appState.profileStatuses)) {
    const profile = appState.profiles.find((item) => item.id === id);
    if (!profile || ["running", "stopped", "error"].includes(String(profile.status).toLowerCase())) {
      delete appState.profileStatuses[id];
    }
  }
  for (const update of normalized.coreUpdates) {
    const noticeKey = `${update.core}:${update.latestVersion}`;
    if (!noticeKey.endsWith(":")) {
      announceCoreUpdate(update, previousCoreUpdates.has(noticeKey));
    }
  }
  if (normalized.engineUpdate) announceBrowserUpdate(normalized.engineUpdate, Boolean(previousEngineUpdate?.latestVersion === normalized.engineUpdate.latestVersion));
  renderAll();
}

function setSyncState(label, kind = "") {
  const element = $("#sync-state");
  if (!element) return;
  element.textContent = label;
  element.classList.toggle("is-busy", kind === "busy");
  element.classList.toggle("is-error", kind === "error");
}

function showToast(message, kind = "info") {
  const region = $("#toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast toast--${kind}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 4400);
}

function announceCoreUpdate(update, wasAlreadyKnown = false) {
  const coreLabel = update?.core === "singbox" ? "sing-box" : "Xray-core";
  const latestVersion = String(update?.latestVersion || "").trim();
  if (!latestVersion || wasAlreadyKnown) return;
  const noticeKey = `${update.core}:${latestVersion}`;
  if (shownCoreUpdateNotices.has(noticeKey)) return;
  shownCoreUpdateNotices.add(noticeKey);
  showToast(`${coreLabel} 有新版本 ${latestVersion}，请在设置中更新`, "info");
}

function announceBrowserUpdate(update, wasAlreadyKnown = false) {
  const latestVersion = String(update?.latestVersion || "").trim();
  if (!latestVersion || wasAlreadyKnown) return;
  const noticeKey = `browser:${latestVersion}`;
  if (shownCoreUpdateNotices.has(noticeKey)) return;
  shownCoreUpdateNotices.add(noticeKey);
  showToast(`Chromium 浏览器内核有新版本 ${latestVersion}，请在设置中更新`, "info");
}

function formatDate(value) {
  if (!value) return "尚未使用";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatSubscriptionDate(value) {
  if (!value) return "未识别";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "未识别";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / (1024 ** exponent);
  return `${amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ${units[exponent]}`;
}

function profileTrafficValues(profile) {
  const traffic = profile?.traffic || {};
  const total = Number(traffic.totalBytes) || 0;
  const uploaded = Number(traffic.uploadedBytes) || 0;
  const downloaded = Number(traffic.downloadedBytes) || 0;
  return {
    total: formatBytes(total),
    uploaded: formatBytes(uploaded),
    downloaded: formatBytes(downloaded),
  };
}

function profileTrafficLabel(profile) {
  const { total, uploaded, downloaded } = profileTrafficValues(profile);
  return `${total}（上行 ${uploaded}，下行 ${downloaded}）`;
}

function renderProfileTrafficLines(profile, includeLabel = false) {
  const { total, uploaded, downloaded } = profileTrafficValues(profile);
  return `<span class="profile-traffic-lines"><span class="profile-traffic-total">${includeLabel ? "流量 " : ""}${escapeHtml(total)}</span><span class="profile-traffic-detail">上行 ${escapeHtml(uploaded)}</span><span class="profile-traffic-detail">下行 ${escapeHtml(downloaded)}</span></span>`;
}

function formatResetRemaining(metadata) {
  const resetAt = metadata?.resetAt ? new Date(metadata.resetAt).getTime() : Number.NaN;
  const fallback = Number(metadata?.resetAfterSeconds);
  let seconds = Number.isFinite(resetAt) ? Math.max(0, Math.round((resetAt - Date.now()) / 1000)) : (Number.isFinite(fallback) ? Math.max(0, Math.round(fallback)) : Number.NaN);
  if (!Number.isFinite(seconds)) return "未识别";
  if (seconds >= 24 * 60 * 60) return `${Math.ceil(seconds / (24 * 60 * 60))} 天`;
  if (seconds >= 60 * 60) return `${Math.ceil(seconds / (60 * 60))} 小时`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} 分钟`;
  return `${seconds} 秒`;
}

function subscriptionResetLabel(metadata) {
  return metadata?.resetAt ? formatSubscriptionDate(metadata.resetAt) : formatResetRemaining(metadata);
}

function subscriptionRemainingLabel(metadata) {
  if (!metadata) return "未识别";
  if (metadata.remainingBytes !== null && metadata.remainingBytes !== undefined && metadata.remainingBytes !== "") return formatBytes(metadata.remainingBytes);
  if (Number(metadata.totalBytes) === 0) return "不限量";
  return "未识别";
}

function subscriptionStatProgress(metadata, type, subscription) {
  if (type === "traffic") {
    if (metadata?.totalBytes === null || metadata?.totalBytes === undefined || metadata?.totalBytes === "") return 0;
    const total = Number(metadata?.totalBytes);
    const remaining = Number(metadata?.remainingBytes);
    if (total === 0) return 100;
    if (metadata?.remainingBytes !== null && metadata?.remainingBytes !== undefined && metadata?.remainingBytes !== ""
      && Number.isFinite(total) && total > 0 && Number.isFinite(remaining)) {
      return Math.min(100, Math.max(0, (remaining / total) * 100));
    }
    return 0;
  }
  if (type === "nodes") return Number(subscription?.availableNodeCount) > 0 ? 100 : 0;
  return metadata?.[type] ? 100 : 0;
}

function initials(name) {
  const clean = String(name || "?").trim();
  return clean.slice(0, 1).toUpperCase();
}

function nodeLabel(nodeId) {
  if (!nodeId || nodeId === "direct" || nodeId === "__direct__") return "系统直连";
  const node = appState.nodes.find((candidate) => candidate.id === nodeId);
  return node ? node.name : "节点已移除";
}

function nodeAddress(node) {
  if (!node?.host) return "未填写地址";
  const host = String(node.host).includes(":") && !String(node.host).startsWith("[")
    ? `[${node.host}]`
    : node.host;
  return node.port ? `${host}:${node.port}` : host;
}

function nodeIpAddress(node) {
  return String(valueOf(node, ["ipAddress", "ip", "resolvedIp", "host"], "未解析"));
}

function isVisibleNode(node) {
  return Boolean(node && node.subscriptionInfo !== true && node.unsupported !== true && node.supported !== false && node.status !== "unsupported");
}

const AVAILABLE_NODE_STATUSES = new Set(["ok", "ready", "available", "healthy", "reachable"]);
const UNAVAILABLE_NODE_STATUSES = new Set(["error", "failed", "unreachable", "invalid", "aborted"]);

function isAvailableNode(node) {
  return isVisibleNode(node) && AVAILABLE_NODE_STATUSES.has(String(node.status || "").toLowerCase());
}

function isNodeVisibleInList(node) {
  return isVisibleNode(node) && !UNAVAILABLE_NODE_STATUSES.has(String(node.status || "").toLowerCase());
}

function isNodeCheckable(node) {
  const status = String(node?.status || "").toLowerCase();
  const visibleInCurrentGroup = String(appState.nodeGroup || "").startsWith("subscription:")
    ? isNodeVisibleInGroup(node, appState.nodeGroup)
    : isNodeVisibleInList(node);
  return visibleInCurrentGroup
    && node?.supported !== false
    && status !== "unsupported"
    && !["checking", "pending"].includes(status);
}

function isSelectableNode(node) {
  return isAvailableNode(node);
}

function isSelectableConnectionNode(node) {
  if (isSelectableNode(node)) return true;
  return Boolean(node?.id && appState.nodeChecks[node.id] && String(node.status || "").toLowerCase() === "checking");
}

const PROFILE_CONFIG_LOCKED_STATUSES = new Set([
  "running", "started", "open", "active", "starting", "stopping", "switching", "saving",
]);

function profileStatus(profile) {
  const eventStatus = appState.profileStatuses[profile.id];
  const status = String(eventStatus || profile.status || "stopped").toLowerCase();
  if (["running", "started", "open", "active"].includes(status)) return { label: "运行中", className: "status-badge--running", dot: "status-dot--good", running: true };
  if (["error", "failed"].includes(status)) return { label: "启动失败", className: "status-badge--error", dot: "status-dot--bad", running: false };
  if (["starting", "stopping", "checking"].includes(status)) return { label: "处理中", className: "status-badge--warn", dot: "status-dot--warn", running: false };
  return { label: "已停止", className: "", dot: "", running: false };
}

function syncProfileConfigLock() {
  const profileId = $("#profile-id")?.value || "";
  const profile = appState.profiles.find((item) => item.id === profileId);
  const status = String(appState.profileStatuses[profileId] || profile?.status || "stopped").toLowerCase();
  const locked = Boolean(profile && PROFILE_CONFIG_LOCKED_STATUSES.has(status));
  for (const fieldId of ["profile-node", "profile-test-origins", "profile-notes"]) {
    const field = $(`#${fieldId}`);
    const wrapper = field?.closest("[data-profile-lock-field]");
    if (!field || !wrapper) continue;
    field.disabled = locked;
    wrapper.classList.toggle("is-locked", locked);
    const trigger = wrapper.querySelector('[data-action="profile-config-locked"]');
    if (trigger) trigger.hidden = !locked;
  }
}

function nodeStatus(node) {
  const status = String(node.status || "unknown").toLowerCase();
  const hasProbeStatus = ["ok", "ready", "available", "healthy", "reachable", "checking", "pending", "error", "failed", "unreachable", "unsupported", "invalid"].includes(status);
  if (node.requiresCore && node.supported !== false && !hasProbeStatus) return { label: node.core === "singbox" ? "sing-box 托管" : "Xray 托管", className: "status-badge--ready", dot: "status-dot--good" };
  if (["ok", "ready", "available", "healthy", "reachable"].includes(status)) return { label: "可用", className: "status-badge--ready", dot: "status-dot--good" };
  if (["checking", "pending"].includes(status)) return { label: "检查中", className: "status-badge--warn", dot: "status-dot--warn" };
  if (["error", "failed", "unreachable", "invalid", "aborted"].includes(status)) return { label: "不可用", className: "status-badge--error", dot: "status-dot--bad" };
  if (["unsupported"].includes(status)) return { label: "不支持", className: "status-badge--warn", dot: "status-dot--warn" };
  return { label: "未检查", className: "", dot: "" };
}

function connectionHealthStatus(health = {}) {
  const source = health && typeof health === "object" ? health : {};
  const status = String(source.status || "unknown").toLowerCase();
  if (["ok", "ready", "available", "healthy", "reachable"].includes(status)) {
    const label = source.requiresCore && source.lastCheckPhase === "tcp-connect" ? "服务器可达" : "已连接";
    return { label, className: "status-badge--ready", dot: "status-dot--good", reachable: true };
  }
  if (["checking", "pending"].includes(status)) {
    return { label: "检测中", className: "status-badge--warn", dot: "status-dot--warn", checking: true };
  }
  if (["unsupported"].includes(status)) {
    return { label: "不支持", className: "status-badge--warn", dot: "status-dot--warn" };
  }
  if (["invalid"].includes(status)) {
    return { label: "配置无效", className: "status-badge--error", dot: "status-dot--bad" };
  }
  if (["error", "failed", "unreachable", "aborted"].includes(status)) {
    return { label: "连接失败", className: "status-badge--error", dot: "status-dot--bad" };
  }
  return { label: "未检测", className: "", dot: "" };
}

function connectionLatency(health, status = connectionHealthStatus(health)) {
  if (status.checking) return "检测中";
  const latency = health?.latencyMs === null || health?.latencyMs === undefined || health?.latencyMs === ""
    ? Number.NaN
    : Number(health.latencyMs);
  return status.reachable && Number.isFinite(latency) ? `${Math.max(0, Math.round(latency))} ms` : "未测";
}

function connectionHealthTitle(health, status, latency) {
  const checkedAt = health?.lastCheckedAt ? `最近检测：${formatDate(health.lastCheckedAt)}` : "尚未检测";
  const probe = health?.requiresCore && health?.lastCheckPhase === "tcp-connect" ? "检测方式：服务器 TCP 可达性；" : "";
  const error = !status.checking && health?.lastCheckError ? `；${health.lastCheckError}` : "";
  return `${probe}连接状态：${status.label}；延时：${latency}；${checkedAt}${error}`;
}

function renderConnectionHealth(health, extraClass = "") {
  const status = connectionHealthStatus(health);
  const latency = connectionLatency(health, status);
  const title = connectionHealthTitle(health, status, latency);
  return `<span class="connection-health ${escapeHtml(extraClass)}" role="status" aria-live="polite" title="${escapeHtml(title)}"><span class="status-badge ${status.className}"><span class="status-dot ${status.dot}"></span>${escapeHtml(status.label)}</span><span class="connection-latency">${escapeHtml(latency)}</span></span>`;
}

function applyRendererCheckResult(target, check, fallbackError) {
  if (!target || !check || typeof check !== "object") return;
  const reportedStatus = String(check.status || "").toLowerCase();
  const reachable = check.reachable ?? check.ok ?? check.available;
  if (reportedStatus === "unsupported") target.status = "unsupported";
  else if (reachable === true) target.status = "reachable";
  else if (reachable === false) target.status = "unreachable";
  else if (reportedStatus) target.status = reportedStatus;
  else target.status = "unknown";
  target.latencyMs = check.ok && Number.isFinite(Number(check.latencyMs))
    ? Math.max(0, Math.round(Number(check.latencyMs)))
    : null;
  target.lastCheckedAt = new Date().toISOString();
  target.lastCheckPhase = String(check.phase || "");
  target.lastCheckError = check.ok ? "" : String(check.error || fallbackError);
}

function profileConnectionHealth(profile) {
  if (!profile?.nodeId) return appState.connection?.direct || { status: "unknown" };
  return appState.nodes.find((node) => node.id === profile.nodeId) || { status: "unknown", lastCheckError: "节点已移除" };
}

function profileIpDetails(profile) {
  return profile?.nodeId
    ? appState.nodes.find((node) => node.id === profile.nodeId) || {}
    : appState.connection?.direct || {};
}

function profileIpValue(details, keys, fallback) {
  const value = valueOf(details, keys, "");
  return String(value || fallback);
}

function renderProfileIpSummary(profile, view = "profiles") {
  const details = profileIpDetails(profile);
  const health = profileConnectionHealth(profile);
  const metadata = ipSummaryMetadata(details);
  const ipAddress = profileIpValue(details, ["ipAddress", "ip", "resolvedIp"], "未解析");
  const latency = connectionLatency(health);
  const latencyMarkup = view === "profiles" ? `<span class="profile-ip-latency" aria-live="polite">延迟：${escapeHtml(latency)}</span>` : "";
  const summaryLabel = view === "profiles" ? `${metadata} ${ipAddress} 延迟：${latency}` : `${metadata} ${ipAddress}`;
  const isOpen = appState.connectionPicker.profileId === profile.id;
  const pickerId = `connection-options-${view}-${profile.id}`;
  return `<div class="profile-ip-picker profile-connection-picker${isOpen ? " is-open" : ""}" data-connection-picker data-profile-id="${escapeHtml(profile.id)}">
    <button class="profile-ip-summary" type="button" aria-haspopup="listbox" aria-expanded="${isOpen}" aria-controls="${escapeHtml(pickerId)}" aria-label="${escapeHtml(summaryLabel)}" title="点击选择连接" data-connection-trigger>${renderIpSummary(details, ipAddress, "profile-ip-metadata", "profile-ip-address")}${latencyMarkup}</button>
    <div class="connection-picker-popover" id="${escapeHtml(pickerId)}" popover="manual" role="dialog" aria-label="选择 ${escapeHtml(profile.name)} 的连接"${isOpen ? "" : " hidden"}>${isOpen ? `<label class="connection-picker-search"><span class="sr-only">搜索连接</span>${icon("search")}<input type="search" value="${escapeHtml(appState.connectionPicker.filter)}" placeholder="搜索节点、地址或订阅" autocomplete="off" data-connection-search /></label><div class="connection-picker-options">${renderConnectionPickerOptions(profile)}</div>` : ""}</div>
  </div>`;
}

function renderNavigation() {
  const versionLabel = $(".version-label");
  if (versionLabel) versionLabel.textContent = appState.appVersion ? `版本 ${appState.appVersion}` : "版本";
  const profileCount = $("#profile-nav-count");
  const nodeCount = $("#node-nav-count");
  const extensionCount = $("#extension-nav-count");
  const passwordCount = $("#password-nav-count");
  if (profileCount) profileCount.textContent = String(appState.profiles.length);
  if (nodeCount) nodeCount.textContent = String(appState.nodes.filter(isNodeVisibleInList).length);
  if (extensionCount) extensionCount.textContent = String(appState.extensions.length);
  if (passwordCount) passwordCount.textContent = String(appState.passwordEntries.length);
  $$("[data-view-target]").forEach((button) => button.classList.toggle("is-active", button.dataset.viewTarget === appState.activeView && button.classList.contains("nav-item")));
}

function renderBrand() {
  const name = $("#brand-name");
  const description = $("#brand-description");
  if (name) name.textContent = appState.brandName || "简约指纹";
  if (description) description.textContent = generatedBrandDescription(appState.brandDescription);
}

function subscriptionStatusLabel(status) {
  const normalized = String(status || "unknown").toLowerCase();
  return normalized === "ok" ? "已同步" : normalized === "error" ? "更新失败" : "未同步";
}

function subscriptionConnectionSummary(subscription) {
  const nodes = appState.nodes.filter((node) => node.sourceId && node.sourceId === subscription?.id && isVisibleNode(node));
  if (!nodes.length) {
    const unsupportedCount = Number(subscription?.unsupportedNodeCount) || 0;
    return unsupportedCount
      ? { label: `${unsupportedCount} 个不支持`, className: "status-badge--warn", dot: "status-dot--warn" }
      : { label: "暂无节点", className: "", dot: "" };
  }
  const ready = nodes.filter((node) => ["ok", "ready", "available", "healthy", "reachable"].includes(String(node.status || "").toLowerCase())).length;
  const checking = nodes.some((node) => ["checking", "pending"].includes(String(node.status || "").toLowerCase()));
  const checked = nodes.filter((node) => ["ok", "ready", "available", "healthy", "reachable", "error", "failed", "unreachable", "unsupported", "invalid"].includes(String(node.status || "").toLowerCase())).length;
  if (checking) return { label: "检查中", className: "status-badge--warn", dot: "status-dot--warn" };
  if (!checked) return { label: "未检测", className: "", dot: "" };
  if (ready) return { label: `${ready}/${nodes.length} 可达`, className: "status-badge--ready", dot: "status-dot--good" };
  return { label: "暂无可达节点", className: "status-badge--error", dot: "status-dot--bad" };
}

function renderSubscriptionConnection(subscription) {
  const summary = subscriptionConnectionSummary(subscription);
  return `<span class="subscription-health status-badge ${summary.className}" title="订阅节点连通性"><span class="status-dot ${summary.dot}"></span>${escapeHtml(summary.label)}</span>`;
}

function renderSubscriptions() {
  const table = $("#subscriptions-table");
  const empty = $("#subscriptions-empty");
  if (!table || !empty) return;
  const filter = appState.subscriptionFilter.trim().toLocaleLowerCase();
  const allSubscriptions = asArray(appState.subscriptions);
  const subscriptions = allSubscriptions.map((item, index) => ({ item, index })).filter(({ item, index }) => {
    if (!filter) return true;
    return `${subscriptionLabel(item, index)} ${item.source || ""} ${item.status || ""} ${(item.metadata?.messages || []).join(" ")}`.toLocaleLowerCase().includes(filter);
  });
  table.innerHTML = subscriptions.map(({ item, index }) => {
    const status = String(item.status || "unknown").toLowerCase();
    const statusLabel = subscriptionStatusLabel(status);
    const statusClass = status === "ok" ? "status-badge--ready" : status === "error" ? "status-badge--error" : "";
    const metadata = item.metadata || {};
    const message = Array.isArray(metadata.messages) && metadata.messages.length ? metadata.messages[0] : "";
    const stats = [
      ["traffic", "cloud", "剩余流量", subscriptionRemainingLabel(metadata)],
      ["expiresAt", "calendar", "最近到期", formatSubscriptionDate(metadata.expiresAt)],
      ["resetAt", "clock", "下次重置", subscriptionResetLabel(metadata)],
      ["nodes", "nodes", "可用节点", String(item.availableNodeCount ?? item.nodeCount ?? 0)],
    ].map(([type, iconName, label, value]) => `<span class="subscription-stat" data-tone="${escapeHtml(type)}"><span class="subscription-stat-icon" aria-hidden="true">${icon(iconName)}</span><b>${escapeHtml(label)}</b><strong>${escapeHtml(value)}</strong><span class="subscription-stat-track" aria-hidden="true"><span class="subscription-stat-fill" data-progress="${subscriptionStatProgress(metadata, type, item)}"></span></span></span>`).join("");
    const name = subscriptionLabel(item, index);
    const isFirst = index === 0;
    const isLast = index === allSubscriptions.length - 1;
    const totalNodeCount = Number(item.nodeCount) || 0;
    const unsupportedNodeCount = Number(item.unsupportedNodeCount) || 0;
    const nodeSummary = `<span class="subscription-source">${escapeHtml(item.source || "受保护的订阅地址")}</span><span class="subscription-counts">${escapeHtml(String(totalNodeCount))} 个节点${unsupportedNodeCount ? ` · <span class="subscription-unsupported-count">${escapeHtml(String(unsupportedNodeCount))} 个不支持</span>` : ""}</span>`;
    return `<div class="subscription-row" draggable="true" data-subscription-row="${escapeHtml(item.id)}"><div class="subscription-copy"><strong class="subscription-name" data-subscription-name="${escapeHtml(item.id)}" tabindex="0" title="双击编辑订阅名称">${escapeHtml(name)}</strong><span class="subscription-node-summary">${nodeSummary}</span>${message ? `<span class="subscription-message" title="${escapeHtml(message)}">${escapeHtml(message)}</span>` : ""}</div><div class="subscription-row-stats" aria-label="${escapeHtml(name)}统计">${stats}</div><div class="subscription-meta"><span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>${renderSubscriptionConnection(item)}<span class="subscription-updated">${escapeHtml(formatDate(item.lastUpdatedAt))}</span><div class="subscription-order-controls" aria-label="${escapeHtml(name)}排序"><button class="row-action" type="button" data-action="edit-subscription" data-id="${escapeHtml(item.id)}" title="编辑订阅" aria-label="编辑订阅">${icon("edit")}</button><button class="row-action" type="button" data-action="move-subscription" data-direction="up" data-id="${escapeHtml(item.id)}" title="向上移动" aria-label="向上移动"${isFirst ? " disabled" : ""}>${icon("arrow-up")}</button><button class="row-action" type="button" data-action="move-subscription" data-direction="down" data-id="${escapeHtml(item.id)}" title="向下移动" aria-label="向下移动"${isLast ? " disabled" : ""}>${icon("arrow-down")}</button><button class="row-action" type="button" data-action="refresh-subscription" data-id="${escapeHtml(item.id)}" title="在线更新" aria-label="在线更新">${icon("refresh")}</button><button class="row-action row-action--danger" type="button" data-action="delete-subscription" data-id="${escapeHtml(item.id)}" title="删除订阅" aria-label="删除订阅">${icon("trash")}</button></div></div></div>`;
  }).join("");
  $$(".subscription-stat-fill", table).forEach((fill) => {
    const progress = Math.min(100, Math.max(0, Number(fill.dataset.progress) || 0));
    fill.style.width = `${progress}%`;
  });
  const summary = $("#subscription-summary");
  if (summary) summary.textContent = filter ? `${subscriptions.length} / ${allSubscriptions.length} 个订阅` : `${allSubscriptions.length} 个订阅`;
  const title = empty.querySelector("strong");
  const message = empty.querySelector("span:not(.empty-icon)");
  if (title) title.textContent = filter ? "没有匹配的订阅" : "还没有在线订阅";
  if (message) message.textContent = filter ? "调整搜索条件后重试。" : "导入带地址的订阅后，可以在这里手动更新。";
  empty.hidden = subscriptions.length > 0;
}

function beginSubscriptionRename(target) {
  const subscriptionId = String(target?.dataset.subscriptionName || "");
  const item = appState.subscriptions.find((candidate) => candidate.id === subscriptionId);
  if (!target || !item || target.matches("input")) return;
  const index = appState.subscriptions.indexOf(item);
  const originalName = subscriptionLabel(item, index);
  const input = document.createElement("input");
  input.className = "subscription-name-input";
  input.type = "text";
  input.maxLength = 120;
  input.value = originalName;
  input.setAttribute("aria-label", "订阅名称");
  target.replaceWith(input);

  let settled = false;
  const finish = async (save) => {
    if (settled) return;
    settled = true;
    if (!save) {
      renderSubscriptions();
      return;
    }
    const name = input.value.trim();
    if (!name) {
      renderSubscriptions();
      showToast("订阅名称不能为空", "warn");
      return;
    }
    if (name === originalName) {
      renderSubscriptions();
      return;
    }
    try {
      setSyncState("保存中", "busy");
      await invokeApi("renameSubscription", { subscriptionId, name });
      await refreshState();
      showToast("订阅名称已保存", "success");
    } catch (error) {
      setSyncState("连接失败", "error");
      renderSubscriptions();
      showToast(error.message || "保存订阅名称失败", "error");
    }
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void finish(true);
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      void finish(false);
      input.blur();
    }
  });
  input.addEventListener("blur", () => void finish(true), { once: true });
  input.focus();
  input.select();
}

function extensionPathLabel(value) {
  const source = String(value || "");
  const parts = source.split(/[\\/]/);
  return parts[parts.length - 1] || source || "未记录路径";
}

function renderExtensions() {
  const list = $("#extensions-list");
  const empty = $("#extensions-empty");
  if (!list || !empty) return;
  const updateAllButton = $("#update-all-extensions");
  if (updateAllButton) {
    updateAllButton.disabled = extensionBatchUpdating || appState.extensions.length === 0;
    updateAllButton.setAttribute("aria-busy", String(extensionBatchUpdating));
    const label = updateAllButton.querySelector("span");
    if (label) label.textContent = extensionBatchUpdating ? "更新中…" : "批量更新";
  }
  const filter = appState.extensionFilter.trim().toLocaleLowerCase();
  const extensions = appState.extensions.filter((extension) => {
    if (!filter) return true;
    return `${extension.name} ${extension.version} ${extension.path}`.toLocaleLowerCase().includes(filter);
  });
  list.innerHTML = extensions.map((extension) => {
    const actionDisabled = extensionBatchUpdating ? " disabled" : "";
    const runtimeErrors = Object.values(extension.runtime || {}).filter((item) => item?.status === "error");
    const runtimeLabel = runtimeErrors.length ? `<span class="status-badge status-badge--error"><span class="status-dot status-dot--bad"></span>${runtimeErrors.length} 个环境加载失败</span>` : "";
    const panelLabel = extension.hasPanel ? `<span class="status-badge status-badge--ready"><span class="status-dot status-dot--good"></span>含插件面板</span>` : "";
    const hasOnlineSource = Boolean(extension.updateUrl);
    const updateLabel = hasOnlineSource
      ? extension.updateStatus === "available"
        ? `<span class="status-badge status-badge--ready"><span class="status-dot status-dot--good"></span>可更新至 v${escapeHtml(extension.updateVersion)}</span>`
        : extension.updateStatus === "checking"
          ? `<span class="status-badge status-badge--warn"><span class="status-dot status-dot--warn"></span>检查更新中</span>`
          : extension.updateStatus === "error"
            ? `<span class="status-badge status-badge--error" title="${escapeHtml(extension.updateError)}"><span class="status-dot status-dot--bad"></span>更新检查失败</span>`
            : extension.updateStatus === "unavailable"
              ? `<span class="status-badge status-badge--warn" title="${escapeHtml(extension.updateError)}"><span class="status-dot status-dot--warn"></span>未发现官方更新地址</span>`
              : extension.updateStatus === "current"
                ? `<span class="status-badge"><span class="status-dot status-dot--good"></span>已是最新版</span>`
                : ""
      : `<span class="status-badge"><span class="status-dot status-dot--good"></span>本地代码</span>`;
    const updateActionTitle = hasOnlineSource ? "更新在线版本" : "更新本地代码";
    const updateActions = `${hasOnlineSource ? `<button class="row-action" type="button" data-action="check-extension-update" data-id="${escapeHtml(extension.id)}" title="检查官方更新" aria-label="检查官方更新"${actionDisabled}>${icon("refresh")}</button>` : ""}<button class="row-action" type="button" data-action="update-extension" data-id="${escapeHtml(extension.id)}" title="${updateActionTitle}" aria-label="${updateActionTitle}"${actionDisabled}>${icon(hasOnlineSource ? "download" : "refresh")}</button>`;
    const targets = appState.profiles.length
      ? appState.profiles.map((profile) => {
        const checked = extension.profileIds.includes(profile.id);
        return `<label class="plugin-target"><input type="checkbox" data-extension-profile="${escapeHtml(profile.id)}" data-extension-id="${escapeHtml(extension.id)}"${checked ? " checked" : ""}${actionDisabled} /><span>${escapeHtml(profile.name)}</span></label>`;
      }).join("")
      : `<span class="plugin-targets-label">暂无浏览器环境</span>`;
    const pluginIcon = extension.iconDataUrl
      ? `<img data-extension-icon src="${escapeHtml(extension.iconDataUrl)}" alt="" />`
      : icon("puzzle");
    return `<article class="plugin-row">
      <div class="plugin-primary"><span class="plugin-icon" aria-hidden="true">${pluginIcon}</span><span class="plugin-copy"><span class="plugin-name">${escapeHtml(extension.name)}</span><span class="plugin-meta">v${escapeHtml(extension.version)} · ${escapeHtml(extensionSourceLabel(extension))} · ${escapeHtml(extensionPathLabel(extension.path))}</span><span class="plugin-statuses">${panelLabel}${runtimeLabel}${updateLabel}</span></span></div>
      <div class="plugin-targets"><span class="plugin-targets-label">激活环境</span>${targets}</div>
      <div class="plugin-actions">${updateActions}<button class="row-action row-action--danger" type="button" data-action="delete-extension" data-id="${escapeHtml(extension.id)}" title="卸载插件" aria-label="卸载插件"${actionDisabled}>${icon("trash")}</button></div>
    </article>`;
  }).join("");
  for (const image of list.querySelectorAll("img[data-extension-icon]")) {
    image.addEventListener("error", () => {
      const container = image.parentElement;
      image.remove();
      container?.insertAdjacentHTML("beforeend", icon("puzzle"));
    }, { once: true });
  }
  empty.hidden = extensions.length > 0;
}

function renderPasswordEntries() {
  const list = $("#password-entries");
  const empty = $("#password-entries-empty");
  if (!list || !empty) return;
  const profiles = appState.profiles;
  if (!profiles.some((profile) => profile.id === appState.passwordProfileId)) {
    appState.passwordProfileId = profiles[0]?.id || "";
  }
  const environment = $("#password-environment");
  if (environment) {
    environment.innerHTML = profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`).join("");
    if (!profiles.length) environment.innerHTML = `<option value="">请先创建浏览器环境</option>`;
    environment.value = appState.passwordProfileId;
    environment.disabled = profiles.length === 0;
  }
  const hasEnvironment = Boolean(appState.passwordProfileId);
  $$('[data-action="new-password-entry"]').forEach((button) => { button.disabled = !hasEnvironment; });
  const search = $("#password-search");
  if (search) search.disabled = !hasEnvironment;
  $$(".password-secret-field", list).forEach(concealPasswordField);
  const filter = appState.passwordFilter.trim().toLocaleLowerCase();
  const scopedEntries = appState.passwordEntries.filter((entry) => entry.profileId === appState.passwordProfileId);
  const entries = scopedEntries.filter((entry) => (
    !filter || `${entry.service} ${entry.account} ${entry.website} ${entry.notes}`.toLocaleLowerCase().includes(filter)
  ));
  const openGroups = new Set($$(".password-site-group[open]", list).map((group) => group.dataset.passwordGroup));
  const groupedEntries = new Map();
  for (const entry of entries) {
    let website = "";
    try {
      const url = new URL(String(entry.website || ""));
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) website = url.origin;
    } catch {
      // Legacy records without a valid website are grouped by service below.
    }
    const service = String(entry.service || "未命名网站").trim() || "未命名网站";
    const key = website ? `origin:${website.toLocaleLowerCase()}` : `service:${service.toLocaleLowerCase()}`;
    if (!groupedEntries.has(key)) groupedEntries.set(key, { key, label: website || service, entries: [] });
    groupedEntries.get(key).entries.push(entry);
  }
  const renderEntry = (entry) => `<article class="password-entry">
    <div class="password-entry-heading">
      <div class="password-entry-title"><h3>${escapeHtml(entry.service)}</h3><span>${escapeHtml(entry.website || "")}</span></div>
      <div class="row-actions">
        <button class="row-action" type="button" data-action="edit-password-entry" data-id="${escapeHtml(entry.id)}" title="编辑记录" aria-label="编辑 ${escapeHtml(entry.service)}">${icon("edit")}</button>
        <button class="row-action row-action--danger" type="button" data-action="delete-password-entry" data-id="${escapeHtml(entry.id)}" title="删除记录" aria-label="删除 ${escapeHtml(entry.service)}">${icon("trash")}</button>
      </div>
    </div>
    <div class="password-entry-fields">
      <div class="password-entry-field"><span>账号</span><code>${escapeHtml(entry.account)}</code></div>
      <label class="password-entry-field"><span>密码</span><input class="text-input password-secret-field" type="password" readonly placeholder="••••••••" autocomplete="off" data-password-entry-id="${escapeHtml(entry.id)}" data-password-profile-id="${escapeHtml(entry.profileId)}" title="悬停或聚焦查看密码" aria-label="${escapeHtml(entry.service)} 密码，悬停或聚焦查看" /></label>
    </div>
    ${entry.notes ? `<p class="password-entry-notes">${escapeHtml(entry.notes)}</p>` : ""}
    <span class="password-entry-updated">${escapeHtml(formatDate(entry.updatedAt))}</span>
  </article>`;
  list.innerHTML = [...groupedEntries.values()].map((group) => {
    const preview = group.entries[0];
    return `<details class="password-site-group" data-password-group="${escapeHtml(group.key)}"${openGroups.has(group.key) ? " open" : ""}>
      <summary class="password-site-summary">
        <span class="password-site-icon" aria-hidden="true">${icon("globe")}</span>
        <span class="password-site-name" title="${escapeHtml(group.label)}">${escapeHtml(group.label)}</span>
        <span class="password-site-field password-site-account">
          <span class="password-site-field-label">账号</span>
          <span class="password-site-account-value">${escapeHtml(preview.account || "未填写")}</span>
        </span>
        <span class="password-site-field password-site-password">
          <span class="password-site-field-label">密码</span>
          <span class="password-site-secret password-secret-field" role="textbox" aria-readonly="true" tabindex="0" data-password-entry-id="${escapeHtml(preview.id)}" data-password-profile-id="${escapeHtml(preview.profileId)}" title="悬停或聚焦查看密码" aria-label="${escapeHtml(preview.service)} 密码，悬停或聚焦查看">••••••••</span>
        </span>
        <span class="password-site-field password-site-count">
          <span class="password-site-field-label">账号数量</span>
          <span class="password-site-count-value">${group.entries.length} 个账号</span>
        </span>
        <span class="password-site-chevron" aria-hidden="true">${icon("chevron")}</span>
      </summary>
      <div class="password-site-entries">${group.entries.map(renderEntry).join("")}</div>
    </details>`;
  }).join("");
  empty.hidden = entries.length > 0;
  const emptyTitle = $("strong", empty);
  if (emptyTitle) emptyTitle.textContent = !hasEnvironment
    ? "请先创建浏览器环境"
    : scopedEntries.length && !entries.length ? "没有匹配的密码记录" : "当前环境暂无密码记录";
}

function agentProtocolOptions() {
  return [
    { id: "openai-chat-completions", label: "OpenAI Chat Completions" },
    { id: "openai-responses", label: "OpenAI Responses" },
    { id: "anthropic-messages", label: "Anthropic Messages" },
    { id: "google-gemini", label: "Google Gemini" },
  ];
}

function agentReasoningOptions(settings = {}) {
  return asArray(settings.agentReasoningEfforts).length
    ? settings.agentReasoningEfforts
    : [
      { id: "off", label: "Off" },
      { id: "minimal", label: "Minimal" },
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High" },
      { id: "xhigh", label: "XHigh" },
      { id: "max", label: "Max" },
    ];
}

function agentScopeProfileIds() {
  return new Set(asArray(appState.settings.agentProfileIds).map((id) => String(id)));
}

function renderAgentManagement() {
  const container = $("#agent-management-card");
  if (!container) return;
  const settings = appState.settings || {};
  const configured = String(valueOf(settings, ["agentModel", "agentApi"], "")).trim();
  const protocol = String(valueOf(settings, ["agentProtocol"], "openai-chat-completions"));
  const jevModel = String(valueOf(settings, ["jevModel"], "jev-latest"));
  const jevProvider = String(valueOf(settings, ["jevProvider"], "typesafe"));
  container.innerHTML = `<div class="agent-management-summary">
    <div class="plugin-primary"><span class="plugin-icon agent-plugin-icon" aria-hidden="true">${icon("puzzle")}</span><span class="plugin-copy"><span class="plugin-name">网页助手 Agent</span><span class="plugin-meta">${escapeHtml(configured ? `${protocol} · ${configured}` : "尚未配置 Agent 模型")} · JEV ${escapeHtml(jevProvider)} / ${escapeHtml(jevModel)}</span><span class="plugin-statuses"><span class="status-badge ${settings.agentTokenSet ? "status-badge--ready" : "status-badge--warn"}><span class="status-dot ${settings.agentTokenSet ? "status-dot--good" : "status-dot--warn"}></span>${settings.agentTokenSet ? "Agent Key 已保存" : "等待 Agent Key"}</span><span class="status-badge"><span class="status-dot ${settings.jevKeySet ? "status-dot--good" : "status-dot--warn"}></span>${settings.jevKeySet ? "JEV Key 已保存" : "等待 JEV Key"}</span></span></span></div>
  </div>`;
}

function renderAgentEnvironmentManagement() {
  const container = $("#agent-environment-list");
  if (!container) return;
  const settings = appState.settings || {};
  const scopeAll = settings.agentProfileScope !== "selected";
  const selected = agentScopeProfileIds();
  const configIds = new Set(asArray(settings.agentProfileConfigIds).map((id) => String(id)));
  const activeCount = scopeAll
    ? appState.profiles.length
    : appState.profiles.filter((profile) => selected.has(String(profile.id)) || configIds.has(String(profile.id))).length;
  const targets = appState.profiles.length
    ? appState.profiles.map((profile) => {
      const profileId = String(profile.id);
      const custom = configIds.has(profileId);
      const active = configIds.has(profileId) || scopeAll || selected.has(profileId);
      const status = profileStatus(profile);
      return `<div class="agent-environment-target"><label class="plugin-target"><input type="checkbox" data-agent-profile="${escapeHtml(profileId)}"${active ? " checked" : ""} /><span>${escapeHtml(profile.name)}</span></label><span class="status-dot ${status.dot}" title="${escapeHtml(status.label)}" aria-label="${escapeHtml(status.label)}"></span><div class="agent-environment-actions"><button class="row-action" type="button" data-action="configure-agent-profile" data-id="${escapeHtml(profileId)}" title="配置 ${escapeHtml(profile.name)} 的 Agent" aria-label="配置 ${escapeHtml(profile.name)} 的 Agent">${icon("settings")}</button>${custom ? `<button class="row-action row-action--danger" type="button" data-action="clear-agent-profile" data-id="${escapeHtml(profileId)}" title="恢复全局配置" aria-label="恢复 ${escapeHtml(profile.name)} 的全局配置">${icon("link")}</button>` : ""}</div></div>`;
    }).join("")
    : `<div class="agent-environment-empty">还没有浏览器环境</div>`;
  const summary = $("#agent-environment-summary");
  if (summary) summary.textContent = scopeAll ? `全部环境 · ${appState.profiles.length}` : `已选 ${activeCount} / ${appState.profiles.length}`;
  container.innerHTML = `<div class="agent-environment-toolbar"><label class="plugin-target agent-scope-all"><input type="checkbox" data-agent-scope-all${scopeAll ? " checked" : ""}${appState.profiles.length ? "" : " disabled"} /><span>作用于全部环境</span></label><span class="agent-environment-hint">或单独选择环境</span></div><div class="agent-environment-targets">${targets}</div>`;
}

async function saveAgentScope(scope, profileIds) {
  try {
    setSyncState("保存中", "busy");
    await invokeApi("saveSettings", {
      agentProfileScope: scope === "selected" ? "selected" : "all",
      agentProfileIds: scope === "selected" ? profileIds : appState.profiles.map((profile) => profile.id),
    });
    await refreshState();
    showToast("Agent 激活环境已更新", "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    await refreshState();
    showToast(error.message || "更新 Agent 激活环境失败", "error");
  }
}

function agentFormElements() {
  return {
    profileId: $("#agent-profile-id"),
    scope: $("#agent-form-scope"),
    protocol: $("#manager-agent-protocol"),
    baseUrl: $("#manager-agent-base-url"),
    model: $("#manager-agent-model"),
    modelOptions: $("#manager-agent-model-options"),
    modelRefresh: $("#manager-agent-model-refresh"),
    modelStatus: $("#manager-agent-model-status"),
    token: $("#manager-agent-token"),
    tokenStatus: $("#manager-agent-token-status"),
    tokenClear: $("#manager-agent-token-clear"),
    context: $("#manager-agent-context"),
    output: $("#manager-agent-output"),
    reasoning: $("#manager-agent-reasoning"),
    temperature: $("#manager-agent-temperature"),
    steps: $("#manager-agent-steps"),
    jevProvider: $("#manager-jev-provider"),
    jevAutoJudgeEnabled: $("#manager-jev-enabled"),
    jevBaseUrl: $("#manager-jev-base-url"),
    jevModel: $("#manager-jev-model"),
    jevToken: $("#manager-jev-token"),
    jevTokenStatus: $("#manager-jev-token-status"),
    jevTokenClear: $("#manager-jev-token-clear"),
    connectionTest: $("#test-agent-connection"),
    connectionStatus: $("#agent-connection-status"),
  };
}

function fillAgentForm(settings = {}, profileId = "") {
  const elements = agentFormElements();
  agentFormProfileId = String(profileId || "");
  if (elements.profileId) elements.profileId.value = agentFormProfileId;
  if (elements.scope) elements.scope.textContent = agentFormProfileId
    ? `仅保存“${appState.profiles.find((profile) => profile.id === agentFormProfileId)?.name || agentFormProfileId}”的覆盖配置。`
    : "保存为所有环境的默认配置。";
  if (elements.protocol) {
    elements.protocol.replaceChildren(...agentProtocolOptions().map((option) => {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.label;
      node.selected = option.id === String(valueOf(settings, ["agentProtocol"], "openai-chat-completions"));
      return node;
    }));
  }
  if (elements.baseUrl) elements.baseUrl.value = String(valueOf(settings, ["agentBaseUrl", "agentApiUrl"], ""));
  if (elements.model) elements.model.value = String(valueOf(settings, ["agentModel", "agentApi"], ""));
  if (elements.modelOptions) elements.modelOptions.replaceChildren();
  if (elements.modelStatus) elements.modelStatus.textContent = "点击模型输入框获取可用模型";
  if (agentModelRequestId) api.cancelAgentRequest?.(agentModelRequestId);
  if (agentConnectionTestRequestId) api.cancelAgentRequest?.(agentConnectionTestRequestId);
  agentModelRequestId = "";
  agentConnectionTestRequestId = "";
  agentModelFetchKey = "";
  agentModelFetchGeneration += 1;
  if (elements.token) elements.token.value = "";
  if (elements.tokenStatus) elements.tokenStatus.textContent = settings.agentTokenSet ? "已保存 Token" : "未保存 Token";
  if (elements.tokenClear) elements.tokenClear.hidden = !settings.agentTokenSet;
  if (elements.context) elements.context.value = String(valueOf(settings, ["agentContextBudgetTokens"], 200000));
  if (elements.output) elements.output.value = String(valueOf(settings, ["agentMaxOutputTokens"], 8192));
  if (elements.reasoning) {
    const selected = String(valueOf(settings, ["agentReasoningEffort"], "medium"));
    elements.reasoning.replaceChildren(...agentReasoningOptions(settings).map((option) => {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.label;
      node.selected = option.id === selected;
      return node;
    }));
  }
  if (elements.temperature) elements.temperature.value = settings.agentTemperature === null ? "" : String(valueOf(settings, ["agentTemperature"], 0.2));
  if (elements.steps) elements.steps.value = String(valueOf(settings, ["agentMaxSteps"], 0));
  const providers = asArray(settings.jevProviders).length ? settings.jevProviders : [{ id: "typesafe", label: "TypeSafe 官方", defaultBaseUrl: "https://api.typesafe.ai" }, { id: "custom", label: "自定义 JEV 接口", defaultBaseUrl: "" }];
  if (elements.jevProvider) {
    elements.jevProvider.replaceChildren(...providers.map((provider) => {
      const node = document.createElement("option");
      node.value = provider.id;
      node.textContent = provider.label;
      node.selected = provider.id === String(valueOf(settings, ["jevProvider"], "typesafe"));
      return node;
    }));
  }
  if (elements.jevAutoJudgeEnabled) elements.jevAutoJudgeEnabled.checked = settings.jevAutoJudgeEnabled !== false;
  if (elements.jevBaseUrl) elements.jevBaseUrl.value = String(valueOf(settings, ["jevBaseUrl"], "https://api.typesafe.ai"));
  if (elements.jevModel) elements.jevModel.value = String(valueOf(settings, ["jevModel"], "jev-latest"));
  if (elements.jevToken) elements.jevToken.value = "";
  if (elements.jevTokenStatus) elements.jevTokenStatus.textContent = settings.jevKeySet ? "已保存 Key" : "未保存 Key";
  if (elements.jevTokenClear) elements.jevTokenClear.hidden = !settings.jevKeySet;
  clearManagerAgentToken = false;
  clearManagerJevToken = false;
  if (elements.connectionStatus) elements.connectionStatus.textContent = "";
}

async function openAgentConfig(profileId = "") {
  const id = String(profileId || "");
  try {
    let settings = appState.settings;
    if (id) {
      const result = await invokeApi("getAgentProfileSettings", id);
      settings = result?.settings || settings;
    }
    fillAgentForm(settings, id);
    activateView("agent");
  } catch (error) {
    showToast(error.message || "读取 Agent 配置失败", "error");
  }
}

function currentAgentModelRequest() {
  const elements = agentFormElements();
  const token = elements.token?.value.trim() || "";
  return {
    profileId: agentFormProfileId,
    protocol: elements.protocol?.value || "openai-chat-completions",
    baseUrl: elements.baseUrl?.value.trim() || "",
    ...(token ? { token } : {}),
  };
}

async function fetchAgentModels(force = false) {
  const elements = agentFormElements();
  if (!elements.model || !elements.modelOptions) return;
  const request = currentAgentModelRequest();
  if (!request.baseUrl) {
    if (elements.modelStatus) elements.modelStatus.textContent = "请先填写接口地址";
    return;
  }
  const key = JSON.stringify({ ...request, token: request.token ? "custom" : "stored" });
  if (!force && key === agentModelFetchKey && elements.modelOptions.options.length) return;
  if (agentModelFetchPromise && !force) return agentModelFetchPromise;
  if (force) {
    if (agentModelRequestId) api.cancelAgentRequest?.(agentModelRequestId);
    agentModelRequestId = "";
    agentModelFetchGeneration += 1;
    agentModelFetchPromise = null;
  }
  agentModelFetchKey = key;
  const generation = agentModelFetchGeneration;
  if (elements.modelStatus) elements.modelStatus.textContent = "获取模型列表中…";
  elements.modelRefresh?.classList.add("is-loading");
  elements.modelRefresh?.setAttribute("title", "取消模型列表请求");
  elements.modelRefresh?.setAttribute("aria-label", "取消模型列表请求");
  agentModelFetchPromise = (async () => {
    try {
      const result = await api.fetchAgentModels(request, (id) => {
        if (generation === agentModelFetchGeneration) agentModelRequestId = id;
      });
      if (!result?.ok) throw new Error(result?.error || "模型列表获取失败");
      if (generation !== agentModelFetchGeneration) return;
      elements.modelOptions.replaceChildren(...asArray(result.models).map((model) => {
        const option = document.createElement("option");
        option.value = String(model?.id || model || "");
        if (model?.label && model.label !== model.id) option.label = String(model.label);
        return option;
      }).filter((option) => option.value));
      if (elements.modelStatus) elements.modelStatus.textContent = result.models?.length
        ? `已获取 ${result.models.length} 个模型`
        : "接口未返回模型，可手动填写";
    } catch (error) {
      if (generation === agentModelFetchGeneration) {
        agentModelFetchKey = "";
        if (elements.modelStatus) elements.modelStatus.textContent = error.message === "请求已取消"
          ? "模型列表请求已取消"
          : error.message || "模型列表获取失败，可手动填写";
      }
    } finally {
      if (generation === agentModelFetchGeneration) {
        agentModelRequestId = "";
        elements.modelRefresh?.classList.remove("is-loading");
        elements.modelRefresh?.setAttribute("title", "刷新模型列表");
        elements.modelRefresh?.setAttribute("aria-label", "刷新模型列表");
        agentModelFetchPromise = null;
      }
    }
  })();
  return agentModelFetchPromise;
}

function cancelAgentModelFetch() {
  if (!agentModelRequestId) return false;
  api.cancelAgentRequest?.(agentModelRequestId);
  agentModelRequestId = "";
  agentModelFetchGeneration += 1;
  agentModelFetchPromise = null;
  const elements = agentFormElements();
  if (elements.modelStatus) elements.modelStatus.textContent = "模型列表请求已取消";
  elements.modelRefresh?.classList.remove("is-loading");
  elements.modelRefresh?.setAttribute("title", "刷新模型列表");
  elements.modelRefresh?.setAttribute("aria-label", "刷新模型列表");
  return true;
}

async function testAgentConnection() {
  const elements = agentFormElements();
  if (agentConnectionTestRequestId) {
    api.cancelAgentRequest?.(agentConnectionTestRequestId);
    agentConnectionTestRequestId = "";
    if (elements.connectionStatus) elements.connectionStatus.textContent = "连通性请求已取消";
    elements.connectionTest?.classList.remove("is-loading");
    elements.connectionTest?.setAttribute("title", "测试连通性");
    elements.connectionTest?.setAttribute("aria-label", "测试连通性");
    return;
  }
  const request = currentAgentModelRequest();
  if (!request.baseUrl) {
    if (elements.connectionStatus) elements.connectionStatus.textContent = "请先填写接口地址";
    return;
  }
  if (elements.connectionStatus) elements.connectionStatus.textContent = "测试中…";
  elements.connectionTest?.classList.add("is-loading");
  elements.connectionTest?.setAttribute("title", "取消连通性请求");
  elements.connectionTest?.setAttribute("aria-label", "取消连通性请求");
  let requestId = "";
  try {
    const result = await api.testAgentConnection(request, (id) => {
      requestId = id;
      agentConnectionTestRequestId = id;
    });
    if (!result?.ok) throw new Error(result?.error || "Agent 连通性测试失败");
    if (elements.connectionStatus) elements.connectionStatus.textContent = result.modelsAvailable
      ? `连接正常 · ${result.modelCount} 个模型`
      : "连接正常 · 未返回模型";
  } catch (error) {
    if (elements.connectionStatus) elements.connectionStatus.textContent = error.message === "请求已取消"
      ? "连通性请求已取消"
      : error.message || "Agent 连通性测试失败";
  } finally {
    if (!requestId || agentConnectionTestRequestId === requestId) {
      if (agentConnectionTestRequestId === requestId) agentConnectionTestRequestId = "";
      elements.connectionTest?.classList.remove("is-loading");
      elements.connectionTest?.setAttribute("title", "测试连通性");
      elements.connectionTest?.setAttribute("aria-label", "测试连通性");
    }
  }
}

async function saveAgentConfig(event) {
  event.preventDefault();
  const elements = agentFormElements();
  const payload = {
    agentProtocol: elements.protocol?.value || "openai-chat-completions",
    agentBaseUrl: elements.baseUrl?.value.trim() || "",
    agentModel: elements.model?.value.trim() || "",
    agentContextBudgetTokens: elements.context?.value || "200000",
    agentMaxOutputTokens: elements.output?.value || "8192",
    agentReasoningEffort: elements.reasoning?.value || "medium",
    agentTemperature: elements.temperature?.value === "" ? null : elements.temperature?.value,
    agentMaxSteps: elements.steps?.value || "0",
    jevAutoJudgeEnabled: elements.jevAutoJudgeEnabled?.checked === true,
    jevProvider: elements.jevProvider?.value || "typesafe",
    jevBaseUrl: elements.jevBaseUrl?.value.trim() || "",
    jevModel: elements.jevModel?.value.trim() || "jev-latest",
  };
  const agentToken = elements.token?.value.trim() || "";
  const jevToken = elements.jevToken?.value.trim() || "";
  if (agentToken || clearManagerAgentToken) {
    payload.agentToken = agentToken;
    payload.clearAgentToken = clearManagerAgentToken;
  }
  if (jevToken || clearManagerJevToken) {
    payload.jevToken = jevToken;
    payload.clearJevToken = clearManagerJevToken;
  }
  try {
    setSyncState("保存中", "busy");
    const result = agentFormProfileId
      ? await invokeApi("saveAgentProfileSettings", { ...payload, profileId: agentFormProfileId })
      : await invokeApi("saveSettings", payload);
    await refreshState();
    await openAgentConfig(agentFormProfileId);
    const notices = [];
    if (result?.agentKeyStatus === "not-retained") notices.push("Agent Key 未保留");
    if (result?.jevKeyStatus === "not-retained") notices.push("JEV Key 未保留");
    showToast(notices.length ? `配置已保存；${notices.join("，")}` : "Agent 与 JEV 配置已保存", notices.length ? "warn" : "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "保存 Agent 配置失败", "error");
  }
}

async function clearAgentProfile(profileId) {
  const profile = appState.profiles.find((item) => item.id === profileId);
  if (!profile || !(await requestConfirmation({
    title: "恢复全局 Agent 配置",
    message: `确定让“${profile.name}”恢复全局 Agent 配置吗？`,
    confirmLabel: "恢复配置",
  }))) return;
  try {
    await invokeApi("saveAgentProfileSettings", { profileId, useGlobal: true });
    await refreshState();
    showToast("已恢复全局 Agent 配置", "success");
  } catch (error) {
    showToast(error.message || "恢复全局 Agent 配置失败", "error");
  }
}

function renderOverview() {
  const running = appState.profiles.filter((profile) => profileStatus(profile).running).length;
  const availableNodes = appState.nodes.filter(isAvailableNode).length;
  const metricProfiles = $("#metric-profiles");
  const metricRunning = $("#metric-running");
  const metricNodes = $("#metric-nodes");
  if (metricProfiles) metricProfiles.textContent = String(appState.profiles.length);
  if (metricRunning) metricRunning.textContent = String(running);
  if (metricNodes) metricNodes.textContent = String(availableNodes);

  const recent = $("#recent-profiles");
  const empty = $("#recent-empty");
  if (!recent || !empty) return;
  const profiles = [...appState.profiles].sort((a, b) => new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0)).slice(0, 5);
  recent.innerHTML = profiles.map((profile) => {
    const status = profileStatus(profile);
    return `<button class="profile-list-item" type="button" data-action="launch-profile" data-id="${escapeHtml(profile.id)}">
      <span class="profile-avatar" aria-hidden="true">${escapeHtml(initials(profile.name))}</span>
      <span class="profile-list-main"><span class="profile-list-name">${escapeHtml(profile.name)}</span><span class="profile-list-meta">${escapeHtml(nodeLabel(profile.nodeId))} · ${escapeHtml(profileTrafficLabel(profile))}</span></span>
      <span class="profile-list-status"><span class="status-dot ${status.dot}"></span>${escapeHtml(status.label)}</span>
    </button>`;
  }).join("");
  empty.hidden = profiles.length > 0;
}

function launchpadAvatarTone(profile, index) {
  const source = `${profile?.id || "profile"}:${profile?.name || index}`;
  let hash = 0;
  for (const character of source) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 6;
}

function renderLaunchpad() {
  const grid = $("#launchpad-profiles");
  if (!grid) return;
  const profiles = [...appState.profiles].sort((left, right) => {
    const leftTime = new Date(left.lastUsed || 0).getTime();
    const rightTime = new Date(right.lastUsed || 0).getTime();
    return rightTime - leftTime;
  });
  if (appState.activeView === "launchpad" && appState.connectionPicker.profileId && !profiles.some((profile) => profile.id === appState.connectionPicker.profileId)) {
    appState.connectionPicker = { profileId: "", filter: "", groupId: "" };
  }
  const profileCards = profiles.map((profile, index) => {
    const status = profileStatus(profile);
    const subtitle = profile.homepage || "系统默认网页";
    return `<article class="launch-card launch-card--profile">
      <button class="launch-card-open" type="button" data-action="launch-profile" data-id="${escapeHtml(profile.id)}">
        <span class="launch-card-menu" aria-hidden="true">${icon("arrow-right")}</span>
        <span class="launch-avatar launch-avatar--${launchpadAvatarTone(profile, index)}" aria-hidden="true">${escapeHtml(initials(profile.name))}</span>
        <span class="launch-card-name">${escapeHtml(profile.name)}</span>
        <span class="launch-card-meta">${escapeHtml(subtitle)}</span>
        <span class="launch-card-traffic">${renderProfileTrafficLines(profile, true)}</span>
      </button>
      <div class="launch-card-connection">${renderProfileConnectionPicker(profile, "launchpad")}</div>
      <span class="launch-card-status"><span class="status-dot ${status.dot}"></span>${escapeHtml(status.running ? "正在运行" : "就绪")}</span>
    </article>`;
  }).join("");
  grid.innerHTML = `${profileCards}
    <button class="launch-card launch-card--add" type="button" data-action="new-profile">
      <span class="launch-avatar launch-avatar--add" aria-hidden="true">${icon("plus")}</span>
      <span class="launch-card-name">添加环境</span>
      <span class="launch-card-meta">创建独立浏览器空间</span>
    </button>
    <button class="launch-card launch-card--settings" type="button" data-view-target="settings">
      <span class="launch-avatar launch-avatar--settings" aria-hidden="true">${icon("settings")}</span>
      <span class="launch-card-name">配置中心</span>
      <span class="launch-card-meta">管理环境、节点与浏览器</span>
    </button>`;
  const summary = $("#launchpad-summary");
  if (summary) summary.textContent = `${profiles.length} 个环境 · 数据仅保存在本机`;
  const version = $("#launchpad-version");
  if (version) version.textContent = appState.appVersion ? `版本 ${appState.appVersion}` : "";
}

function connectionProtocolLabel(node) {
  if (!node) return "直连";
  if (node.protocol === "socks5" || node.protocol === "socks") return "SOCKS5";
  if (node.protocol === "http" && node.tls) return "HTTPS";
  return String(node.protocol || "unknown").toUpperCase();
}

function connectionPickerSearchText(node, groupLabel = "") {
  if (!node) return "系统直连 直连 系统默认网络路径";
  return `${node.name} ${node.host} ${node.port} ${nodeIpAddress(node)} ${node.source || ""} ${connectionProtocolLabel(node)} ${node.protocol} ${groupLabel}`;
}

function compactIpLabel(value, fallback = "未查询") {
  const normalized = String(value || fallback).trim();
  return (normalized.replace(/IP$/i, "").trim() || fallback);
}

function ipSummaryMetadataParts(details) {
  const country = profileIpValue(details, ["country", "countryName", "countryCode"], "未查询");
  const source = compactIpLabel(profileIpValue(details, ["ipSource", "ipSourceLabel"], "未查询"));
  const property = compactIpLabel(profileIpValue(details, ["ipProperty", "ipPropertyLabel"], "未查询"));
  return [country, source, property];
}

function ipSummaryMetadata(details) {
  return ipSummaryMetadataParts(details).join("·");
}

function ipSummaryMetadataTone(details) {
  const source = compactIpLabel(profileIpValue(details, ["ipSource", "ipSourceLabel"], ""), "").toLowerCase();
  const property = compactIpLabel(profileIpValue(details, ["ipProperty", "ipPropertyLabel"], ""), "").toLowerCase();
  if (source.includes("广播")) return "broadcast";
  if (property.includes("住宅")) return "residential";
  if (property.includes("机房")) return "datacenter";
  if (source.includes("原生")) return "native";
  return "";
}

function renderIpSummaryMetadata(details, className) {
  const [country, source, property] = ipSummaryMetadataParts(details);
  const metadata = ipSummaryMetadata(details);
  const tone = ipSummaryMetadataTone(details);
  const toneClass = tone ? ` ip-summary-metadata--${tone}` : "";
  return `<span class="ip-summary-metadata ${className}${toneClass}" title="${escapeHtml(metadata)}"><span class="ip-summary-part">${escapeHtml(country)}</span><span class="ip-summary-part"><span class="ip-summary-separator" aria-hidden="true">·</span>${escapeHtml(source)}</span><span class="ip-summary-part"><span class="ip-summary-separator" aria-hidden="true">·</span>${escapeHtml(property)}</span></span>`;
}

function renderIpSummaryValue(value, className) {
  const text = String(value || "未解析");
  return `<span class="ip-summary-value ${className}" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

function renderIpSummary(details, value, metadataClass, valueClass) {
  return `<span class="ip-summary-stack">${renderIpSummaryMetadata(details, metadataClass)}${renderIpSummaryValue(value, valueClass)}</span>`;
}

function hasIpSummaryData(details) {
  return [details.country, details.countryName, details.countryCode, details.ipSource, details.ipSourceLabel, details.ipProperty, details.ipPropertyLabel, details.ipAddress, details.ip, details.resolvedIp]
    .some((value) => String(value || "").trim());
}

function connectionPickerNodeLabel(node) {
  const details = node || appState.connection?.direct || {};
  const ipAddress = node ? nodeIpAddress(node) : profileIpValue(details, ["ipAddress", "ip", "resolvedIp"], "");
  if (!node && !hasIpSummaryData(details)) return "系统直连";
  return `${node ? "" : "系统直连 "}${ipSummaryMetadata(details)} ${ipAddress || "未解析"}`;
}

function renderConnectionPickerOption(profile, node) {
  const nodeId = node?.id || "";
  const selected = (profile.nodeId || "") === nodeId;
  const groupLabel = node ? nodeGroupLabel(nodeGroupId(node)) : "系统直连";
  const label = connectionPickerNodeLabel(node);
  const title = node ? `${node.name} · ${connectionProtocolLabel(node)} · ${nodeAddress(node)}` : "系统默认网络路径";
  const details = node || appState.connection?.direct || {};
  const hasDetails = Boolean(node || hasIpSummaryData(details));
  const ipAddress = node ? nodeIpAddress(node) : profileIpValue(details, ["ipAddress", "ip", "resolvedIp"], "未解析");
  const optionCopy = hasDetails
    ? `<span class="connection-picker-option-copy">${renderIpSummary(details, ipAddress, "connection-picker-option-meta", "connection-picker-option-name")}</span>`
    : `<span class="connection-picker-option-copy"><span class="connection-picker-option-name">系统直连</span></span>`;
  const testLabel = node ? "重新测试节点连通性" : "重新测试系统直连";
  const testAction = node ? "check-node" : "check-direct-connection";
  const testId = node ? nodeId : profile.id;
  const checking = node ? Boolean(appState.nodeChecks[nodeId]) : appState.directCheck;
  return `<div class="connection-picker-option-row" role="presentation"><button class="connection-picker-option${selected ? " is-selected" : ""}" type="button" role="option" aria-selected="${selected}" aria-label="${escapeHtml(label)}" title="${escapeHtml(title)}" data-connection-option data-node-id="${escapeHtml(nodeId)}" data-search-text="${escapeHtml(`${connectionPickerSearchText(node, groupLabel)} ${label}`.toLocaleLowerCase())}">${optionCopy}</button>${renderConnectionHealth(details, "connection-option-health")}<button class="row-action connection-picker-test" type="button" data-action="${testAction}" data-id="${escapeHtml(testId)}" title="${testLabel}" aria-label="${testLabel}"${checking ? " disabled" : ""}>${icon("zap")}</button></div>`;
}

function connectionPickerGroups() {
  const selectableNodes = appState.nodes.filter(isSelectableConnectionNode);
  const groups = [{ id: "direct", label: "系统直连", nodes: [null] }];
  const knownGroupIds = new Set(groups.map((group) => group.id));
  for (const [index, subscription] of appState.subscriptions.entries()) {
    const groupId = `subscription:${subscription.id}`;
    const nodes = selectableNodes.filter((node) => nodeGroupId(node) === groupId);
    if (nodes.length) groups.push({ id: groupId, label: subscriptionLabel(subscription, index), nodes });
    knownGroupIds.add(groupId);
  }
  const manualNodes = selectableNodes.filter((node) => nodeGroupId(node) === "manual");
  if (manualNodes.length) groups.push({ id: "manual", label: "手动", nodes: manualNodes });
  knownGroupIds.add("manual");
  for (const node of selectableNodes) {
    const groupId = nodeGroupId(node);
    if (knownGroupIds.has(groupId)) continue;
    knownGroupIds.add(groupId);
    groups.push({
      id: groupId,
      label: nodeGroupLabel(groupId),
      nodes: selectableNodes.filter((candidate) => nodeGroupId(candidate) === groupId),
    });
  }
  return groups;
}

function renderConnectionPickerOptions(profile) {
  const filter = appState.connectionPicker.profileId === profile.id
    ? appState.connectionPicker.filter.trim().toLocaleLowerCase()
    : "";
  const matches = (node, groupLabel) => !filter || `${connectionPickerSearchText(node, groupLabel)} ${connectionPickerNodeLabel(node)}`.toLocaleLowerCase().includes(filter);
  const groups = connectionPickerGroups();
  const currentGroup = groups.find((group) => group.id === appState.connectionPicker.groupId) || groups[0];
  if (!currentGroup) return `<div class="connection-picker-empty">没有可用的连接</div>`;
  if (appState.connectionPicker.groupId !== currentGroup.id) appState.connectionPicker.groupId = currentGroup.id;
  const groupTabs = groups.map((group) => {
    const active = group.id === currentGroup.id;
    return `<button class="connection-picker-group-switch${active ? " is-active" : ""}" type="button" role="tab" aria-selected="${active}" data-action="select-connection-group" data-id="${escapeHtml(group.id)}">${escapeHtml(group.label)}<span class="connection-picker-group-count">${group.nodes.length}</span></button>`;
  }).join("");
  const groupLabel = currentGroup.label;
  const options = currentGroup.nodes.filter((node) => matches(node, groupLabel)).map((node) => renderConnectionPickerOption(profile, node)).join("");
  return `<div class="connection-picker-groups" role="tablist" aria-label="选择连接分组">${groupTabs}</div><div class="connection-picker-group"><div class="connection-picker-group-label" role="presentation">${escapeHtml(groupLabel)}</div><div role="listbox" aria-label="${escapeHtml(groupLabel)}">${options || `<div class="connection-picker-empty">没有匹配的连接</div>`}</div></div>`;
}

function renderProfileConnectionPicker(profile, view = "profiles") {
  const health = profileConnectionHealth(profile);
  const checking = Boolean(appState.profileChecks[profile.id]) || String(health?.status || "").toLowerCase() === "checking";
  const checkLabel = checking
    ? "正在测试当前连接"
    : profile.nodeId
      ? "测试当前节点"
      : "测试系统直连";
  const selectedNode = profile.nodeId ? appState.nodes.find((node) => node.id === profile.nodeId) : null;
  const checkDisabled = checking || Boolean(profile.nodeId && !selectedNode);
  return `${renderProfileIpSummary(profile, view)}<div class="profile-connection-health-row">${renderConnectionHealth(health)}<button class="row-action" type="button" data-action="check-profile-connection" data-id="${escapeHtml(profile.id)}" title="${checkLabel}" aria-label="${checkLabel}"${checkDisabled ? " disabled" : ""}>${icon("zap")}</button></div>`;
}

function renderProfiles() {
  const table = $("#profiles-table");
  if (!table) return;
  const connectionSearchWasFocused = document.activeElement?.matches?.("[data-connection-search]");
  const filter = appState.profileFilter.trim().toLocaleLowerCase();
  const profiles = appState.profiles.filter((profile) => !filter || `${profile.name} ${profile.homepage} ${nodeLabel(profile.nodeId)}`.toLocaleLowerCase().includes(filter));
  if (appState.activeView === "profiles" && appState.connectionPicker.profileId && !profiles.some((profile) => profile.id === appState.connectionPicker.profileId)) {
    appState.connectionPicker = { profileId: "", filter: "", groupId: "" };
  }
  table.innerHTML = profiles.map((profile) => {
    const status = profileStatus(profile);
    const actionLabel = status.running ? "停止环境" : "启动环境";
    const actionIcon = status.running ? icon("stop") : icon("play");
    const runtimeLabel = profile.runtimeMode === "external"
      ? "外部 Chromium"
      : profile.runtimeMode === "electron"
        ? "Electron Chromium"
        : "";
    return `<div class="table-row profile-grid" role="row">
      <div class="table-primary"><span class="profile-avatar" aria-hidden="true">${escapeHtml(initials(profile.name))}</span><span class="table-primary-copy"><span class="table-primary-name">${escapeHtml(profile.name)}</span><span class="table-secondary">${escapeHtml(profile.homepage || "未设置启动网址")}</span></span></div>
      ${renderProfileIpSummary(profile)}
      <div class="table-cell"><span class="status-badge ${status.className}"><span class="status-dot ${status.dot}"></span>${escapeHtml(status.label)}</span>${runtimeLabel ? `<span class="runtime-mode-label">${escapeHtml(runtimeLabel)}</span>` : ""}</div>
      <div class="table-cell profile-traffic-cell" title="${escapeHtml(profileTrafficLabel(profile))}">${renderProfileTrafficLines(profile)}</div>
      <div class="table-cell">${escapeHtml(formatDate(profile.lastUsed))}</div>
      <div class="row-actions"><button class="row-action" type="button" data-action="toggle-profile" data-id="${escapeHtml(profile.id)}" title="${actionLabel}" aria-label="${actionLabel}">${actionIcon}</button><button class="row-action" type="button" data-action="edit-profile" data-id="${escapeHtml(profile.id)}" title="编辑环境" aria-label="编辑环境">${icon("edit")}</button><button class="row-action row-action--danger" type="button" data-action="delete-profile" data-id="${escapeHtml(profile.id)}" title="删除环境" aria-label="删除环境">${icon("trash")}</button></div>
    </div>`;
  }).join("");
  const empty = $("#profiles-empty");
  if (empty) empty.hidden = profiles.length > 0;
  if (appState.connectionPicker.profileId) {
    const picker = activeConnectionPicker();
    if (picker) window.setTimeout(() => {
      positionConnectionPicker(picker);
      if (connectionSearchWasFocused) {
        const search = $("[data-connection-search]", picker);
        search?.focus();
        if (search) search.setSelectionRange(search.value.length, search.value.length);
      }
    }, 0);
  }
}

function activeConnectionPicker() {
  const profileId = appState.connectionPicker.profileId;
  if (!profileId) return null;
  return $$(`[data-view="${appState.activeView}"] [data-connection-picker]`)
    .find((picker) => picker.dataset.profileId === profileId) || null;
}

function positionConnectionPicker(picker) {
  if (!picker) return;
  const trigger = $("[data-connection-trigger]", picker);
  const popover = $(".connection-picker-popover", picker);
  if (!trigger || !popover) return;
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 12;
  const triggerGap = 6;
  const belowSpace = window.innerHeight - rect.bottom - viewportPadding - triggerGap;
  const aboveSpace = rect.top - viewportPadding - triggerGap;
  const openAbove = belowSpace < 300 && aboveSpace > belowSpace;
  const available = Math.max(0, openAbove ? aboveSpace : belowSpace);
  const width = Math.min(430, Math.max(0, window.innerWidth - viewportPadding * 2));
  const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding);
  const left = Math.min(Math.max(viewportPadding, rect.left), maxLeft);
  picker.classList.toggle("is-above", openAbove);
  popover.style.left = `${left}px`;
  popover.style.width = `${width}px`;
  popover.style.maxHeight = `${Math.min(360, available)}px`;
  if (!popover.matches(":popover-open")) popover.showPopover();
  if (openAbove) {
    popover.style.top = "auto";
    popover.style.bottom = `${Math.max(viewportPadding, window.innerHeight - rect.top + triggerGap)}px`;
  } else {
    popover.style.bottom = "auto";
    popover.style.top = `${Math.min(window.innerHeight - viewportPadding, rect.bottom + triggerGap)}px`;
  }
}

function openConnectionPicker(profileId) {
  const profile = appState.profiles.find((candidate) => candidate.id === String(profileId || ""));
  const groups = connectionPickerGroups();
  const currentNode = profile?.nodeId ? appState.nodes.find((node) => node.id === profile.nodeId) : null;
  const preferredGroupId = currentNode ? nodeGroupId(currentNode) : "direct";
  const groupId = groups.some((group) => group.id === preferredGroupId) ? preferredGroupId : groups[0]?.id || "direct";
  appState.connectionPicker = { profileId: String(profileId || ""), filter: "", groupId };
  renderLaunchpad();
  renderProfiles();
  const picker = activeConnectionPicker();
  if (!picker) return;
  positionConnectionPicker(picker);
  window.setTimeout(() => {
    positionConnectionPicker(picker);
    $("[data-connection-search]", picker)?.focus();
  }, 0);
}

function closeConnectionPicker() {
  if (!appState.connectionPicker.profileId) return;
  appState.connectionPicker = { profileId: "", filter: "", groupId: "" };
  renderLaunchpad();
  renderProfiles();
}

function filterConnectionPicker(picker, filter) {
  if (!picker) return;
  const normalized = String(filter || "").trim().toLocaleLowerCase();
  const options = $$(".connection-picker-option", picker);
  let visible = 0;
  options.forEach((option) => {
    const matches = !normalized || String(option.dataset.searchText || "").includes(normalized);
    option.hidden = !matches;
    option.closest(".connection-picker-option-row")?.toggleAttribute("hidden", !matches);
    if (matches) visible += 1;
  });
  $$(".connection-picker-group", picker).forEach((group) => {
    group.hidden = false;
  });
  let empty = $(".connection-picker-empty", picker);
  if (!empty) {
    empty = document.createElement("div");
    empty.className = "connection-picker-empty";
    empty.textContent = "没有匹配的连接";
    $(".connection-picker-group", picker)?.append(empty);
  }
  empty.hidden = visible > 0;
}

function nodeGroupId(node) {
  return node.sourceId ? `subscription:${node.sourceId}` : "manual";
}

function subscriptionLabel(subscription, index = 0) {
  const name = String(subscription?.name || "").trim();
  return name && name !== "在线订阅" ? name : `订阅${index + 1}`;
}

function nodeGroupLabel(groupId) {
  if (groupId === "manual") return "手动";
  if (groupId === "all") return "全部";
  const subscriptionId = groupId.replace(/^subscription:/, "");
  const subscriptionIndex = appState.subscriptions.findIndex((item) => item.id === subscriptionId);
  return subscriptionIndex >= 0 ? subscriptionLabel(appState.subscriptions[subscriptionIndex], subscriptionIndex) : "未知订阅";
}

function isNodeVisibleInGroup(node, groupId) {
  if (String(groupId || "").startsWith("subscription:")) {
    const subscriptionId = String(groupId).slice("subscription:".length);
    return Boolean(node && node.sourceId === subscriptionId && node.subscriptionInfo !== true);
  }
  return isNodeVisibleInList(node);
}

function renderNodeGroups() {
  const list = $("#node-groups-list");
  const count = $("#node-group-count");
  if (!list) return;
  const visibleNodes = appState.nodes.filter((node) => isNodeVisibleInGroup(node, "all"));
  const groups = [{ id: "all", label: "全部", count: visibleNodes.length }];
  for (const [index, subscription] of appState.subscriptions.entries()) {
    const groupId = `subscription:${subscription.id}`;
    groups.push({
      id: groupId,
      label: subscriptionLabel(subscription, index),
      count: appState.nodes.filter((node) => isNodeVisibleInGroup(node, groupId) && nodeGroupId(node) === groupId).length,
    });
  }
  const manualCount = visibleNodes.filter((node) => nodeGroupId(node) === "manual").length;
  groups.push({ id: "manual", label: "手动", count: manualCount });
  if (!groups.some((group) => group.id === appState.nodeGroup)) appState.nodeGroup = "all";
  list.innerHTML = groups.map((group) => {
    const active = group.id === appState.nodeGroup;
    const iconName = group.id === "manual" ? "server" : group.id === "all" ? "grid" : "link";
    return `<button class="node-group-item${active ? " is-active" : ""}" type="button" role="tab" aria-selected="${active}" data-action="select-node-group" data-id="${escapeHtml(group.id)}"><span class="node-group-name"><span class="node-group-icon">${icon(iconName)}</span>${escapeHtml(group.label)}</span><span class="node-group-count">${group.count}</span></button>`;
  }).join("");
  if (count) count.textContent = String(groups.length);
}

function filteredNodes() {
  const filter = appState.nodeFilter.trim().toLocaleLowerCase();
  return appState.nodes.filter((node) => isNodeVisibleInGroup(node, appState.nodeGroup)).filter((node) => {
    if (appState.nodeGroup !== "all" && nodeGroupId(node) !== appState.nodeGroup) return false;
    return !filter || `${node.name} ${node.host} ${nodeIpAddress(node)} ${node.protocol} ${nodeGroupLabel(nodeGroupId(node))}`.toLocaleLowerCase().includes(filter);
  });
}

function renderNodes() {
  const table = $("#nodes-table");
  if (!table) return;
  renderNodeGroups();
  const nodes = filteredNodes();
  const checkableCount = nodes.filter(isNodeCheckable).length;
  const batchButton = $("#batch-check-nodes");
  if (batchButton) {
    batchButton.disabled = appState.batchChecking || checkableCount === 0;
    batchButton.setAttribute("aria-busy", appState.batchChecking ? "true" : "false");
    const label = batchButton.querySelector("span");
    if (label) label.textContent = appState.batchChecking ? "批量检查中" : "批量检查";
  }
  table.innerHTML = nodes.map((node) => {
    const status = nodeStatus(node);
    const address = nodeAddress(node);
    const ipAddress = nodeIpAddress(node);
    const ipMetadata = ipSummaryMetadata(node);
    const protocolLabel = node.protocol === "socks5" || node.protocol === "socks"
      ? "SOCKS5"
      : node.protocol === "http" && node.tls ? "HTTPS"
        : node.protocol.toUpperCase();
    const checkDisabled = appState.batchChecking || !isNodeCheckable(node);
    const checkTitle = node.requiresCore ? "检查服务器连通性" : node.supported === false ? "该协议暂不支持" : "检查节点";
    const coreControl = node.requiresCore
      ? node.protocol === "anytls"
        ? `<span class="table-secondary">sing-box</span>`
        : `<select class="inline-select node-core-select" data-node-core="${escapeHtml(node.id)}" aria-label="选择 ${escapeHtml(node.name)} 的核心"><option value="xray"${node.core !== "singbox" ? " selected" : ""}>Xray</option><option value="singbox"${node.core === "singbox" ? " selected" : ""}>sing-box</option></select>`
      : `<span class="table-secondary">直连代理</span>`;
    return `<div class="table-row node-grid" role="row" data-node-row="${escapeHtml(node.id)}">
      <div class="table-primary"><span class="table-primary-copy"><span class="table-primary-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span><span class="table-secondary">${escapeHtml(nodeGroupLabel(nodeGroupId(node)))}${node.reason ? ` · ${escapeHtml(node.reason)}` : ""}</span></span></div>
      <div class="table-cell">${escapeHtml(protocolLabel)}</div>
      <div class="table-cell table-cell--address" title="${escapeHtml(address)}">${escapeHtml(address)}</div>
      <div class="table-cell table-cell--ip" title="${escapeHtml(`${ipMetadata} · ${ipAddress}`)}">${renderIpSummary(node, ipAddress, "table-cell-ip-meta", "table-cell-ip-value")}</div>
      <div class="table-cell">${coreControl}</div>
      <div class="table-cell node-health-cell"><span class="status-badge ${status.className}"><span class="status-dot ${status.dot}"></span>${escapeHtml(status.label)}</span><span class="connection-latency">${escapeHtml(connectionLatency(node, connectionHealthStatus(node)))}</span></div>
      <div class="row-actions"><button class="row-action" type="button" data-action="check-node" data-id="${escapeHtml(node.id)}" title="${checkTitle}" aria-label="${checkTitle}" ${checkDisabled ? "disabled" : ""}>${icon("zap")}</button><button class="row-action" type="button" data-action="edit-node" data-id="${escapeHtml(node.id)}" title="编辑节点" aria-label="编辑节点">${icon("edit")}</button><button class="row-action" type="button" data-action="view-node" data-id="${escapeHtml(node.id)}" title="查看节点信息" aria-label="查看节点信息">${icon("info")}</button><button class="row-action row-action--danger" type="button" data-action="delete-node" data-id="${escapeHtml(node.id)}" title="删除节点" aria-label="删除节点">${icon("trash")}</button></div>
    </div>`;
  }).join("");
  const summary = $("#node-summary");
  if (summary) summary.textContent = `${nodes.length} / ${appState.nodes.filter((node) => isNodeVisibleInGroup(node, appState.nodeGroup)).length} 个节点`;
  const empty = $("#nodes-empty");
  if (empty) empty.hidden = nodes.length > 0;
}

function themeFromForm() {
  const current = normalizeTheme(appState.settings.theme);
  const read = (id, fallback) => String($(`#${id}`)?.value || fallback);
  const number = (id, fallback) => Number($(`#${id}`)?.value ?? fallback);
  return normalizeTheme({
    ...current,
    preset: read("theme-preset", current.preset),
    background: read("theme-background", current.background),
    surface: read("theme-surface", current.surface),
    surfaceSoft: read("theme-surface-soft", current.surfaceSoft),
    primary: read("theme-primary", current.primary),
    primaryHover: read("theme-primary-hover", current.primaryHover),
    secondary: read("theme-secondary", current.secondary),
    success: read("theme-success", current.success),
    warning: read("theme-warning", current.warning),
    danger: read("theme-danger", current.danger),
    text: read("theme-text", current.text),
    textMuted: read("theme-text-muted", current.textMuted),
    textFaint: read("theme-text-faint", current.textFaint),
    backgroundOpacity: number("theme-background-opacity", current.backgroundOpacity),
    blur: number("theme-blur", current.blur),
    radius: number("theme-radius", current.radius),
  });
}

function renderThemePreview(theme) {
  const preview = $("#theme-preview");
  if (!preview) return;
  preview.style.setProperty("--preview-bg", theme.background);
  preview.style.setProperty("--preview-surface", theme.surface);
  preview.style.setProperty("--preview-primary", theme.primary);
  preview.style.setProperty("--preview-secondary", theme.secondary);
  preview.style.setProperty("--preview-image", theme.backgroundImage ? `url(${theme.backgroundImage})` : "none");
  preview.style.setProperty("--preview-opacity", String(theme.backgroundOpacity));
  const blur = $("#theme-blur-value");
  const radius = $("#theme-radius-value");
  const opacity = $("#theme-opacity-value");
  if (blur) blur.textContent = `${theme.blur}px`;
  if (radius) radius.textContent = `${theme.radius}px`;
  if (opacity) opacity.textContent = `${Math.round(theme.backgroundOpacity * 100)}%`;
  const fileName = $("#theme-background-name");
  if (fileName) fileName.textContent = theme.backgroundImage ? "已上传自定义背景" : "未上传背景图片";
  renderSettingsSummary();
}

function renderSettingsSummary() {
  const settings = appState.settings || {};
  const enginePath = String(valueOf(settings, ["enginePath", "chromiumPath"], "")).trim();
  const external = appState.engine.mode === "external" || Boolean(enginePath);
  const engine = $("#settings-summary-engine");
  const engineDetail = $("#settings-summary-engine-detail");
  if (engine) engine.textContent = external ? "外部 Chromium" : "内置 Chromium";
  if (engineDetail) engineDetail.textContent = external ? "独立窗口运行" : "使用应用自带内核";

  const xray = appState.core?.xray;
  const singbox = appState.core?.singbox;
  const configured = xray?.configured && singbox?.configured ? "双核心就绪" : xray?.configured || singbox?.configured ? "部分就绪" : "未配置核心";
  const core = $("#settings-summary-core");
  const coreDetail = $("#settings-summary-core-detail");
  if (core) core.textContent = appState.coreUpdates.length ? "有可用更新" : configured;
  if (coreDetail) coreDetail.textContent = `${String(valueOf(settings, ["defaultCore"], "xray")) === "singbox" ? "sing-box" : "Xray-core"} · 新导入节点默认核心`;

  const theme = normalizeTheme(settings.theme);
  const themeLabels = { midnight: "深海蓝", ocean: "青花海", ink: "墨蓝灰", custom: "自定义主题" };
  const themeSummary = $("#settings-summary-theme");
  const themeDetail = $("#settings-summary-theme-detail");
  if (themeSummary) themeSummary.textContent = themeLabels[theme.preset] || "自定义主题";
  if (themeDetail) themeDetail.textContent = theme.backgroundImage ? "含自定义背景 · 实时预览" : "实时预览，保存后生效";
}

function previewThemeFromForm() {
  const theme = themeFromForm();
  appState.settings.theme = theme;
  applyTheme(theme);
  renderThemePreview(theme);
}

function renderThemeSettings() {
  const theme = normalizeTheme(appState.settings.theme);
  const fields = {
    "theme-preset": theme.preset,
    "theme-background": theme.background,
    "theme-surface": theme.surface,
    "theme-surface-soft": theme.surfaceSoft,
    "theme-primary": theme.primary,
    "theme-primary-hover": theme.primaryHover,
    "theme-secondary": theme.secondary,
    "theme-success": theme.success,
    "theme-warning": theme.warning,
    "theme-danger": theme.danger,
    "theme-text": theme.text,
    "theme-text-muted": theme.textMuted,
    "theme-text-faint": theme.textFaint,
    "theme-background-opacity": theme.backgroundOpacity,
    "theme-blur": theme.blur,
    "theme-radius": theme.radius,
  };
  for (const [id, value] of Object.entries(fields)) {
    const element = $(`#${id}`);
    if (element && document.activeElement !== element) element.value = String(value);
  }
  renderThemePreview(theme);
}

function normalizeBookmarkImportSource(source = {}) {
  const id = String(valueOf(source, ["id"], "")).trim();
  if (!id) return null;
  return {
    id,
    kind: String(valueOf(source, ["kind"], "manual")),
    browser: String(valueOf(source, ["browser"], "manual")),
    profileName: String(valueOf(source, ["profileName"], "")),
    label: String(valueOf(source, ["label"], id)),
  };
}

function renderBookmarkImportResult(result) {
  const panel = $("#bookmark-import-result");
  if (!panel) return;
  if (!result || typeof result !== "object") {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const sources = asArray(result.sources);
  const sourceRows = sources.map((source) => {
    const label = escapeHtml(source.label || source.id || "来源");
    const details = source.error
      ? `<span class="bookmark-import-report-error">失败：${escapeHtml(source.error)}</span>`
      : `新增 ${Number(source.added) || 0} · 重复 ${Number(source.duplicates) || 0} · 无效 ${Number(source.invalid) || 0}`;
    return `<li><strong>${label}</strong><span>${details}</span></li>`;
  }).join("");
  panel.innerHTML = `<div class="bookmark-import-summary"><span>新增链接 <strong>${Number(result.addedLinks) || 0}</strong></span><span>新增文件夹 <strong>${Number(result.addedFolders) || 0}</strong></span><span>重复 <strong>${Number(result.duplicates) || 0}</strong></span><span>无效 <strong>${Number(result.invalid) || 0}</strong></span><span>失败 <strong>${asArray(result.failures).length}</strong></span></div>${sourceRows ? `<ul class="bookmark-import-report-list">${sourceRows}</ul>` : ""}`;
  panel.hidden = false;
}

function renderBookmarkImportSettings() {
  const profileSelect = $("#bookmark-import-profile");
  const sourceList = $("#bookmark-import-sources");
  if (!profileSelect || !sourceList) return;

  const profiles = appState.profiles.filter((profile) => profile && profile.id);
  const profileIds = new Set(profiles.map((profile) => profile.id));
  if (!profileIds.has(appState.bookmarkImportTargetId)) {
    appState.bookmarkImportTargetId = profiles[0]?.id || "";
  }
  if (document.activeElement !== profileSelect) {
    profileSelect.innerHTML = profiles.length
      ? profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`).join("")
      : `<option value="">请先创建浏览器环境</option>`;
    profileSelect.value = appState.bookmarkImportTargetId;
  }
  profileSelect.disabled = !profiles.length || appState.bookmarkImportLoading || appState.bookmarkImportBusy;

  const sourceMap = new Map(appState.bookmarkImportSources.map((source) => [source.id, source]));
  appState.bookmarkImportSelectedSourceIds = [...new Set(appState.bookmarkImportSelectedSourceIds.filter((id) => sourceMap.has(id)))];
  const selected = new Set(appState.bookmarkImportSelectedSourceIds);
  sourceList.innerHTML = appState.bookmarkImportSources.length
    ? appState.bookmarkImportSources.map((source) => {
      const browserLabel = source.browser === "manual" ? "手动文件" : source.browser;
      const meta = [browserLabel, source.profileName].filter(Boolean).join(" · ");
      return `<label class="bookmark-import-source"><input type="checkbox" value="${escapeHtml(source.id)}" data-bookmark-import-source${selected.has(source.id) ? " checked" : ""}${appState.bookmarkImportLoading || appState.bookmarkImportBusy ? " disabled" : ""} /><span class="bookmark-import-source-copy"><strong>${escapeHtml(source.label)}</strong><small>${escapeHtml(meta)}</small></span></label>`;
    }).join("")
    : "";

  const count = $("#bookmark-import-source-count");
  if (count) count.textContent = appState.bookmarkImportSources.length ? `${appState.bookmarkImportSources.length} 个可用来源` : "暂无来源";
  const empty = $("#bookmark-import-source-empty");
  if (empty) empty.hidden = appState.bookmarkImportSources.length > 0;
  const sourceError = $("#bookmark-import-source-error");
  if (sourceError) {
    sourceError.textContent = appState.bookmarkImportSourceError;
    sourceError.hidden = !appState.bookmarkImportSourceError;
  }
  const profileHint = $("#bookmark-import-profile-hint");
  if (profileHint) profileHint.textContent = profiles.length ? "收藏将写入选中的环境。" : "请先在环境页创建浏览器环境。";

  const refresh = $("#bookmark-import-refresh");
  const choose = $("#bookmark-import-files");
  const submit = $("#bookmark-import-submit");
  const controlsBusy = appState.bookmarkImportLoading || appState.bookmarkImportBusy;
  if (refresh) refresh.disabled = controlsBusy;
  if (choose) choose.disabled = controlsBusy;
  if (submit) submit.disabled = controlsBusy || !profiles.length || selected.size === 0;

  const status = $("#bookmark-import-status");
  if (status) {
    const statusText = appState.bookmarkImportBusy
      ? "导入中"
      : appState.bookmarkImportLoading
        ? "读取来源"
        : appState.bookmarkImportSourceError
          ? "来源读取失败"
          : appState.bookmarkImportSources.length
            ? `已发现 ${appState.bookmarkImportSources.length} 个来源`
            : "等待选择来源";
    status.textContent = statusText;
    status.className = `status-badge ${appState.bookmarkImportBusy || appState.bookmarkImportLoading ? "status-badge--warn" : appState.bookmarkImportSourceError ? "status-badge--error" : appState.bookmarkImportSources.length ? "status-badge--ready" : ""}`;
  }
  renderBookmarkImportResult(appState.bookmarkImportResult);
}

async function refreshBookmarkImportSources() {
  const requestId = ++bookmarkImportSourceRequestId;
  appState.bookmarkImportLoading = true;
  appState.bookmarkImportSourceError = "";
  renderBookmarkImportSettings();
  try {
    const result = await invokeApi("getBookmarkImportSources");
    if (requestId !== bookmarkImportSourceRequestId) return;
    appState.bookmarkImportSources = asArray(result?.sources).map(normalizeBookmarkImportSource).filter(Boolean);
    appState.bookmarkImportSelectedSourceIds = appState.bookmarkImportSelectedSourceIds.filter((id) => appState.bookmarkImportSources.some((source) => source.id === id));
  } catch (error) {
    if (requestId !== bookmarkImportSourceRequestId) return;
    appState.bookmarkImportSourceError = error.message || "读取书签来源失败";
  } finally {
    if (requestId === bookmarkImportSourceRequestId) {
      appState.bookmarkImportLoading = false;
      renderBookmarkImportSettings();
    }
  }
}

async function chooseBookmarkImportFiles() {
  if (appState.bookmarkImportLoading || appState.bookmarkImportBusy) return;
  appState.bookmarkImportLoading = true;
  appState.bookmarkImportSourceError = "";
  renderBookmarkImportSettings();
  try {
    const result = await invokeApi("chooseBookmarkImportFiles");
    if (!result?.canceled) {
      const chosen = asArray(result?.sources).map(normalizeBookmarkImportSource).filter(Boolean);
      const sources = new Map(appState.bookmarkImportSources.map((source) => [source.id, source]));
      for (const source of chosen) sources.set(source.id, source);
      appState.bookmarkImportSources = [...sources.values()];
      appState.bookmarkImportSelectedSourceIds = [...new Set([...appState.bookmarkImportSelectedSourceIds, ...chosen.map((source) => source.id)])];
      if (chosen.length) showToast(`已添加 ${chosen.length} 个手动书签来源`, "success");
    }
  } catch (error) {
    appState.bookmarkImportSourceError = error.message || "选择书签文件失败";
    showToast(appState.bookmarkImportSourceError, "error");
  } finally {
    appState.bookmarkImportLoading = false;
    renderBookmarkImportSettings();
  }
}

async function importBrowserBookmarks() {
  if (appState.bookmarkImportBusy) return;
  const profileId = appState.bookmarkImportTargetId || $("#bookmark-import-profile")?.value || "";
  const sourceIds = [...new Set(appState.bookmarkImportSelectedSourceIds)];
  if (!profileId) {
    showToast("请先创建并选择浏览器环境", "warn");
    return;
  }
  if (!sourceIds.length) {
    showToast("请至少选择一个书签来源", "warn");
    return;
  }
  appState.bookmarkImportBusy = true;
  appState.bookmarkImportSourceError = "";
  renderBookmarkImportSettings();
  try {
    const result = await invokeApi("importBrowserBookmarks", { profileId, sourceIds });
    appState.bookmarkImportResult = result;
    const failures = asArray(result?.failures).length;
    const invalid = Number(result?.invalid) || 0;
    const summary = `书签导入完成：新增 ${Number(result?.addedLinks) || 0} 个链接，重复 ${Number(result?.duplicates) || 0} 个`;
    showToast(failures || invalid ? `${summary}；${failures ? `失败 ${failures} 个来源` : ""}${failures && invalid ? "，" : ""}${invalid ? `无效 ${invalid} 个` : ""}` : summary, failures ? "warn" : "success");
  } catch (error) {
    appState.bookmarkImportSourceError = error.message || "书签导入失败";
    showToast(appState.bookmarkImportSourceError, "error");
  } finally {
    appState.bookmarkImportBusy = false;
    renderBookmarkImportSettings();
  }
}

function renderSettings() {
  const input = $("#engine-path");
  if (input && document.activeElement !== input) input.value = String(valueOf(appState.settings, ["enginePath", "chromiumPath"], ""));
  const engineStatus = $("#engine-mode-status");
  if (engineStatus) {
    const external = appState.engine.mode === "external"
      || Boolean(valueOf(appState.settings, ["enginePath", "chromiumPath"], ""));
    engineStatus.textContent = external ? "当前模式：外部 Chromium（独立窗口）" : "当前模式：内置 Electron Chromium";
    engineStatus.className = `engine-mode-status ${external ? "is-external" : "is-electron"}`;
  }
  const engineUpdateStatus = $("#engine-update-status");
  if (engineUpdateStatus) {
    const version = String(appState.engine?.version || "").trim();
    const updateLabel = appState.engineUpdate?.latestVersion
      ? `可更新至 v${appState.engineUpdate.latestVersion}`
      : version
      ? `v${version}`
      : "";
    engineUpdateStatus.textContent = updateLabel;
    engineUpdateStatus.hidden = !updateLabel;
  }
  const xrayInput = $("#xray-path");
  if (xrayInput && document.activeElement !== xrayInput) xrayInput.value = String(valueOf(appState.settings, ["xrayPath"], ""));
  const singboxInput = $("#singbox-path");
  if (singboxInput && document.activeElement !== singboxInput) singboxInput.value = String(valueOf(appState.settings, ["singboxPath"], ""));
  const xray = appState.core?.xray;
  const singbox = appState.core?.singbox;
  const renderCoreVersion = (elementId, kind, core) => {
    const element = $(`#${elementId}`);
    if (!element) return;
    const version = String(core?.version || "").trim();
    const update = appState.coreUpdates.find((item) => item.core === kind);
    const latestVersion = String(update?.latestVersion || "").trim();
    if (!version) element.textContent = core?.configured ? "当前版本：未识别" : "当前版本：未安装";
    else if (latestVersion) element.textContent = `当前：${version} · 可更新至：${latestVersion}`;
    else element.textContent = `当前版本：${version}`;
    element.classList.toggle("is-known", Boolean(version));
  };
  renderCoreVersion("xray-version", "xray", xray);
  renderCoreVersion("singbox-version", "singbox", singbox);
  const defaultCore = String(valueOf(appState.settings, ["defaultCore"], "xray"));
  const coreSelect = $("#default-core-settings");
  if (coreSelect && document.activeElement !== coreSelect) coreSelect.value = defaultCore === "singbox" ? "singbox" : "xray";
  const nodeCoreSelect = $("#default-core");
  if (nodeCoreSelect && document.activeElement !== nodeCoreSelect) nodeCoreSelect.value = defaultCore === "singbox" ? "singbox" : "xray";
  const coreLabel = $("#core-status");
  if (coreLabel) {
    const configuredLabel = xray?.configured && singbox?.configured ? "双核心就绪" : xray?.configured || singbox?.configured ? "部分就绪" : "未配置";
    coreLabel.textContent = appState.coreUpdates.length ? "有更新" : configuredLabel;
    coreLabel.classList.toggle("status-badge--warn", appState.coreUpdates.length > 0);
    coreLabel.classList.toggle("status-badge--ready", appState.coreUpdates.length === 0 && configuredLabel !== "未配置");
  }
  renderThemeSettings();
  renderBookmarkImportSettings();
}

function renderAll() {
  document.body.classList.toggle("is-launchpad", appState.activeView === "launchpad");
  renderBrand();
  renderNavigation();
  renderLaunchpad();
  renderOverview();
  renderProfiles();
  renderNodes();
  renderSubscriptions();
  renderAgentManagement();
  renderAgentEnvironmentManagement();
  renderExtensions();
  renderPasswordEntries();
  renderSettings();
  renderExtensionStoreProxySelectors();
  syncProfileConfigLock();
}

function activateView(view) {
  if (!view || !viewTitles[view]) return;
  appState.activeView = view;
  $$('[data-view]').forEach((section) => {
    const visible = section.dataset.view === view;
    section.classList.toggle("is-visible", visible);
    section.hidden = !visible;
  });
  $$('[data-view-target]').forEach((button) => {
    if (button.classList.contains("nav-item")) button.classList.toggle("is-active", button.dataset.viewTarget === view);
  });
  renderAll();
  if (view === "extensions") void autoCheckExtensionUpdates();
  if (view === "settings") void refreshBookmarkImportSources();
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (id === "extension-store-modal" || id === "extension-discovery-modal") {
    appState.extensionStore.routePicker.open = "";
    appState.extensionStore.routePicker.filter = "";
    renderExtensionStoreProxySelectors();
  }
  modal.hidden = false;
  const focusTarget = modal.querySelector("input:not([type=hidden]), textarea, select, button");
  window.setTimeout(() => focusTarget?.focus(), 0);
}

function closeConfirmDialog(result = false) {
  const dialog = activeConfirmDialog;
  if (!dialog) return;
  activeConfirmDialog = null;
  const modal = $("#confirm-modal");
  if (modal) modal.hidden = true;
  window.setTimeout(() => dialog.previousActiveElement?.focus?.(), 0);
  dialog.resolve(Boolean(result));
}

function requestConfirmation(options = {}) {
  if (activeConfirmDialog) closeConfirmDialog(false);
  const modal = $("#confirm-modal");
  const title = $("#confirm-modal-title");
  const eyebrow = $("#confirm-modal-eyebrow");
  const message = $("#confirm-modal-message");
  const detail = $("#confirm-modal-detail");
  const iconNode = $("#confirm-modal-icon");
  const submit = $("#confirm-modal-submit");
  const cancel = $("#confirm-modal-cancel");
  if (!modal || !title || !message || !submit) return Promise.resolve(false);

  const isDanger = options.tone === "danger";
  title.textContent = String(options.title || "确认操作");
  if (eyebrow) eyebrow.textContent = String(options.eyebrow || (isDanger ? "危险操作" : "确认操作"));
  message.textContent = String(options.message || "确定继续吗？");
  if (detail) {
    detail.textContent = String(options.detail || "");
    detail.hidden = !options.detail;
  }
  if (iconNode) {
    iconNode.classList.toggle("is-danger", isDanger);
    iconNode.innerHTML = icon(isDanger ? "trash" : "info");
  }
  submit.textContent = String(options.confirmLabel || "确定");
  if (cancel) cancel.textContent = String(options.cancelLabel || "取消");
  submit.classList.toggle("button--danger", isDanger);
  const previousActiveElement = document.activeElement;
  modal.hidden = false;
  window.setTimeout(() => submit.focus(), 0);

  return new Promise((resolve) => {
    activeConfirmDialog = { resolve, previousActiveElement };
  });
}

function concealPasswordField(field) {
  passwordRevealRequests.set(field, (passwordRevealRequests.get(field) || 0) + 1);
  if (field instanceof HTMLInputElement) {
    field.type = "password";
    field.value = "";
  } else {
    field.textContent = "••••••••";
    delete field.dataset.passwordVisible;
  }
  delete field.dataset.revealPending;
  field.removeAttribute("aria-busy");
}

async function revealPasswordField(field) {
  if (!field || field.dataset.revealPending === "true" || field.type === "text" || field.dataset.passwordVisible === "true") return;
  const requestId = (passwordRevealRequests.get(field) || 0) + 1;
  passwordRevealRequests.set(field, requestId);
  field.dataset.revealPending = "true";
  field.setAttribute("aria-busy", "true");
  try {
    const result = await invokeApi("revealPasswordEntry", {
      profileId: field.dataset.passwordProfileId,
      entryId: field.dataset.passwordEntryId,
    });
    const stillRequested = passwordRevealRequests.get(field) === requestId;
    if (!stillRequested || !field.isConnected || (!field.matches(":hover") && document.activeElement !== field)) return;
    if (field instanceof HTMLInputElement) {
      field.type = "text";
      field.value = result.password;
    } else {
      field.textContent = result.password;
      field.dataset.passwordVisible = "true";
    }
  } catch (error) {
    if (passwordRevealRequests.get(field) === requestId) showToast(error.message || "无法读取密码", "error");
  } finally {
    if (passwordRevealRequests.get(field) === requestId) {
      delete field.dataset.revealPending;
      field.removeAttribute("aria-busy");
    }
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = true;
  if (id === "extension-store-modal" || id === "extension-discovery-modal") {
    extensionStoreProxySelectionGeneration += 1;
    appState.extensionStore.proxySelectionPending = false;
    appState.extensionStore.routePicker.open = "";
    renderExtensionStoreProxySelectors();
  }
}

function fillPasswordEntryForm(entry = null) {
  const form = $("#password-entry-form");
  if (!form) return;
  form.reset();
  $("#password-entry-modal-title").textContent = entry ? "编辑记录" : "添加记录";
  $("#password-entry-id").value = entry?.id || "";
  const profileId = entry?.profileId || appState.passwordProfileId;
  $("#password-entry-profile-id").value = profileId;
  $("#password-entry-profile-name").textContent = appState.profiles.find((profile) => profile.id === profileId)?.name || "";
  $("#password-entry-service").value = entry?.service || "";
  $("#password-entry-account").value = entry?.account || "";
  $("#password-entry-website").value = entry?.website || "";
  $("#password-entry-password").required = !entry;
  $("#password-entry-password").placeholder = entry ? "留空保持当前密码" : "";
  $("#password-entry-password-required").hidden = Boolean(entry);
  $("#password-entry-notes").value = entry?.notes || "";
}

function fillProfileForm(profile = null) {
  const form = $("#profile-form");
  if (!form) return;
  $("#profile-modal-title").textContent = profile ? "编辑环境" : "新建环境";
  $("#profile-id").value = profile?.id || "";
  $("#profile-name").value = profile?.name || "";
  $("#profile-homepage").value = profile?.homepage || "";
  $("#profile-test-identity").value = profile?.testIdentityId || "保存后生成";
  $("#profile-test-origins").value = (profile?.testIdentityOrigins || []).join("\n");
  $("#profile-notes").value = profile?.notes || "";
  const select = $("#profile-node");
  const supportedNodes = appState.nodes.filter(isSelectableNode);
  const currentNode = profile?.nodeId ? appState.nodes.find((node) => node.id === profile.nodeId) : null;
  const unavailableSelection = currentNode && !isSelectableNode(currentNode)
    ? `<option value="${escapeHtml(currentNode.id)}" selected>当前节点不可用：${escapeHtml(currentNode.name)}</option>`
    : "";
  select.innerHTML = `<option value="">系统直连</option>${unavailableSelection}${supportedNodes.map((node) => {
    const protocolLabel = node.protocol === "http" && node.tls ? "HTTPS" : node.protocol.toUpperCase();
    return `<option value="${escapeHtml(node.id)}">${escapeHtml(node.name)} · ${escapeHtml(protocolLabel)}${node.requiresCore ? ` · ${node.core === "singbox" ? "sing-box" : "Xray"}` : ""}</option>`;
  }).join("")}`;
  select.value = profile?.nodeId || "";
  syncProfileConfigLock();
}

function updateNodeTransportFields() {
  const protocol = $("#node-protocol")?.value || "http";
  const tls = $("#node-tls");
  const tlsField = $("#node-tls-field");
  const sni = $("#node-sni");
  const sniLabel = $("#node-sni-label");
  const remoteDns = $("#node-remote-dns");
  const remoteDnsField = $("#node-remote-dns-field");
  const isSocks = protocol === "socks5";
  const isHttps = protocol === "https";
  if (tls) {
    tls.disabled = isSocks || isHttps;
    if (isHttps) tls.checked = true;
    if (isSocks) tls.checked = false;
  }
  if (tlsField) tlsField.hidden = isSocks;
  if (sni) sni.disabled = isSocks;
  if (sniLabel) sniLabel.hidden = isSocks;
  if (sni) sni.hidden = isSocks;
  if (remoteDns) remoteDns.disabled = !isSocks;
  if (remoteDnsField) remoteDnsField.hidden = !isSocks;
}

function fillNodeForm(node = null) {
  const form = $("#node-form");
  if (!form) return;
  $("#node-modal-title").textContent = node ? "编辑节点" : "添加节点";
  $("#node-id").value = node?.id || "";
  $("#node-name").value = node?.name || "";
  const protocol = node?.protocol === "http" && node?.tls
    ? "https"
    : node?.protocol === "socks" ? "socks5" : (node?.protocol || "http");
  const protocolSelect = $("#node-protocol");
  protocolSelect.querySelectorAll("option[data-dynamic-node-protocol]").forEach((option) => option.remove());
  const knownProtocols = ["http", "https", "socks5"];
  if (node && !knownProtocols.includes(protocol)) {
    const option = document.createElement("option");
    option.value = protocol;
    option.textContent = protocol.toUpperCase();
    option.dataset.dynamicNodeProtocol = "true";
    protocolSelect.append(option);
  }
  protocolSelect.value = node && !knownProtocols.includes(protocol) ? protocol : (knownProtocols.includes(protocol) ? protocol : "http");
  protocolSelect.disabled = Boolean(node && (node.sourceId || node.requiresCore || node.supported === false));
  $("#node-host").value = node?.host || "";
  $("#node-port").value = node?.port || "";
  $("#node-host").required = !node || node.supported !== false;
  $("#node-port").required = !node || node.supported !== false;
  $("#node-username").value = node?.username || "";
  $("#node-password").value = node?.password || "";
  $("#node-tls").checked = Boolean(node?.tls);
  $("#node-sni").value = node?.sni || "";
  $("#node-remote-dns").checked = Boolean(node?.remoteDns);
  updateNodeTransportFields();
}

function renderNodeDetails(node) {
  const content = $("#node-details-content");
  if (!content || !node) return;
  const editButton = $("#node-details-edit");
  if (editButton) editButton.dataset.id = node.id;
  const protocol = connectionProtocolLabel(node);
  const source = node.sourceId ? nodeGroupLabel(nodeGroupId(node)) : "手动节点";
  const rows = [
    ["名称", node.name],
    ["协议", protocol],
    ["服务器", nodeAddress(node)],
    ["IP 地址", nodeIpAddress(node)],
    ["核心", node.requiresCore ? (node.core === "singbox" ? "sing-box" : "Xray-core") : "直连代理"],
    ["核心协议", node.coreType || (node.requiresCore ? node.protocol.toUpperCase() : "不适用")],
    ["来源", source],
    ["凭据", node.hasCredentials ? "已保存（编辑时显示）" : "未设置"],
    ["状态", nodeStatus(node).label],
  ];
  content.innerHTML = `<dl class="node-details-grid">${rows.map(([label, value]) => label === "IP 地址"
    ? `<div><dt>${escapeHtml(label)}</dt><dd class="node-details-ip">${renderIpSummary(node, value, "node-details-ip-meta", "node-details-ip-value")}</dd></div>`
    : `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "未填写")}</dd></div>`).join("")}</dl>`;
}

function renderExtensionProfileOptions(selectedIds = [], listId = "extension-profile-options", emptyId = "extension-profile-empty") {
  const list = $(`#${listId}`);
  const empty = $(`#${emptyId}`);
  if (!list || !empty) return;
  const selected = new Set(asArray(selectedIds).map((id) => String(id)));
  list.innerHTML = appState.profiles.map((profile) => `<label class="extension-profile-option"><input type="checkbox" name="profileIds" value="${escapeHtml(profile.id)}"${selected.has(profile.id) ? " checked" : ""} /><span>${escapeHtml(profile.name)}</span></label>`).join("");
  empty.hidden = appState.profiles.length > 0;
}

function extensionSourceLabel(extension = {}) {
  if (extension.sourceType === "chrome-web-store") return "Chrome Web Store · 应用目录解包";
  if (extension.sourceType === "crxsoso-chrome") return "CRX Soso · Chrome 聚合来源";
  if (extension.loadMode === "direct" || extension.managed === false) return "未打包目录 · 直接加载";
  if (extension.loadMode === "managed" || extension.managed === true) return "压缩包 · 应用目录解包";
  return "来源待确认";
}

function renderExtensionPreview(metadata) {
  const preview = $("#extension-preview");
  if (!preview) return;
  if (!metadata) {
    preview.hidden = true;
    preview.textContent = "";
    return;
  }
  preview.hidden = false;
  preview.textContent = `${metadata.name || "未命名插件"} · v${metadata.version || "未知版本"} · Manifest V${metadata.manifestVersion || "?"} · ${extensionSourceLabel(metadata)}`;
}

function fillExtensionForm(extension = null) {
  const form = $("#extension-form");
  if (!form) return;
  $("#extension-modal-title").textContent = extension ? "编辑插件激活范围" : "导入插件";
  $("#extension-id").value = extension?.id || "";
  $("#extension-path").value = extension?.sourcePath || extension?.path || "";
  renderExtensionPreview(extension);
  renderExtensionProfileOptions(extension?.profileIds || []);
}

function fillExtensionStoreForm() {
  const form = $("#extension-store-form");
  if (!form) return;
  extensionStoreProxySelectionGeneration += 1;
  appState.extensionStore.proxySelectionPending = false;
  appState.extensionStore.proxySelectionRequired = true;
  appState.extensionStore.proxyNodeSelectionExplicit = false;
  form.reset();
  renderExtensionStoreProxySelectors();
  renderExtensionProfileOptions([], "extension-store-profile-options", "extension-store-profile-empty");
}

function extensionStoreImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "lhimg.crxsoso.com" && !host.endsWith(".crxsoso.com"))) return "";
    return url.toString();
  } catch {
    return "";
  }
}

const DEFAULT_EXTENSION_STORE_KEYWORD = "无障碍";

function extensionStoreCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "";
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function resetExtensionStoreDiscovery(source = "crxsoso") {
  extensionStoreProxySelectionGeneration += 1;
  const previous = appState.extensionStore;
  const proxyNodeId = source === "official" || !previous.proxyNodeSelectionExplicit
    ? ""
    : previous.proxyNodeId || "";
  appState.extensionStore = {
    keyword: DEFAULT_EXTENSION_STORE_KEYWORD,
    page: 1,
    token: "",
    hasMorePages: false,
    results: [],
    detail: null,
    loading: false,
    requestId: 0,
    view: "grid",
    source: source === "official" ? "official" : "crxsoso",
    proxyNodeId,
    proxySelectionPending: false,
    proxySelectionRequired: source === "official",
    proxyNodeSelectionExplicit: Boolean(proxyNodeId && previous.proxyNodeSelectionExplicit),
    routePicker: { open: "", filter: "", groupId: "all" },
  };
  const input = $("#extension-store-search");
  if (input) input.value = DEFAULT_EXTENSION_STORE_KEYWORD;
  renderExtensionStoreResults();
  renderExtensionStoreDetail();
  const status = $("#extension-store-status");
  if (status) status.textContent = source === "official" ? "正在加载 Chrome Web Store 推荐结果…" : "正在加载 CRX Soso 推荐结果…";
}

function extensionStoreSourceLabel(source = appState.extensionStore.source) {
  return source === "official" ? "Chrome Web Store" : "CRX Soso";
}

function chromeWebStoreDetailUrl(extensionId) {
  const id = String(extensionId || "").trim().toLowerCase();
  return /^[a-p]{32}$/.test(id) ? `https://chromewebstore.google.com/detail/${id}` : "";
}

function chromeWebStoreSearchUrl(keyword) {
  const value = String(keyword || "").trim().slice(0, 160);
  return value ? `https://chromewebstore.google.com/search/${encodeURIComponent(value)}` : "https://chromewebstore.google.com/";
}

function renderExtensionStoreOfficialLink() {
  const link = $("#extension-store-official-link");
  if (!link) return;
  link.href = chromeWebStoreSearchUrl(appState.extensionStore.keyword);
}

function extensionStoreProxyNodes() {
  return appState.nodes.filter((node) => (
    node.id
    && node.supported !== false
    && !["invalid", "unsupported"].includes(String(node.status || "").toLowerCase())
  ));
}

function extensionStoreNodeGroups() {
  const nodes = extensionStoreProxyNodes();
  const groups = [{ id: "direct", label: "系统直连", nodes: [null] }];
  const known = new Set(groups.map((group) => group.id));
  for (const [index, subscription] of appState.subscriptions.entries()) {
    const id = `subscription:${subscription.id}`;
    const groupNodes = nodes.filter((node) => nodeGroupId(node) === id);
    if (groupNodes.length) groups.push({ id, label: subscriptionLabel(subscription, index), nodes: groupNodes });
    known.add(id);
  }
  const manualNodes = nodes.filter((node) => nodeGroupId(node) === "manual");
  if (manualNodes.length) groups.push({ id: "manual", label: "手动", nodes: manualNodes });
  known.add("manual");
  for (const node of nodes) {
    const id = nodeGroupId(node);
    if (known.has(id)) continue;
    known.add(id);
    groups.push({ id, label: nodeGroupLabel(id), nodes: nodes.filter((candidate) => nodeGroupId(candidate) === id) });
  }
  return groups;
}

function extensionStoreSelectedNode() {
  return appState.extensionStore.proxyNodeId
    ? appState.nodes.find((node) => node.id === appState.extensionStore.proxyNodeId) || null
    : null;
}

function extensionStoreNodeSearchText(node, groupLabel = "") {
  if (!node) return "系统直连 直连 系统默认网络路径";
  return `${node.name || ""} ${node.host || ""} ${node.port || ""} ${nodeIpAddress(node)} ${node.source || ""} ${connectionProtocolLabel(node)} ${node.protocol || ""} ${groupLabel}`;
}

function extensionStoreNodeOption(node, groupLabel) {
  const nodeId = node?.id || "";
  const selected = extensionStoreProxyNodeId() === nodeId
    && (Boolean(nodeId) || appState.extensionStore.source !== "official" || appState.extensionStore.proxyNodeSelectionExplicit);
  const name = node ? String(node.name || "未命名节点") : "系统直连";
  const meta = node ? `${connectionProtocolLabel(node)} · ${nodeAddress(node)}${node.requiresCore ? " · 核心" : ""}` : "系统默认网络路径";
  const details = node || appState.connection?.direct || {};
  const health = renderConnectionHealth(details, "connection-option-health");
  const checking = node ? Boolean(appState.nodeChecks[nodeId]) : appState.directCheck;
  const checkAction = node ? "check-node" : "check-direct-connection";
  const checkId = node ? nodeId : "direct";
  const checkLabel = node ? "重新测试节点连通性" : "重新测试系统直连";
  return `<div class="connection-picker-option-row store-node-option-row" role="presentation"><button class="connection-picker-option${selected ? " is-selected" : ""}" type="button" role="option" aria-selected="${selected}" aria-label="${escapeHtml(`${name} · ${meta}`)}" title="${escapeHtml(`${name} · ${meta}`)}" data-store-node-option data-node-id="${escapeHtml(nodeId)}" data-search-text="${escapeHtml(`${extensionStoreNodeSearchText(node, groupLabel)} ${name} ${meta}`.toLocaleLowerCase())}"><span class="connection-picker-option-copy"><span class="connection-picker-option-name">${escapeHtml(name)}</span><span class="connection-picker-option-meta">${escapeHtml(meta)}</span></span></button>${health}<button class="row-action connection-picker-test" type="button" data-action="${checkAction}" data-id="${escapeHtml(checkId)}" title="${checkLabel}" aria-label="${checkLabel}"${checking ? " disabled" : ""}>${icon("zap")}</button></div>`;
}

function renderExtensionStoreNodePicker(popover, pickerId, groups, currentGroup, filter) {
  const groupTabs = groups.map((group) => {
    const active = group.id === currentGroup.id;
    return `<button class="connection-picker-group-switch${active ? " is-active" : ""}" type="button" role="tab" aria-selected="${active}" data-store-node-group="${escapeHtml(group.id)}">${escapeHtml(group.label)}<span class="connection-picker-group-count">${group.nodes.length}</span></button>`;
  }).join("");
  const options = currentGroup.nodes.filter((node) => !filter || `${extensionStoreNodeSearchText(node, currentGroup.label)} ${node ? node.name : "系统直连"}`.toLocaleLowerCase().includes(filter)).map((node) => extensionStoreNodeOption(node, currentGroup.label)).join("");
  popover.innerHTML = `<label class="connection-picker-search store-node-picker-search"><span class="sr-only">搜索节点</span>${icon("search")}<input type="search" value="${escapeHtml(appState.extensionStore.routePicker.filter)}" placeholder="搜索节点、地址或订阅" autocomplete="off" data-store-node-search /></label><div class="connection-picker-options store-node-picker-options"><div class="connection-picker-groups" role="tablist" aria-label="选择商店请求节点分组">${groupTabs}</div><div class="connection-picker-group"><div class="connection-picker-group-label" role="presentation">${escapeHtml(currentGroup.label)}</div><div role="listbox" aria-label="${escapeHtml(currentGroup.label)}">${options || `<div class="connection-picker-empty">没有匹配的节点</div>`}</div></div></div>`;
  const search = $(`[data-store-node-search]`, popover);
  if (search && document.activeElement?.matches?.("[data-store-node-search]")) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
  popover.closest("[data-store-node-picker]")?.classList.toggle("is-open", appState.extensionStore.routePicker.open === pickerId);
}

function renderExtensionStoreProxySelectors() {
  const state = appState.extensionStore;
  const nodes = extensionStoreProxyNodes();
  const availableIds = new Set(nodes.map((node) => String(node.id)));
  if (!availableIds.has(state.proxyNodeId)) state.proxyNodeId = "";
  const groups = extensionStoreNodeGroups();
  const preferredGroup = state.proxyNodeId
    ? groups.find((group) => group.nodes.some((node) => node?.id === state.proxyNodeId))?.id
    : "direct";
  if (!groups.some((group) => group.id === state.routePicker.groupId)) state.routePicker.groupId = preferredGroup || groups[0]?.id || "direct";
  const currentGroup = groups.find((group) => group.id === state.routePicker.groupId) || groups[0];
  const filter = String(state.routePicker.filter || "").trim().toLocaleLowerCase();
  const selected = extensionStoreSelectedNode();
  const pending = Boolean(state.proxySelectionPending);
  const label = selected
    ? String(selected.name || "未命名节点")
    : pending
      ? "正在选择代理"
      : state.proxySelectionRequired && !state.proxyNodeSelectionExplicit
        ? "没有可用代理"
        : "系统直连";
  const meta = selected
    ? `${connectionProtocolLabel(selected)} · ${nodeAddress(selected)}${selected.requiresCore ? " · 核心" : ""}`
    : pending
      ? "正在检查可联通节点"
      : state.proxySelectionRequired && !state.proxyNodeSelectionExplicit
        ? "官方商店请求已阻止"
        : "系统默认网络路径";
  $$('[data-store-node-picker]').forEach((picker) => {
    const pickerId = picker.dataset.storeNodePicker || "";
    const trigger = $(`[data-extension-store-proxy-node]`, picker);
    const popover = $(`[data-store-node-popover]`, picker);
    if (!trigger || !popover) return;
    const triggerLabel = $(`[data-store-node-label]`, trigger);
    const triggerMeta = $(`[data-store-node-meta]`, trigger);
    if (triggerLabel) triggerLabel.textContent = label;
    if (triggerMeta) triggerMeta.textContent = meta;
    const open = state.routePicker.open === pickerId;
    picker.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    popover.hidden = !open;
    if (open && currentGroup) renderExtensionStoreNodePicker(popover, pickerId, groups, currentGroup, filter);
    else if (!open) popover.innerHTML = "";
  });
}

function extensionStoreProxyNodeId() {
  return appState.extensionStore.proxyNodeId || "";
}

function selectRandomOfficialStoreProxy() {
  const generation = ++extensionStoreProxySelectionGeneration;
  appState.extensionStore.proxySelectionPending = true;
  appState.extensionStore.proxySelectionRequired = true;
  renderExtensionStoreProxySelectors();
  const run = (async () => {
    try {
      const result = await invokeApi("selectOfficialExtensionStoreProxy");
      if (generation !== extensionStoreProxySelectionGeneration) return "";
      const nodeId = String(result?.proxyNodeId || "");
      if (!nodeId || !extensionStoreProxyNodes().some((node) => String(node.id) === nodeId)) {
        throw new Error("没有可联通的代理节点，无法连接 Chrome Web Store");
      }
      appState.extensionStore.proxyNodeId = nodeId;
      appState.extensionStore.proxyNodeSelectionExplicit = false;
      appState.extensionStore.routePicker.open = "";
      appState.extensionStore.routePicker.filter = "";
      appState.extensionStore.routePicker.groupId = extensionStoreNodeGroups()
        .find((group) => group.nodes.some((node) => node?.id === nodeId))?.id || "direct";
      return nodeId;
    } finally {
      if (generation === extensionStoreProxySelectionGeneration) {
        appState.extensionStore.proxySelectionPending = false;
        renderExtensionStoreProxySelectors();
      }
    }
  })();
  extensionStoreProxySelectionPromise = run;
  run.finally(() => {
    if (extensionStoreProxySelectionPromise === run) extensionStoreProxySelectionPromise = null;
  }).catch(() => {});
  return run;
}

async function ensureOfficialStoreProxyForRequest() {
  if (appState.extensionStore.proxySelectionPending && extensionStoreProxySelectionPromise) {
    await extensionStoreProxySelectionPromise;
  }
  if (!extensionStoreProxyNodeId() && !appState.extensionStore.proxyNodeSelectionExplicit) {
    throw new Error("没有可联通的代理节点，无法连接 Chrome Web Store");
  }
}

function selectExtensionStoreProxyNode(nodeId) {
  const next = String(nodeId || "");
  if (next && !extensionStoreProxyNodes().some((node) => String(node.id) === next)) return;
  const wasExplicit = appState.extensionStore.proxyNodeSelectionExplicit;
  extensionStoreProxySelectionGeneration += 1;
  appState.extensionStore.proxySelectionPending = false;
  appState.extensionStore.proxyNodeSelectionExplicit = true;
  if (next === extensionStoreProxyNodeId()) {
    appState.extensionStore.routePicker.open = "";
    renderExtensionStoreProxySelectors();
    if (!next && !wasExplicit && !$("#extension-discovery-modal")?.hidden) void searchExtensionStore(false, true);
    return;
  }
  appState.extensionStore.proxyNodeId = next;
  appState.extensionStore.routePicker.open = "";
  appState.extensionStore.routePicker.filter = "";
  appState.extensionStore.routePicker.groupId = next
    ? extensionStoreNodeGroups().find((group) => group.nodes.some((node) => node?.id === next))?.id || "direct"
    : "direct";
  renderExtensionStoreProxySelectors();
  if (!$("#extension-discovery-modal")?.hidden) void searchExtensionStore(false, true);
}

function extensionStoreImageAllowed(value) {
  const raw = String(value || "");
  if (raw.length > 800000) return "";
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(raw)) return raw;
  if (appState.extensionStore.source !== "official") return extensionStoreImageUrl(raw);
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (!host.endsWith(".googleusercontent.com") && !host.endsWith(".gstatic.com"))) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function renderExtensionStoreSourceTabs() {
  $$('[data-extension-store-source]').forEach((button) => {
    const active = button.dataset.extensionStoreSource === appState.extensionStore.source;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const label = $("#extension-discovery-source-label");
  if (label) label.textContent = `${extensionStoreSourceLabel()} · Chrome`;
  const note = $("#extension-store-source-note");
  if (note) note.textContent = `${extensionStoreSourceLabel()} 提供搜索结果；安装时会在本地重新校验扩展身份和清单。`;
  renderExtensionStoreProxySelectors();
}

function renderExtensionStoreFilters() {
  const keyword = String(appState.extensionStore.keyword || "").trim();
  $$('[data-action="search-extension-store-category"]').forEach((button) => {
    const active = button.dataset.id === keyword;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function renderExtensionStoreViewToggle() {
  const view = appState.extensionStore.view === "list" ? "list" : "grid";
  $$('[data-action="toggle-extension-store-view"]').forEach((button) => {
    const active = button.dataset.id === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderExtensionStoreResults() {
  const list = $("#extension-store-results");
  if (!list) return;
  const state = appState.extensionStore;
  const heading = $("#extension-store-heading");
  if (heading) {
    const title = escapeHtml(state.keyword || "插件推荐");
    heading.innerHTML = `${title} <span id="extension-store-count">${state.results.length}</span>`;
  }
  list.classList.toggle("store-results-list", state.view === "list");
  list.classList.toggle("store-results-grid", state.view !== "list");
  renderExtensionStoreSourceTabs();
  renderExtensionStoreFilters();
  renderExtensionStoreViewToggle();
  renderExtensionStoreOfficialLink();
  if (state.loading && !state.results.length) {
    list.innerHTML = `<div class="extension-store-empty">正在搜索 ${escapeHtml(extensionStoreSourceLabel())}…</div>`;
    return;
  }
  if (!state.results.length) {
    list.innerHTML = `<div class="extension-store-empty">没有找到匹配的 Chrome 扩展</div>`;
    return;
  }
  list.innerHTML = state.results.map((item) => {
    const image = extensionStoreImageAllowed(item.imageAddon || item.image);
    const officialUrl = chromeWebStoreDetailUrl(item.id);
    const rating = item.averageRating ? String(item.averageRating) : "暂无评分";
    const installs = extensionStoreCount(item.activeInstallCount);
    return `<article class="extension-store-card" role="button" tabindex="0" data-action="open-extension-store-detail" data-id="${escapeHtml(item.id)}">
      <div class="extension-store-card-media">${image ? `<img class="extension-store-card-image" src="${escapeHtml(image)}" alt="" loading="lazy" />` : `<span class="extension-store-card-image extension-store-card-image--fallback" aria-hidden="true">${icon("puzzle")}</span>`}</div>
      <div class="extension-store-card-heading"><div class="extension-store-card-copy"><strong>${escapeHtml(item.name)}</strong></div></div>
      <div class="extension-store-card-badges"><span class="store-badge store-badge--chrome"><span class="store-platform-mark store-platform-mark--chrome">C</span> ${escapeHtml(extensionStoreSourceLabel())}</span><span class="store-badge">${escapeHtml(item.category || "扩展程序")}</span></div>
      <p>${escapeHtml(item.description || "暂无简介")}</p>
      <div class="extension-store-card-meta"><span class="store-rating"><svg class="svg-icon" aria-hidden="true"><use href="#icon-star"></use></svg>${escapeHtml(rating)}</span>${installs ? `<span class="store-installs"><svg class="svg-icon" aria-hidden="true"><use href="#icon-download"></use></svg>${escapeHtml(installs)}+</span>` : ""}<span class="extension-store-card-action">查看详情 ${icon("arrow-right")}</span>${officialUrl ? `<a class="extension-store-card-official-link" href="${escapeHtml(officialUrl)}" target="_blank" rel="noreferrer noopener" title="在 Chrome Web Store 打开">Chrome Web Store ${icon("link")}</a>` : ""}</div>
    </article>`;
  }).join("");
  if (state.hasMorePages) list.insertAdjacentHTML("beforeend", `<button class="button button--secondary extension-store-more" type="button" data-action="load-more-extension-store">加载更多</button>`);
}

function renderExtensionStoreDetail() {
  const panel = $("#extension-store-detail");
  if (!panel) return;
  const detail = appState.extensionStore.detail;
  if (!detail) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const image = extensionStoreImageAllowed(detail.image);
  const officialUrl = chromeWebStoreDetailUrl(detail.id);
  const stats = [
    detail.version ? ["版本", detail.version] : null,
    detail.manifestVersion ? ["Manifest", `V${detail.manifestVersion}`] : null,
    detail.averageRating ? ["评分", detail.averageRating] : null,
    detail.ratingCount ? ["评价", extensionStoreCount(detail.ratingCount)] : null,
    detail.activeInstallCount ? ["用户", extensionStoreCount(detail.activeInstallCount)] : null,
    detail.minKernelVersion ? ["最低内核", detail.minKernelVersion] : null,
  ].filter(Boolean);
  panel.hidden = false;
  panel.innerHTML = `<div class="extension-store-detail-header"><div class="extension-store-detail-heading">${image ? `<img class="extension-store-detail-image" src="${escapeHtml(image)}" alt="" />` : `<span class="extension-store-detail-image extension-store-card-image--fallback" aria-hidden="true">${icon("puzzle")}</span>`}<div><p class="eyebrow">插件详情</p><h3>${escapeHtml(detail.name)}</h3><p>${escapeHtml(detail.description || "暂无简介")}</p></div></div><button class="icon-button" type="button" data-action="close-extension-store-detail" title="关闭详情" aria-label="关闭详情"><svg class="svg-icon"><use href="#icon-close"></use></svg></button></div>
    <dl class="extension-store-detail-stats">${stats.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
    <p class="field-hint">来源：${escapeHtml(extensionStoreSourceLabel())}。实际安装包下载后仍会校验扩展 ID、清单和版本。</p>
    <div class="field-divider"><span>激活环境</span></div>
    <div class="extension-profile-options" id="extension-store-detail-profile-options"></div><p class="field-hint" id="extension-store-detail-profile-empty" hidden>还没有浏览器环境</p>
    <div class="extension-store-detail-actions">${officialUrl ? `<a class="button button--secondary" href="${escapeHtml(officialUrl)}" target="_blank" rel="noreferrer noopener"><svg class="svg-icon" aria-hidden="true"><use href="#icon-link"></use></svg> 打开 Chrome Web Store</a>` : ""}<button class="button button--primary" type="button" data-action="${appState.extensionStore.source === "official" ? "install-official" : "install-crxsoso"}" data-id="${escapeHtml(detail.id)}"><svg class="svg-icon" aria-hidden="true"><use href="#icon-download"></use></svg> 下载并安装</button></div>`;
  renderExtensionProfileOptions([], "extension-store-detail-profile-options", "extension-store-detail-profile-empty");
}

async function searchExtensionStore(loadMore = false, force = false) {
  const input = $("#extension-store-search");
  const keyword = String(input?.value || appState.extensionStore.keyword || "").trim();
  if (!keyword) {
    showToast("请输入插件搜索关键词", "warn");
    return;
  }
  const current = appState.extensionStore;
  if (current.loading && !force) return;
  const page = loadMore ? current.page + 1 : 1;
  const token = loadMore ? current.token : "";
  const requestId = Number(current.requestId || 0) + 1;
  current.requestId = requestId;
  if (!loadMore) {
    current.results = [];
    current.detail = null;
    renderExtensionStoreDetail();
  }
  current.keyword = keyword;
  current.loading = true;
  const status = $("#extension-store-status");
  if (status) status.textContent = `正在搜索“${keyword}”…`;
  renderExtensionStoreResults();
  try {
    if (current.source === "official") await ensureOfficialStoreProxyForRequest();
    const result = await invokeApi(appState.extensionStore.source === "official" ? "searchOfficialExtensionStore" : "searchExtensionStore", {
      keyword, page, size: 24, token, proxyNodeId: extensionStoreProxyNodeId(),
    });
    if (requestId !== current.requestId) return;
    const search = result?.search || {};
    current.keyword = keyword;
    current.page = page;
    current.token = String(search.nextToken || "");
    current.hasMorePages = Boolean(search.hasMorePages);
    current.results = loadMore ? current.results.concat(asArray(search.extensions)) : asArray(search.extensions);
    if (status) status.textContent = `${current.results.length} 个结果${current.hasMorePages ? "，可继续加载" : ""}`;
  } catch (error) {
    if (requestId !== current.requestId) return;
    const status = $("#extension-store-status");
    if (status) status.textContent = error.message || "搜索失败";
    showToast(error.message || "插件商店搜索失败", "error");
  } finally {
    if (requestId === current.requestId) {
      current.loading = false;
      renderExtensionStoreResults();
    }
  }
}

function searchExtensionStoreCategory(category) {
  const keyword = String(category || "").trim();
  if (!keyword) return;
  const input = $("#extension-store-search");
  if (input) input.value = keyword;
  appState.extensionStore.keyword = keyword;
  void searchExtensionStore();
}

function toggleExtensionStoreView(view) {
  appState.extensionStore.view = view === "list" ? "list" : "grid";
  renderExtensionStoreResults();
}

async function openExtensionStoreDetail(extensionId) {
  const id = String(extensionId || "").trim();
  if (!id) return;
  const status = $("#extension-store-status");
  if (status) status.textContent = "正在读取插件详情…";
  try {
    if (appState.extensionStore.source === "official") await ensureOfficialStoreProxyForRequest();
    const method = appState.extensionStore.source === "official" ? "getOfficialExtensionStoreDetail" : "getExtensionStoreDetail";
    const result = await invokeApi(method, { extensionId: id, proxyNodeId: extensionStoreProxyNodeId() });
    appState.extensionStore.detail = result?.detail || null;
    renderExtensionStoreDetail();
    $("#extension-store-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (status) status.textContent = appState.extensionStore.detail ? "已加载详情" : "没有找到详情";
  } catch (error) {
    showToast(error.message || "插件详情读取失败", "error");
  }
}

async function selectExtensionStoreSource(source) {
  const next = source === "official" ? "official" : "crxsoso";
  if (next === appState.extensionStore.source) return;
  resetExtensionStoreDiscovery(next);
  if (next === "official") {
    const status = $("#extension-store-status");
    if (status) status.textContent = "正在选择可联通的代理节点…";
    try {
      const selected = await selectRandomOfficialStoreProxy();
      if (!selected) return;
    } catch (error) {
      if (status) status.textContent = error.message || "没有可联通的代理节点";
      showToast(error.message || "没有可联通的代理节点，无法连接 Chrome Web Store", "error");
      return;
    }
  }
  void searchExtensionStore();
}

async function installOfficialExtension(extensionId) {
  const detail = appState.extensionStore.detail;
  if (!detail || detail.id !== extensionId) return;
  const profileIds = $$('input[name="profileIds"]', $("#extension-store-detail")).filter((input) => input.checked).map((input) => String(input.value));
  try {
    await ensureOfficialStoreProxyForRequest();
    setSyncState("安装中", "busy");
    const result = await invokeApi("installExtensionFromStore", {
      source: extensionId, profileIds, proxyNodeId: extensionStoreProxyNodeId(),
    });
    closeModal("extension-discovery-modal");
    await refreshState();
    const warnings = asArray(result?.warnings);
    showToast(warnings.length ? `插件已安装；${warnings[0]}` : "Chrome Web Store 插件已安装", warnings.length ? "warn" : "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "Chrome Web Store 插件安装失败", "error");
  }
}

async function installExtensionFromCrxSoso(extensionId) {
  const detail = appState.extensionStore.detail;
  if (!detail || detail.id !== extensionId) return;
  const profileIds = $$('input[name="profileIds"]', $("#extension-store-detail")).filter((input) => input.checked).map((input) => String(input.value));
  try {
    setSyncState("安装中", "busy");
    const result = await invokeApi("installExtensionFromCrxSoso", {
      extensionId, profileIds, proxyNodeId: extensionStoreProxyNodeId(),
    });
    closeModal("extension-discovery-modal");
    await refreshState();
    const warnings = asArray(result?.warnings);
    showToast(warnings.length ? `插件已安装；${warnings[0]}` : "CRX Soso 插件已安装", warnings.length ? "warn" : "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "CRX Soso 插件安装失败", "error");
  }
}

function invokeApi(method, payload) {
  if (typeof api[method] !== "function") return Promise.reject(new Error(`window.api.${method} 不可用`));
  return Promise.resolve()
    .then(() => (payload === undefined ? api[method]() : api[method](payload)))
    .then((result) => {
      // 主进程处理器返回可序列化的 { ok, error } 结果封装。
      if (result && result.ok === false && !result.canceled) throw new Error(result.error || `${method} 操作失败`);
      if (result && result.state) mergeState(result.state);
      return result;
    });
}

async function inspectExtensionPath(sourcePath) {
  if (!sourcePath) return null;
  try {
    const result = await invokeApi("inspectExtension", sourcePath);
    const metadata = result?.metadata || result;
    renderExtensionPreview(metadata);
    return metadata;
  } catch (error) {
    const preview = $("#extension-preview");
    if (preview) {
      preview.hidden = false;
      preview.textContent = error.message || "插件清单读取失败";
    }
    showToast(error.message || "插件清单读取失败", "error");
    return null;
  }
}

async function chooseExtension() {
  try {
    const result = await invokeApi("chooseExtensionPath");
    if (!result || result.canceled || !result.path) return;
    $("#extension-path").value = result.path;
    const metadata = result.metadata || await inspectExtensionPath(result.path);
    renderExtensionPreview(metadata);
  } catch (error) {
    showToast(error.message || "无法读取插件", "error");
  }
}

async function chooseUnpackedExtension() {
  try {
    const result = await invokeApi("chooseExtensionDirectory");
    if (!result || result.canceled || !result.path) return;
    $("#extension-path").value = result.path;
    const metadata = result.metadata || await inspectExtensionPath(result.path);
    renderExtensionPreview(metadata);
  } catch (error) {
    showToast(error.message || "无法读取未打包插件文件夹", "error");
  }
}

async function saveExtension(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const sourcePath = String(data.get("path") || "").trim();
  if (!sourcePath) {
    showToast("请选择插件目录或压缩包", "warn");
    return;
  }
  const profileIds = data.getAll("profileIds").map((value) => String(value));
  const extensionId = String(data.get("id") || $("#extension-id")?.value || "").trim();
  try {
    setSyncState("安装中", "busy");
    const result = await invokeApi("installExtension", { path: sourcePath, profileIds, id: extensionId || undefined });
    closeModal("extension-modal");
    await refreshState();
    const warnings = asArray(result?.warnings);
    const directLoad = result?.extension?.loadMode === "direct";
    showToast(warnings.length
      ? `${directLoad ? "未打包插件已加载" : "插件已保存"}；${warnings[0]}`
      : directLoad ? "未打包插件已直接加载并保存" : "插件已安装并保存", warnings.length ? "warn" : "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "插件安装失败", "error");
  }
}

async function installExtensionFromStore(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const source = String(data.get("source") || "").trim();
  const profileIds = data.getAll("profileIds").map((value) => String(value));
  if (!source) {
    showToast("请输入 Chrome Web Store 地址或扩展 ID", "warn");
    return;
  }
  try {
    await ensureOfficialStoreProxyForRequest();
    setSyncState("安装中", "busy");
    const result = await invokeApi("installExtensionFromStore", {
      source, profileIds, proxyNodeId: extensionStoreProxyNodeId(),
    });
    closeModal("extension-store-modal");
    await refreshState();
    const warnings = asArray(result?.warnings);
    showToast(warnings.length ? `插件已安装；${warnings[0]}` : "Chrome Web Store 插件已安装", warnings.length ? "warn" : "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "Chrome Web Store 插件安装失败", "error");
  }
}

async function savePasswordEntry(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await invokeApi("savePasswordEntry", {
      profileId: String($("#password-entry-profile-id").value || ""),
      entry: {
        id: String(data.get("id") || $("#password-entry-id").value || ""),
        service: String(data.get("service") || ""),
        account: String(data.get("account") || ""),
        website: String(data.get("website") || ""),
        password: String(data.get("password") || ""),
        notes: String(data.get("notes") || ""),
      },
    });
    closeModal("password-entry-modal");
    await refreshState();
    showToast("密码记录已保存", "success");
  } catch (error) {
    showToast(error.message || "保存密码记录失败", "error");
  }
}

async function deletePasswordEntry(entryId) {
  const entry = appState.passwordEntries.find((item) => item.id === entryId && item.profileId === appState.passwordProfileId);
  if (!entry || !(await requestConfirmation({
    title: "删除密码记录",
    message: `确定删除“${entry.service}”的密码记录吗？`,
    detail: "删除后无法恢复。",
    tone: "danger",
    confirmLabel: "删除记录",
  }))) return;
  try {
    await invokeApi("deletePasswordEntry", { profileId: entry.profileId, entryId });
    await refreshState();
    showToast("密码记录已删除", "success");
  } catch (error) {
    showToast(error.message || "删除密码记录失败", "error");
  }
}

async function setExtensionProfiles(extensionId, profileIds) {
  try {
    const result = await invokeApi("setExtensionProfiles", { extensionId, profileIds });
    const warnings = asArray(result?.warnings);
    if (warnings.length) showToast(warnings[0], "warn");
    else showToast("插件激活范围已更新", "success");
  } catch (error) {
    await refreshState();
    showToast(error.message || "更新插件激活范围失败", "error");
  }
}

async function toggleExtensionProfile(extensionId, profileId, enabled) {
  const extension = appState.extensions.find((item) => item.id === extensionId);
  if (!extension) return;
  try {
    const result = await invokeApi("setExtensionProfile", { extensionId, profileId, enabled });
    const warnings = asArray(result?.warnings);
    if (warnings.length) showToast(warnings[0], "warn");
    else showToast("插件激活范围已更新", "success");
  } catch (error) {
    await refreshState();
    showToast(error.message || "更新插件激活范围失败", "error");
  }
}

async function deleteExtension(id) {
  const extension = appState.extensions.find((item) => item.id === id);
  if (!extension || !(await requestConfirmation({
    title: "卸载插件",
    message: `确定卸载插件“${extension.name}”吗？`,
    detail: "插件将从管理列表和已激活环境中移除。",
    tone: "danger",
    confirmLabel: "卸载插件",
  }))) return;
  try {
    await invokeApi("deleteExtension", id);
    await refreshState();
    showToast("插件已卸载", "success");
  } catch (error) {
    showToast(error.message || "卸载插件失败", "error");
  }
}

async function checkExtensionUpdate(id, silent = false) {
  const extension = appState.extensions.find((item) => item.id === id);
  if (!extension || !extension.updateUrl) return null;
  try {
    const result = await invokeApi("checkExtensionUpdate", id);
    const update = result?.update || {};
    if (!silent) {
      if (update.available) showToast(`“${extension.name}”可更新至 v${update.version}`, "success");
      else showToast(update.error || `“${extension.name}”已是最新版`, update.error ? "warn" : "info");
    }
    return update;
  } catch (error) {
    if (!silent) showToast(error.message || "检查插件更新失败", "error");
    return null;
  }
}

let extensionBatchUpdating = false;

async function updateExtension(id) {
  const extension = appState.extensions.find((item) => item.id === id);
  if (!extension) return;
  const hasOnlineSource = Boolean(extension.updateUrl);
  const confirmation = hasOnlineSource
    ? `确定将“${extension.name}”更新到在线版本吗？`
    : `确定更新“${extension.name}”的本地代码吗？`;
  if (!(await requestConfirmation({
    title: hasOnlineSource ? "更新在线插件" : "刷新本地插件",
    message: confirmation,
    detail: hasOnlineSource ? "将从官方来源下载并替换当前版本。" : "将重新读取当前插件目录并重载代码。",
    confirmLabel: "开始更新",
  }))) return;
  try {
    setSyncState("更新插件", "busy");
    const result = await invokeApi("updateExtension", id);
    await refreshState();
    if (!result?.updated) {
      showToast(hasOnlineSource ? "当前没有可用的官方更新" : "本地插件代码未更新", "info");
      return;
    }
    const warnings = asArray(result?.warnings);
    const successMessage = hasOnlineSource ? "插件已更新到官方最新版" : "插件本地代码已更新";
    showToast(warnings.length ? `插件已更新；${warnings[0]}` : successMessage, warnings.length ? "warn" : "success");
  } catch (error) {
    setSyncState(hasOnlineSource ? "连接失败" : "更新失败", "error");
    showToast(error.message || "插件更新失败", "error");
  }
}

async function updateAllExtensions() {
  if (extensionBatchUpdating) return;
  const extensions = appState.extensions.map((extension) => ({
    id: extension.id,
    name: extension.name || "未命名插件",
  }));
  if (!extensions.length) return;
  if (!(await requestConfirmation({
    title: "批量更新插件",
    message: `确定批量更新全部 ${extensions.length} 个已安装插件吗？`,
    detail: "在线插件将检查并应用官方更新；本地插件将重新加载当前目录代码。",
    confirmLabel: "批量更新",
  }))) return;

  extensionBatchUpdating = true;
  renderExtensions();
  setSyncState("批量更新中", "busy");
  let updatedCount = 0;
  let noUpdateCount = 0;
  const failures = [];
  const warnings = [];
  try {
    for (const extension of extensions) {
      try {
        const result = await invokeApi("updateExtension", extension.id);
        if (result?.updated) updatedCount += 1;
        else noUpdateCount += 1;
        warnings.push(...asArray(result?.warnings).filter(Boolean));
      } catch (error) {
        failures.push({ name: extension.name, error: error.message || "更新失败" });
      }
    }
    await refreshState();
  } finally {
    extensionBatchUpdating = false;
    renderExtensions();
  }

  const summary = `批量更新完成：已更新 ${updatedCount} 个，无可用更新 ${noUpdateCount} 个，失败 ${failures.length} 个`;
  const details = [];
  if (failures.length) {
    const names = failures.slice(0, 3).map((item) => item.name).join("、");
    details.push(`失败：${names}${failures.length > 3 ? `等 ${failures.length} 个插件` : `（${failures[0].error.slice(0, 100)}）`}`);
  }
  if (warnings.length) details.push(`提示：${String(warnings[0]).slice(0, 120)}`);
  const kind = failures.length || warnings.length ? "warn" : updatedCount ? "success" : "info";
  showToast([summary, ...details].join("；"), kind);
}

let extensionAutoCheckAt = 0;
async function autoCheckExtensionUpdates() {
  const now = Date.now();
  if (now - extensionAutoCheckAt < 10 * 60 * 1000) return;
  const candidates = appState.extensions.filter((extension) => extension.updateUrl).slice(0, 12);
  if (!candidates.length) return;
  extensionAutoCheckAt = now;
  for (const extension of candidates) await checkExtensionUpdate(extension.id, true);
}

async function refreshState(showFeedback = false) {
  setSyncState("同步中", "busy");
  try {
    const state = await invokeApi("getState");
    mergeState(state);
    setSyncState("已连接");
    if (appState.activeView === "extensions") void autoCheckExtensionUpdates();
    if (showFeedback) showToast("数据已刷新", "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "无法读取本地状态", "error");
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const nodeId = $("#profile-node").value;
  const testIdentityOrigins = $("#profile-test-origins").value;
  const notes = $("#profile-notes").value.trim();
  if (!name) return;
  const profile = {
    id: String(data.get("id") || $("#profile-id").value || ""),
    name,
    homepage: String(data.get("homepage") || "").trim(),
    startUrl: String(data.get("homepage") || "").trim() || "about:blank",
    connectionMode: nodeId ? "node" : "direct",
    nodeId: nodeId || null,
    testIdentityOrigins,
    notes,
    note: notes,
  };
  const existing = appState.profiles.find((item) => item.id === profile.id);
  if (existing) {
    profile.createdAt = existing.createdAt;
    profile.lastLaunchedAt = existing.lastLaunchedAt;
    profile.color = existing.color;
  }
  try {
    setSyncState("保存中", "busy");
    await invokeApi("saveProfile", profile);
    closeModal("profile-modal");
    await refreshState();
    showToast("环境已保存", "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "保存环境失败", "error");
  }
}

async function deleteProfile(id) {
  const profile = appState.profiles.find((candidate) => candidate.id === id);
  if (!profile || !(await requestConfirmation({
    title: "删除浏览器环境",
    message: `确定删除环境“${profile.name}”吗？`,
    detail: "其本地浏览器数据和相关密码记录也会被删除，且无法恢复。",
    tone: "danger",
    confirmLabel: "删除环境",
  }))) return;
  try {
    await invokeApi("deleteProfile", id);
    await refreshState();
    showToast("环境已删除", "success");
  } catch (error) {
    showToast(error.message || "删除环境失败", "error");
  }
}

async function resolveProfileLaunchConfirmation(profileId, confirmation) {
  if (!confirmation?.confirmationRequired) return confirmation;
  const profile = appState.profiles.find((candidate) => candidate.id === profileId);
  const profileName = profile?.name || "环境";
  const confirmed = await requestConfirmation({
    eyebrow: "连接安全提示",
    title: "出口 IP 已变化",
    message: `“${profileName}”当前出口 IP 为 ${confirmation.currentIp}，与上次启动时的 ${confirmation.previousIp} 不同。`,
    detail: "建议切换到上次出口 IP 对应的节点。仍要启动当前连接吗？",
    confirmLabel: "仍然启动",
  });
  return invokeApi("resolveProfileLaunchConfirmation", {
    profileId,
    confirmationToken: confirmation.confirmationToken,
    confirmed,
  });
}

async function requestProfileLaunch(id) {
  const result = await invokeApi("launchProfile", id);
  return result?.confirmationRequired
    ? resolveProfileLaunchConfirmation(id, result)
    : result;
}

async function toggleProfile(id) {
  const profile = appState.profiles.find((candidate) => candidate.id === id);
  if (!profile) return;
  if (["starting", "stopping", "switching", "saving"].includes(appState.profileStatuses[id])) return;
  const running = profileStatus(profile).running;
  const method = running ? "stopProfile" : "launchProfile";
  appState.profileStatuses[id] = running ? "stopping" : "starting";
  renderAll();
  try {
    const result = method === "launchProfile"
      ? await requestProfileLaunch(id)
      : await invokeApi(method, id);
    if (result?.cancelled) {
      delete appState.profileStatuses[id];
      renderAll();
      showToast("已取消启动，请检查环境连接", "warn");
      return;
    }
    if (method === "launchProfile") showToast(`正在启动“${profile.name}”`, "success");
    else showToast(`已请求停止“${profile.name}”`, "success");
    if (result?.warning) showToast(result.warning, "warn");
    await refreshState();
  } catch (error) {
    delete appState.profileStatuses[id];
    renderAll();
    showToast(error.message || "操作环境失败", "error");
  }
}

async function launchProfileDirect(id) {
  const profile = appState.profiles.find((candidate) => candidate.id === id);
  if (!profile) return;
  if (!profileStatus(profile).running) {
    await toggleProfile(id);
    return;
  }
  try {
    const result = await invokeApi("launchProfile", id);
    if (result?.warning) showToast(result.warning, "warn");
    await refreshState();
  } catch (error) {
    showToast(error.message || "进入环境失败", "error");
  }
}

async function switchProfileNode(profileId, nodeId) {
  const profile = appState.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.nodeId === nodeId || (!profile.nodeId && !nodeId)) return;
  try {
    appState.profileStatuses[profileId] = profileStatus(profile).running ? "switching" : "saving";
    renderAll();
    const result = await invokeApi("switchProfileNode", { profileId, nodeId });
    const launchResult = result?.launchConfirmation
      ? await resolveProfileLaunchConfirmation(profileId, result.launchConfirmation)
      : null;
    await refreshState();
    showToast(launchResult?.cancelled
      ? `“${profile.name}”连接已切换，启动已取消`
      : `“${profile.name}”连接已切换`, launchResult?.cancelled ? "warn" : "success");
  } catch (error) {
    await refreshState();
    showToast(error.message || "切换连接失败", "error");
  }
}

function fillSubscriptionForm(subscription = null) {
  const form = $("#import-form");
  if (!form) return;
  const editing = Boolean(subscription?.subscriptionId || subscription?.id);
  const subscriptionId = String(subscription?.subscriptionId || subscription?.id || "");
  const currentSortOrder = Number.isSafeInteger(Number(subscription?.sortOrder)) && Number(subscription.sortOrder) >= 0
    ? Number(subscription.sortOrder)
    : appState.subscriptions.reduce((max, item) => Math.max(max, Number.isSafeInteger(item.sortOrder) ? item.sortOrder : -1), -1) + 1;
  form.dataset.subscriptionId = subscriptionId;
  form.dataset.originalUrl = String(subscription?.url || "");
  $("#subscription-id").value = subscriptionId;
  $("#import-modal-title").textContent = editing ? "编辑订阅" : "导入订阅";
  $("#subscription-name").value = subscription?.name || "";
  $("#subscription-sort-order").value = String(currentSortOrder);
  $("#subscription-url").value = subscription?.url || "";
  $("#subscription-text").value = "";
  $("#subscription-text").disabled = editing;
  $("#subscription-text").setAttribute("aria-disabled", editing ? "true" : "false");
  const submit = $("#import-form button[type=submit]");
  if (submit) submit.textContent = editing ? "保存订阅" : "开始导入";
}

async function editSubscription(id) {
  try {
    setSyncState("读取中", "busy");
    const details = await invokeApi("getSubscriptionEdit", id);
    fillSubscriptionForm(details);
    openModal("import-modal");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "读取订阅失败", "error");
  }
}

async function importSubscription(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const url = String(data.get("url") || "").trim();
  const text = String(data.get("text") || "").trim();
  const sortOrder = String(data.get("sortOrder") || "").trim();
  const subscriptionId = String(form.dataset.subscriptionId || "");
  if (!url && !text) {
    showToast("请填写订阅地址或粘贴订阅内容", "warn");
    return;
  }
  try {
    setSyncState(subscriptionId ? "保存中" : "导入中", "busy");
    let result;
    if (subscriptionId) {
      const originalUrl = String(form.dataset.originalUrl || "");
      if (url !== originalUrl) {
        result = await invokeApi("importSubscription", {
          subscriptionId,
          name: name || undefined,
          sortOrder,
          url: url || undefined,
        });
      } else {
        result = await invokeApi("editSubscription", { subscriptionId, name, sortOrder });
      }
      await refreshState();
      closeModal("import-modal");
      form.reset();
      fillSubscriptionForm();
      showToast("订阅已保存", "success");
      return;
    }
    result = await invokeApi("importSubscription", {
      name: name || undefined,
      sortOrder,
      url: url || undefined,
      text: text || undefined,
    });
    closeModal("import-modal");
    form.reset();
    await refreshState();
    fillSubscriptionForm();
    const unsupportedCount = Array.isArray(result?.unsupported) ? result.unsupported.length : 0;
    const errorCount = Array.isArray(result?.errors) ? result.errors.length : 0;
    if (result?.secretsRetained) showToast("检测到的密钥已加密并长期保留", "info");
    if (result?.secretsOmitted) showToast("未保留检测到的密钥；节点已导入但认证字段为空", "warn");
    if (result?.subscriptionUrlOmitted) showToast("订阅地址中的密钥未保留；下次刷新需要重新输入地址", "warn");
    if (unsupportedCount || errorCount) {
      const details = [];
      if (unsupportedCount) details.push(`${unsupportedCount} 个不支持的协议`);
      if (errorCount) details.push(`${errorCount} 行无法识别`);
      showToast(`已导入节点；${details.join("，")}已保留提示`, "warn");
    }
    else showToast("订阅导入完成", "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "订阅导入失败", "error");
  }
}

async function saveNode(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const protocol = String(data.get("protocol") || "http").toLowerCase();
  const host = String(data.get("host") || "").trim();
  const port = String(data.get("port") || "").trim();
  if (!host || !port) {
    showToast("请填写服务器地址和端口", "warn");
    return;
  }
  const input = {
    id: String(data.get("id") || $("#node-id")?.value || "").trim(),
    name: String(data.get("name") || "").trim(),
    protocol,
    host,
    port,
    username: String(data.get("username") || "").trim(),
    password: String(data.get("password") || ""),
    tls: data.get("tls") === "on",
    sni: String(data.get("sni") || "").trim(),
    remoteDns: data.get("remoteDns") === "on",
  };
  try {
    setSyncState("保存中", "busy");
    const result = await invokeApi("saveNode", input);
    closeModal("node-modal");
    form.reset();
    await refreshState();
    if (result?.secretsRetained) showToast("节点已保存，密钥已加密并长期保留", "info");
    else if (result?.secretsOmitted) showToast("节点已保存，但未保留密钥", "warn");
    else showToast("节点已保存", "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "保存节点失败", "error");
  }
}

async function checkNode(id) {
  const node = appState.nodes.find((candidate) => candidate.id === id);
  if (!node) return;
  const nodeName = node.name;
  appState.nodeChecks[id] = true;
  node.status = "checking";
  renderAll();
  try {
    const result = await invokeApi("checkNode", id);
    const check = result?.result || result || {};
    const currentNode = appState.nodes.find((candidate) => candidate.id === id);
    if (!currentNode) return;
    if (!result?.state && check && typeof check === "object") applyRendererCheckResult(currentNode, check, "节点不可达");
    renderAll();
    if (AVAILABLE_NODE_STATUSES.has(String(currentNode.status || "").toLowerCase())) {
      const latency = Number(currentNode.latencyMs);
      const latencyText = Number.isFinite(latency) ? `：${Math.max(0, Math.round(latency))} ms` : "";
      showToast(`“${nodeName}”检查成功${latencyText}`, "success");
    } else {
      const phase = currentNode.lastCheckPhase ? `（${currentNode.lastCheckPhase}）` : "";
      const error = String(currentNode.lastCheckError || "节点不可达").slice(0, 180);
      showToast(`“${nodeName}”检查失败${phase}：${error}`, "warn");
    }
  } catch (error) {
    const currentNode = appState.nodes.find((candidate) => candidate.id === id);
    if (currentNode) {
      currentNode.status = "error";
      currentNode.latencyMs = null;
      currentNode.lastCheckedAt = new Date().toISOString();
      currentNode.lastCheckPhase = "check";
      currentNode.lastCheckError = error.message || "节点检查失败";
    }
    renderAll();
    showToast(error.message || "节点检查失败", "error");
  } finally {
    delete appState.nodeChecks[id];
    renderAll();
  }
}

async function checkDirectConnection() {
  if (appState.directCheck) return;
  appState.directCheck = true;
  appState.connection = appState.connection || {};
  appState.connection.direct = { ...(appState.connection.direct || {}), status: "checking", latencyMs: null, lastCheckError: "" };
  renderAll();
  try {
    const result = await invokeApi("checkDirectConnection");
    const check = result?.result || result || {};
    const reachable = check.ok ?? check.reachable ?? check.available;
    showToast(`系统直连检查完成：${reachable === true ? "可达" : "不可达"}`, reachable === true ? "success" : "warn");
  } catch (error) {
    const target = appState.connection.direct;
    target.status = "error";
    target.latencyMs = null;
    target.lastCheckedAt = new Date().toISOString();
    target.lastCheckPhase = "check";
    target.lastCheckError = error.message || "直连检查失败";
    showToast(error.message || "系统直连检查失败", "error");
  } finally {
    appState.directCheck = false;
    renderAll();
  }
}

async function checkProfileConnection(id) {
  const profile = appState.profiles.find((candidate) => candidate.id === id);
  if (!profile || appState.profileChecks[id]) return;
  const node = profile.nodeId ? appState.nodes.find((candidate) => candidate.id === profile.nodeId) : null;
  const hasNodeSelection = Boolean(profile.nodeId);
  if (hasNodeSelection && !node) {
    showToast("当前节点已移除，请重新选择连接", "error");
    return;
  }
  const targetLabel = node ? `当前节点“${node.name}”` : "系统直连";
  appState.profileChecks[id] = true;
  if (node) {
    node.status = "checking";
  } else {
    appState.connection = appState.connection || {};
    appState.connection.direct = { ...(appState.connection.direct || {}), status: "checking", latencyMs: null, lastCheckError: "" };
  }
  renderAll();
  try {
    const result = await invokeApi("checkProfileConnection", id);
    const check = result?.result || result || {};
    if (!result?.state && check && typeof check === "object") {
      if (node) applyRendererCheckResult(node, check, "节点不可达");
      else applyRendererCheckResult(appState.connection.direct, check, "直连不可达");
    }
    const reachable = check.ok ?? check.reachable ?? check.available;
    showToast(`${targetLabel}检查完成：${reachable === true ? "可达" : "不可达"}`, reachable === true ? "success" : "warn");
  } catch (error) {
    const target = node || appState.connection?.direct;
    if (target) {
      target.status = "error";
      target.latencyMs = null;
      target.lastCheckedAt = new Date().toISOString();
      target.lastCheckPhase = "check";
      target.lastCheckError = error.message || "连接检查失败";
    }
    showToast(error.message || `${targetLabel}检查失败`, "error");
  } finally {
    delete appState.profileChecks[id];
    renderAll();
  }
}

async function checkVisibleNodes() {
  if (appState.batchChecking) return;
  const nodes = filteredNodes().filter(isNodeCheckable);
  if (!nodes.length) {
    showToast("当前筛选结果没有可检查的节点", "warn");
    return;
  }
  appState.batchChecking = true;
  for (const node of nodes) node.status = "checking";
  renderAll();
  try {
    const response = await invokeApi("checkNodes", nodes.map((node) => node.id));
    const results = Array.isArray(response?.results) ? response.results : [];
    const reachable = results.filter((result) => result?.ok).length;
    const failed = results.length - reachable;
    const skipped = Array.isArray(response?.skipped) ? response.skipped.length : 0;
    const skippedLabel = skipped ? `，跳过 ${skipped} 个` : "";
    showToast(`批量检查完成：可达 ${reachable} 个，失败 ${failed} 个${skippedLabel}`, failed ? "warn" : "success");
  } catch (error) {
    await refreshState();
    showToast(error.message || "批量检查失败", "error");
  } finally {
    appState.batchChecking = false;
    renderAll();
  }
}

async function deleteNode(id) {
  const node = appState.nodes.find((candidate) => candidate.id === id);
  if (!node || !(await requestConfirmation({
    title: "删除连接节点",
    message: `确定删除节点“${node.name}”吗？`,
    detail: "该节点将从订阅分组和环境连接选择中移除。",
    tone: "danger",
    confirmLabel: "删除节点",
  }))) return;
  try {
    await invokeApi("deleteNode", id);
    await refreshState();
    showToast("节点已删除", "success");
  } catch (error) {
    showToast(error.message || "删除节点失败", "error");
  }
}

async function setNodeCore(nodeId, core) {
  try {
    await invokeApi("setNodeCore", { nodeId, core });
    await refreshState();
    showToast(`节点核心已切换为 ${core === "singbox" ? "sing-box" : "Xray"}`, "success");
  } catch (error) {
    await refreshState();
    showToast(error.message || "切换节点核心失败", "error");
  }
}

async function refreshSubscription(id) {
  const item = appState.subscriptions.find((candidate) => candidate.id === id);
  if (!item) return;
  try {
    setSyncState("更新中", "busy");
    const result = await invokeApi("refreshSubscription", id);
    await refreshState();
    showToast(`“${item.name || "订阅"}”已更新`, "success");
    if (result?.recordedUnsupported) showToast(`有 ${result.recordedUnsupported} 个节点暂不支持`, "warn");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "订阅更新失败", "error");
  }
}

async function moveSubscription(id, direction) {
  try {
    setSyncState("排序中", "busy");
    await invokeApi("moveSubscription", { subscriptionId: id, direction });
    await refreshState();
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "调整订阅顺序失败", "error");
  }
}

async function reorderSubscription(subscriptionId, targetId, position) {
  if (!subscriptionId || !targetId || subscriptionId === targetId) return;
  try {
    setSyncState("排序中", "busy");
    await invokeApi("reorderSubscriptions", { subscriptionId, targetId, position });
    await refreshState();
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "拖拽订阅排序失败", "error");
  }
}

async function deleteSubscription(id) {
  const item = appState.subscriptions.find((candidate) => candidate.id === id);
  if (!item || !(await requestConfirmation({
    title: "删除订阅",
    message: `确定删除订阅“${item.name || "在线订阅"}”及其节点吗？`,
    detail: "订阅记录和它导入的节点将一并删除，且无法恢复。",
    tone: "danger",
    confirmLabel: "删除订阅",
  }))) return;
  try {
    await invokeApi("deleteSubscription", id);
    await refreshState();
    showToast("订阅已删除", "success");
  } catch (error) {
    showToast(error.message || "删除订阅失败", "error");
  }
}

async function refreshAllSubscriptions() {
  const subscriptions = asArray(appState.subscriptions);
  if (!subscriptions.length) {
    showToast("还没有可更新的订阅", "warn");
    return;
  }
  for (const item of subscriptions) await refreshSubscription(item.id);
}

async function chooseEngine() {
  try {
    const result = await invokeApi("chooseEnginePath");
    const path = typeof result === "string" ? result : result?.path;
    if (path) $("#engine-path").value = path;
  } catch (error) {
    showToast(error.message || "无法选择 Chromium 文件", "error");
  }
}

async function chooseXray() {
  try {
    const result = await invokeApi("chooseXrayPath");
    const selected = typeof result === "string" ? result : result?.path;
    if (selected) $("#xray-path").value = selected;
  } catch (error) {
    showToast(error.message || "无法选择 Xray 核心", "error");
  }
}

async function chooseSingbox() {
  try {
    const result = await invokeApi("chooseSingboxPath");
    const selected = typeof result === "string" ? result : result?.path;
    if (selected) $("#singbox-path").value = selected;
  } catch (error) {
    showToast(error.message || "无法选择 sing-box 文件", "error");
  }
}

async function installCore(core) {
  try {
    setSyncState("下载核心", "busy");
    const result = await invokeApi("installCore", core);
    await refreshState();
    const label = core === "singbox" ? "sing-box" : "Xray";
    const version = String(result?.core?.version || "").trim();
    showToast(version ? `${label} 核心已更新至 ${version}` : `${label} 核心已安装或更新`, "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "Xray 核心安装失败", "error");
  }
}

async function installBrowser() {
  try {
    setSyncState("下载浏览器内核", "busy");
    await invokeApi("installBrowser");
    await refreshState();
    showToast("Chromium 浏览器内核已安装并设为外部引擎", "success");
  } catch (error) {
    setSyncState("连接失败", "error");
    showToast(error.message || "浏览器内核更新失败", "error");
  }
}

async function saveSettings() {
  const enginePath = $("#engine-path")?.value.trim() || "";
  const xrayPath = $("#xray-path")?.value.trim() || "";
  const singboxPath = $("#singbox-path")?.value.trim() || "";
  const defaultCore = $("#default-core-settings")?.value || "xray";
  const theme = themeFromForm();
  try {
    await invokeApi("saveSettings", { enginePath, xrayPath, singboxPath, defaultCore, theme });
    await refreshState();
    showToast("设置已保存", "success");
  } catch (error) {
    showToast(error.message || "保存设置失败", "error");
  }
}

function handleAction(action, id, direction = "") {
  switch (action) {
    case "new-profile":
      fillProfileForm();
      openModal("profile-modal");
      break;
    case "edit-profile":
      fillProfileForm(appState.profiles.find((profile) => profile.id === id));
      openModal("profile-modal");
      break;
    case "profile-config-locked":
      showToast("请先停止环境，再修改此项", "warn");
      break;
    case "delete-profile":
      void deleteProfile(id);
      break;
    case "toggle-profile":
      void toggleProfile(id);
      break;
    case "launch-profile":
      void launchProfileDirect(id);
      break;
    case "import-subscription":
      fillSubscriptionForm();
      openModal("import-modal");
      break;
    case "add-node":
    case "add-direct-node":
      fillNodeForm();
      openModal("node-modal");
      break;
    case "check-node":
      void checkNode(id);
      break;
    case "check-profile-connection":
      void checkProfileConnection(id);
      break;
    case "check-direct-connection":
      void checkDirectConnection();
      break;
    case "edit-node": {
      const node = appState.nodes.find((candidate) => candidate.id === id);
      if (node) {
        closeModal("node-details-modal");
        fillNodeForm(node);
        openModal("node-modal");
      }
      break;
    }
    case "view-node": {
      const node = appState.nodes.find((candidate) => candidate.id === id);
      if (node) {
        renderNodeDetails(node);
        openModal("node-details-modal");
      }
      break;
    }
    case "check-visible-nodes":
      void checkVisibleNodes();
      break;
    case "delete-node":
      void deleteNode(id);
      break;
    case "select-node-group":
      appState.nodeGroup = id || "all";
      renderNodes();
      break;
    case "select-connection-group": {
      appState.connectionPicker.groupId = id || "direct";
      renderLaunchpad();
      renderProfiles();
      const picker = activeConnectionPicker();
      if (picker) {
        positionConnectionPicker(picker);
        window.setTimeout(() => positionConnectionPicker(picker), 0);
      }
      break;
    }
    case "refresh-all-subscriptions":
      void refreshAllSubscriptions();
      break;
    case "refresh-subscription":
      void refreshSubscription(id);
      break;
    case "edit-subscription":
      void editSubscription(id);
      break;
    case "move-subscription":
      if (direction) void moveSubscription(id, direction);
      break;
    case "delete-subscription":
      void deleteSubscription(id);
      break;
    case "import-extension":
      fillExtensionForm();
      openModal("extension-modal");
      break;
    case "install-extension-store":
      fillExtensionStoreForm();
      openModal("extension-store-modal");
      void selectRandomOfficialStoreProxy().catch((error) => {
        if (!$("#extension-store-modal")?.hidden) showToast(error.message || "没有可联通的代理节点，无法连接 Chrome Web Store", "error");
      });
      break;
    case "browse-extension-store":
      resetExtensionStoreDiscovery();
      openModal("extension-discovery-modal");
      void searchExtensionStore();
      break;
    case "select-extension-store-source":
      void selectExtensionStoreSource(id);
      break;
    case "open-extension-store-detail":
      void openExtensionStoreDetail(id);
      break;
    case "load-more-extension-store":
      void searchExtensionStore(true);
      break;
    case "search-extension-store-category":
      searchExtensionStoreCategory(id);
      break;
    case "toggle-extension-store-view":
      toggleExtensionStoreView(id);
      break;
    case "close-extension-store-detail":
      appState.extensionStore.detail = null;
      renderExtensionStoreDetail();
      break;
    case "install-crxsoso":
      void installExtensionFromCrxSoso(id);
      break;
    case "install-official":
      void installOfficialExtension(id);
      break;
    case "new-password-entry":
      fillPasswordEntryForm();
      openModal("password-entry-modal");
      break;
    case "edit-password-entry": {
      const entry = appState.passwordEntries.find((item) => item.id === id);
      if (entry) {
        fillPasswordEntryForm(entry);
        openModal("password-entry-modal");
      }
      break;
    }
    case "delete-password-entry":
      void deletePasswordEntry(id);
      break;
    case "delete-extension":
      void deleteExtension(id);
      break;
    case "check-extension-update":
      void checkExtensionUpdate(id);
      break;
    case "update-extension":
      void updateExtension(id);
      break;
    case "update-all-extensions":
      void updateAllExtensions();
      break;
    case "configure-agent":
      void openAgentConfig();
      break;
    case "configure-agent-profile":
      void openAgentConfig(id);
      break;
    case "clear-agent-profile":
      void clearAgentProfile(id);
      break;
    default:
      break;
  }
}

function attachApiEvents() {
  if (typeof api.onStateUpdated === "function") api.onStateUpdated((state) => mergeState(state));
  if (typeof api.onConfirmationRequest === "function") api.onConfirmationRequest((request) => {
    if (!request?.requestId) return;
    void requestConfirmation(request.options || {})
      .then((confirmed) => api.respondToConfirmation?.(request.requestId, confirmed))
      .catch(() => api.respondToConfirmation?.(request.requestId, false));
  });
  if (typeof api.onNavigate === "function") api.onNavigate((view) => {
    activateView(view);
    if (view === "agent") void openAgentConfig();
  });
  if (typeof api.onCoreUpdateAvailable === "function") api.onCoreUpdateAvailable((update) => announceCoreUpdate(update));
  if (typeof api.onBrowserUpdateAvailable === "function") api.onBrowserUpdateAvailable((update) => announceBrowserUpdate(update));
  if (typeof api.on !== "function") return;
  api.on("state-updated", (state) => mergeState(state));
  api.on("profile-status", (event) => {
    if (!event || typeof event !== "object") return;
    const id = String(valueOf(event, ["id", "profileId"], ""));
    const status = String(valueOf(event, ["status", "state"], ""));
    if (!id || !status) return;
    appState.profileStatuses[id] = status;
    renderAll();
  });
}

function attachDomEvents() {
  window.interfaceZoom?.createInterfaceZoom({
    indicator: $("#zoom-indicator"),
    applyZoom: (factor) => api.setInterfaceZoom?.(factor),
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".password-site-secret")) event.preventDefault();
  });
  document.addEventListener("pointerover", (event) => {
    const field = event.target.closest?.("[data-password-entry-id]");
    if (!field || (event.relatedTarget && field.contains(event.relatedTarget))) return;
    void revealPasswordField(field);
  });
  document.addEventListener("pointerout", (event) => {
    const field = event.target.closest?.("[data-password-entry-id]");
    if (!field || (event.relatedTarget && field.contains(event.relatedTarget))) return;
    if (document.activeElement !== field) concealPasswordField(field);
  });
  document.addEventListener("focusin", (event) => {
    const field = event.target.closest?.("[data-password-entry-id]");
    if (field) void revealPasswordField(field);
  });
  document.addEventListener("focusout", (event) => {
    const field = event.target.closest?.("[data-password-entry-id]");
    if (field && !field.matches(":hover")) concealPasswordField(field);
  });
  document.addEventListener("change", (event) => {
    const bookmarkImportProfile = event.target.closest("#bookmark-import-profile");
    if (bookmarkImportProfile) {
      appState.bookmarkImportTargetId = String(bookmarkImportProfile.value || "");
      renderBookmarkImportSettings();
      return;
    }
    const bookmarkImportSource = event.target.closest("[data-bookmark-import-source]");
    if (bookmarkImportSource) {
      const sourceId = String(bookmarkImportSource.value || "");
      const selected = new Set(appState.bookmarkImportSelectedSourceIds);
      if (bookmarkImportSource.checked) selected.add(sourceId);
      else selected.delete(sourceId);
      appState.bookmarkImportSelectedSourceIds = [...selected];
      renderBookmarkImportSettings();
      return;
    }
    const select = event.target.closest("[data-profile-switch]");
    if (select) void switchProfileNode(select.dataset.profileSwitch, select.value);
    const coreSelect = event.target.closest("[data-node-core]");
    if (coreSelect) void setNodeCore(coreSelect.dataset.nodeCore, coreSelect.value);
    const defaultCore = event.target.closest("#default-core");
    if (defaultCore) {
      const settingsSelect = $("#default-core-settings");
      if (settingsSelect) settingsSelect.value = defaultCore.value;
      void saveSettings();
    }
    const extensionProfile = event.target.closest("[data-extension-profile]");
    if (extensionProfile) {
      void toggleExtensionProfile(extensionProfile.dataset.extensionId, extensionProfile.dataset.extensionProfile, extensionProfile.checked);
      return;
    }
    const agentScopeAll = event.target.closest("[data-agent-scope-all]");
    if (agentScopeAll) {
      const ids = appState.profiles.map((profile) => profile.id);
      void saveAgentScope(agentScopeAll.checked ? "all" : "selected", ids);
      return;
    }
    const agentProfile = event.target.closest("[data-agent-profile]");
    if (agentProfile) {
      const selected = agentScopeProfileIds();
      if (appState.settings.agentProfileScope !== "selected") {
        appState.settings.agentProfileScope = "selected";
        selected.clear();
        appState.profiles.forEach((profile) => selected.add(profile.id));
      }
      if (agentProfile.checked) selected.add(agentProfile.dataset.agentProfile);
      else selected.delete(agentProfile.dataset.agentProfile);
      void saveAgentScope("selected", [...selected]);
    }
  });
  document.addEventListener("dragstart", (event) => {
    const row = event.target.closest?.("[data-subscription-row]");
    if (!row || event.target.closest("button, input, select, textarea, a")) {
      event.preventDefault();
      return;
    }
    draggedSubscriptionId = row.dataset.subscriptionRow || "";
    row.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedSubscriptionId);
    }
  });
  document.addEventListener("dragover", (event) => {
    const row = event.target.closest?.("[data-subscription-row]");
    if (!draggedSubscriptionId || !row || row.dataset.subscriptionRow === draggedSubscriptionId) return;
    event.preventDefault();
    $$("[data-subscription-row].is-drag-over").forEach((item) => item.classList.remove("is-drag-over"));
    row.classList.add("is-drag-over");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  document.addEventListener("drop", (event) => {
    const row = event.target.closest?.("[data-subscription-row]");
    if (!draggedSubscriptionId || !row || row.dataset.subscriptionRow === draggedSubscriptionId) return;
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    const position = event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
    void reorderSubscription(draggedSubscriptionId, row.dataset.subscriptionRow || "", position);
    draggedSubscriptionId = "";
    $$("[data-subscription-row].is-drag-over, [data-subscription-row].is-dragging").forEach((item) => item.classList.remove("is-drag-over", "is-dragging"));
  });
  document.addEventListener("dragend", () => {
    draggedSubscriptionId = "";
    $$("[data-subscription-row].is-drag-over, [data-subscription-row].is-dragging").forEach((item) => item.classList.remove("is-drag-over", "is-dragging"));
  });
  document.addEventListener("dblclick", (event) => {
    const name = event.target.closest("[data-subscription-name]");
    if (name) {
      event.preventDefault();
      beginSubscriptionRename(name);
      return;
    }
    const row = event.target.closest("[data-node-row]");
    if (!row || event.target.closest("button, select, input, textarea, a, [data-action]")) return;
    const node = appState.nodes.find((candidate) => candidate.id === row.dataset.nodeRow);
    if (!node) return;
    event.preventDefault();
    renderNodeDetails(node);
    openModal("node-details-modal");
  });
  document.addEventListener("click", (event) => {
    const confirmButton = event.target.closest("[data-confirm-result]");
    if (confirmButton && activeConfirmDialog) {
      event.preventDefault();
      closeConfirmDialog(confirmButton.dataset.confirmResult === "confirm");
      return;
    }
    const storeNodeOption = event.target.closest("[data-store-node-option]");
    if (storeNodeOption) {
      event.preventDefault();
      selectExtensionStoreProxyNode(storeNodeOption.dataset.nodeId || "");
      return;
    }
    const storeNodeGroup = event.target.closest("[data-store-node-group]");
    if (storeNodeGroup) {
      event.preventDefault();
      appState.extensionStore.routePicker.groupId = storeNodeGroup.dataset.storeNodeGroup || "direct";
      renderExtensionStoreProxySelectors();
      return;
    }
    const storeNodeTrigger = event.target.closest("[data-extension-store-proxy-node]");
    if (storeNodeTrigger) {
      event.preventDefault();
      const picker = storeNodeTrigger.closest("[data-store-node-picker]");
      const pickerId = picker?.dataset.storeNodePicker || "";
      appState.extensionStore.routePicker.open = appState.extensionStore.routePicker.open === pickerId ? "" : pickerId;
      renderExtensionStoreProxySelectors();
      if (appState.extensionStore.routePicker.open === pickerId) {
        $(`[data-store-node-search]`, picker)?.focus();
      }
      return;
    }
    if (appState.extensionStore.routePicker.open && !event.target.closest("[data-store-node-picker]")) {
      appState.extensionStore.routePicker.open = "";
      renderExtensionStoreProxySelectors();
    }
    const connectionOption = event.target.closest("[data-connection-option]");
    if (connectionOption) {
      event.preventDefault();
      const picker = connectionOption.closest("[data-connection-picker]");
      const profileId = picker?.dataset.profileId || "";
      const nodeId = connectionOption.dataset.nodeId || "";
      closeConnectionPicker();
      void switchProfileNode(profileId, nodeId);
      return;
    }
    const connectionTrigger = event.target.closest("[data-connection-trigger]");
    if (connectionTrigger) {
      event.preventDefault();
      const picker = connectionTrigger.closest("[data-connection-picker]");
      const profileId = picker?.dataset.profileId || "";
      if (appState.connectionPicker.profileId === profileId) closeConnectionPicker();
      else openConnectionPicker(profileId);
      return;
    }
    if (appState.connectionPicker.profileId && !event.target.closest("[data-connection-picker]")) closeConnectionPicker();
    const viewButton = event.target.closest("[data-view-target]");
    if (viewButton) {
      event.preventDefault();
      activateView(viewButton.dataset.viewTarget);
      if (viewButton.dataset.viewTarget === "agent") void openAgentConfig();
      return;
    }
    if (event.target.closest("a[href]")) return;
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.preventDefault();
      handleAction(actionButton.dataset.action, actionButton.dataset.id || "", actionButton.dataset.direction || "");
      return;
    }
    const closeButton = event.target.closest("[data-close-modal]");
    if (closeButton) closeModal(closeButton.dataset.closeModal);
  });
  document.addEventListener("input", (event) => {
    const search = event.target.closest?.("[data-store-node-search]");
    if (!search) return;
    const picker = search.closest("[data-store-node-picker]");
    const pickerId = picker?.dataset.storeNodePicker || "";
    appState.extensionStore.routePicker.filter = String(search.value || "");
    renderExtensionStoreProxySelectors();
    const nextSearch = pickerId ? $(`[data-store-node-picker="${CSS.escape(pickerId)}"] [data-store-node-search]`) : null;
    nextSearch?.focus();
    if (nextSearch) nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && appState.extensionStore.routePicker.open) {
      appState.extensionStore.routePicker.open = "";
      renderExtensionStoreProxySelectors();
      return;
    }
    if (event.key !== "Enter") return;
    if (event.target.closest?.("a[href]")) return;
    const storeCard = event.target.closest?.('[data-action="open-extension-store-detail"]');
    if (!storeCard) return;
    event.preventDefault();
    void openExtensionStoreDetail(storeCard.dataset.id || "");
  });

  $$(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
    if (event.target !== backdrop) return;
    if (backdrop.id === "confirm-modal") closeConfirmDialog(false);
    else {
      backdrop.hidden = true;
      if (backdrop.id === "extension-store-modal" || backdrop.id === "extension-discovery-modal") {
        appState.extensionStore.routePicker.open = "";
        renderExtensionStoreProxySelectors();
      }
    }
  }));

  $("#refresh-state")?.addEventListener("click", () => void refreshState(true));
  $("#profile-form")?.addEventListener("submit", (event) => void saveProfile(event));
  $("#import-form")?.addEventListener("submit", (event) => void importSubscription(event));
  $("#node-form")?.addEventListener("submit", (event) => void saveNode(event));
  $("#extension-form")?.addEventListener("submit", (event) => void saveExtension(event));
  $("#extension-store-form")?.addEventListener("submit", (event) => void installExtensionFromStore(event));
  $("#extension-store-search-button")?.addEventListener("click", () => void searchExtensionStore());
  $("#extension-store-search")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void searchExtensionStore();
    }
  });
  $("#password-entry-form")?.addEventListener("submit", (event) => void savePasswordEntry(event));
  $("#agent-form")?.addEventListener("submit", (event) => void saveAgentConfig(event));
  $("#test-agent-connection")?.addEventListener("click", () => void testAgentConnection());
  $("#manager-agent-model-refresh")?.addEventListener("click", () => {
    if (!cancelAgentModelFetch()) void fetchAgentModels(true);
  });
  $("#manager-agent-model")?.addEventListener("focus", () => void fetchAgentModels());
  $("#manager-agent-protocol")?.addEventListener("change", () => {
    agentModelFetchKey = "";
    if (document.activeElement === $("#manager-agent-model")) void fetchAgentModels(true);
  });
  $("#manager-agent-base-url")?.addEventListener("input", () => { agentModelFetchKey = ""; });
  $("#manager-agent-token")?.addEventListener("input", () => { agentModelFetchKey = ""; });
  $("#node-protocol")?.addEventListener("change", updateNodeTransportFields);
  $("#choose-engine")?.addEventListener("click", () => void chooseEngine());
  $("#choose-xray")?.addEventListener("click", () => void chooseXray());
  $("#choose-singbox")?.addEventListener("click", () => void chooseSingbox());
  $("#install-xray")?.addEventListener("click", () => void installCore("xray"));
  $("#install-singbox")?.addEventListener("click", () => void installCore("singbox"));
  $("#install-browser")?.addEventListener("click", () => void installBrowser());
  $("#choose-extension")?.addEventListener("click", () => void chooseExtension());
  $("#choose-unpacked-extension")?.addEventListener("click", () => void chooseUnpackedExtension());
  $("#save-settings")?.addEventListener("click", () => void saveSettings());
  $("#bookmark-import-refresh")?.addEventListener("click", () => void refreshBookmarkImportSources());
  $("#bookmark-import-files")?.addEventListener("click", () => void chooseBookmarkImportFiles());
  $("#bookmark-import-submit")?.addEventListener("click", () => void importBrowserBookmarks());
  $("#manager-agent-token-clear")?.addEventListener("click", () => {
    clearManagerAgentToken = true;
    const elements = agentFormElements();
    if (elements.token) elements.token.value = "";
    if (elements.tokenStatus) elements.tokenStatus.textContent = "保存后清除 Token";
    if (elements.tokenClear) elements.tokenClear.hidden = true;
  });
  $("#manager-jev-token-clear")?.addEventListener("click", () => {
    clearManagerJevToken = true;
    const elements = agentFormElements();
    if (elements.jevToken) elements.jevToken.value = "";
    if (elements.jevTokenStatus) elements.jevTokenStatus.textContent = "保存后清除 Key";
    if (elements.jevTokenClear) elements.jevTokenClear.hidden = true;
  });
  $("#manager-jev-provider")?.addEventListener("change", (event) => {
    const baseUrl = $("#manager-jev-base-url");
    if (!baseUrl) return;
    const value = String(event.target?.value || "");
    if (value === "custom" && baseUrl.value.trim() === "https://api.typesafe.ai") baseUrl.value = "";
    if (value === "typesafe" && !baseUrl.value.trim()) baseUrl.value = "https://api.typesafe.ai";
  });
  $("#save-theme")?.addEventListener("click", () => void saveSettings());
  $("#theme-preset")?.addEventListener("change", (event) => {
    const preset = THEME_PRESETS[event.target.value];
    if (!preset) {
      previewThemeFromForm();
      return;
    }
    const current = normalizeTheme(appState.settings.theme);
    appState.settings.theme = { ...current, ...preset, backgroundImage: current.backgroundImage };
    applyTheme(appState.settings.theme);
    renderThemeSettings();
  });
  [
    "theme-background", "theme-surface", "theme-surface-soft", "theme-primary", "theme-primary-hover",
    "theme-secondary", "theme-success", "theme-warning", "theme-danger", "theme-text", "theme-text-muted",
    "theme-text-faint", "theme-background-opacity", "theme-blur", "theme-radius",
  ].forEach((id) => $(`#${id}`)?.addEventListener("input", () => {
    const theme = themeFromForm();
    theme.preset = "custom";
    appState.settings.theme = theme;
    const preset = $("#theme-preset");
    if (preset) preset.value = "custom";
    applyTheme(theme);
    renderThemePreview(theme);
  }));
  $("#theme-reset")?.addEventListener("click", () => {
    appState.settings.theme = { ...DEFAULT_THEME };
    applyTheme(appState.settings.theme);
    renderThemeSettings();
  });
  $("#theme-clear-background")?.addEventListener("click", () => {
    appState.settings.theme = { ...normalizeTheme(appState.settings.theme), backgroundImage: "", preset: "custom" };
    applyTheme(appState.settings.theme);
    renderThemeSettings();
  });
  $("#theme-upload-button")?.addEventListener("click", () => $("#theme-background-file")?.click());
  $("#theme-background-file")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      showToast("请选择 5 MB 以内的图片文件", "warn");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      if (!result.startsWith("data:image/")) return;
      appState.settings.theme = { ...normalizeTheme(appState.settings.theme), backgroundImage: result, preset: "custom" };
      applyTheme(appState.settings.theme);
      renderThemeSettings();
    });
    reader.readAsDataURL(file);
  });
  document.addEventListener("input", (event) => {
    const connectionSearch = event.target.closest("[data-connection-search]");
    if (connectionSearch) {
      const picker = connectionSearch.closest("[data-connection-picker]");
      appState.connectionPicker.filter = connectionSearch.value;
      filterConnectionPicker(picker, connectionSearch.value);
      positionConnectionPicker(picker);
      return;
    }
    const subscriptionSearch = event.target.closest("#subscription-search");
    if (subscriptionSearch) {
      appState.subscriptionFilter = subscriptionSearch.value;
      renderSubscriptions();
    }
  });
  $("#profile-search")?.addEventListener("input", (event) => {
    appState.profileFilter = event.target.value;
    renderProfiles();
  });
  $("#node-search")?.addEventListener("input", (event) => {
    appState.nodeFilter = event.target.value;
    renderNodes();
  });
  $("#extension-search")?.addEventListener("input", (event) => {
    appState.extensionFilter = event.target.value;
    renderExtensions();
  });
  $("#password-search")?.addEventListener("input", (event) => {
    appState.passwordFilter = event.target.value;
    renderPasswordEntries();
  });
  $("#password-environment")?.addEventListener("change", (event) => {
    appState.passwordProfileId = event.target.value;
    appState.passwordFilter = "";
    $("#password-search").value = "";
    renderPasswordEntries();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && event.target.closest("[data-connection-search]")) {
      const picker = event.target.closest("[data-connection-picker]");
      const first = $(".connection-picker-option:not([hidden])", picker);
      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (appState.connectionPicker.profileId) {
      closeConnectionPicker();
      return;
    }
    if (activeConfirmDialog) {
      closeConfirmDialog(false);
      return;
    }
    $$(".modal-backdrop:not([hidden])").forEach((modal) => { modal.hidden = true; });
  });
  window.addEventListener("resize", () => positionConnectionPicker(activeConnectionPicker()));
  document.addEventListener("scroll", () => positionConnectionPicker(activeConnectionPicker()), true);
}

async function init() {
  attachDomEvents();
  attachApiEvents();
  renderAll();
  await refreshState();
}

if (typeof document !== "undefined") void init();
})();
