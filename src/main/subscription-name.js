'use strict';

const { isSubscriptionInfoNode } = require('./subscription-meta');

const MAX_SUBSCRIPTION_NAME_LENGTH = 120;
const DEFAULT_SUBSCRIPTION_NAME = '在线订阅';
const ACCOUNT_TAG_GLYPHS = Object.freeze([
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
]);

const URL_NAME_KEYS = Object.freeze([
  'name', 'title', 'profile', 'profile_name', 'profile-name', 'remark', 'remarks', 'label',
  'account', 'account_name', 'account-name', 'username', 'user',
]);

const HEADER_NAME_KEYS = Object.freeze([
  'subscription-name', 'subscription-title', 'profile-name', 'profile-title',
  'x-subscription-name', 'x-subscription-title', 'x-profile-name', 'x-profile-title',
]);

const GENERIC_PATH_SEGMENTS = new Set([
  'access', 'account', 'accounts', 'api', 'auth', 'client', 'clients', 'clash', 'config',
  'download', 'feed', 'id', 'key', 'keys', 'link', 'list', 'name', 'profile', 'profiles',
  'sub', 'subscribe', 'subscription', 'subscriptions', 'token', 'user', 'users', 'uuid',
  'v1', 'v2', 'yaml', 'yml',
]);

function normalizeSubscriptionName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_SUBSCRIPTION_NAME_LENGTH);
}

function decodeCandidate(value) {
  let result = String(value ?? '').trim();
  if (!result) return '';
  try { result = decodeURIComponent(result); } catch { /* Keep the readable raw value. */ }
  result = result.replace(/\.(?:txt|yaml|yml|json|conf|ini)$/i, '').trim();
  if (looksOpaque(result)) return '';
  return result
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/|]+/g, ' ')
    .replace(/[\s_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUBSCRIPTION_NAME_LENGTH);
}

function looksOpaque(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return true;
  if (/^[0-9a-f]{16,}$/i.test(candidate)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(candidate)) return true;
  if (/^[A-Za-z0-9_-]{20,}$/.test(candidate) && !/[\u4e00-\u9fff\u3400-\u4dbf\p{Script=Han}]/u.test(candidate)) return true;
  return false;
}

function readableCandidate(value, { pathSegment = false } = {}) {
  const raw = String(value ?? '').trim();
  const candidate = decodeCandidate(value);
  if (!candidate || /^https?:\/\//i.test(candidate) || looksOpaque(candidate)) return '';
  if (pathSegment && GENERIC_PATH_SEGMENTS.has(candidate.toLowerCase())) return '';
  if (pathSegment && /^[A-Za-z0-9]{8,}$/.test(raw)) return '';
  if (/^\d{6,}$/.test(candidate)) return '';
  if (/^(?:剩余流量|流量余额|流量剩余|距离?下次重置|下次重置|重置时间|套餐到期|到期时间|有效期至?|官网|公告|通知|提示|traffic|remaining\s*traffic|reset|expire|expiration)(?:\b|[\s:：=]|$)/iu.test(candidate)) return '';
  if (!/[\p{L}\p{N}]/u.test(candidate)) return '';
  return candidate;
}

function headerValue(headers, key) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(key) || '').trim();
  if (typeof headers === 'object') {
    const found = Object.keys(headers).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    return found ? String(headers[found] || '').trim() : '';
  }
  return '';
}

function contentDispositionName(value) {
  const source = String(value || '');
  const encoded = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(source)?.[1];
  const plain = /filename\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i.exec(source);
  return readableCandidate(encoded || plain?.[1] || plain?.[2] || plain?.[3]);
}

function deriveSubscriptionHeaderName(headers) {
  for (const key of HEADER_NAME_KEYS) {
    const candidate = readableCandidate(headerValue(headers, key));
    if (candidate) return candidate;
  }
  return contentDispositionName(headerValue(headers, 'content-disposition'));
}

function deriveSubscriptionUrlName(value) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) return '';
  let parsed;
  try { parsed = new URL(source); } catch { return ''; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';

  for (const key of URL_NAME_KEYS) {
    const candidate = readableCandidate(parsed.searchParams.get(key));
    if (candidate) return candidate;
  }
  const fragment = readableCandidate(parsed.hash.slice(1));
  if (fragment) return fragment;

  const segments = parsed.pathname.split('/').map((item) => item.trim()).filter(Boolean);
  for (const segment of segments.reverse()) {
    const candidate = readableCandidate(segment, { pathSegment: true });
    if (candidate) return candidate;
  }
  return '';
}

function deriveSubscriptionName(value) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) return '';
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
    return url.hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

function genericNodeName(candidate, node) {
  const value = String(candidate || '').trim();
  if (!value) return true;
  const protocol = String(node?.protocol || '').trim().toLowerCase();
  const host = String(node?.host || node?.server || node?.address || '').trim();
  const port = String(node?.port || '').trim();
  if (host && (value === host || value === `${host}:${port}` || value === `${protocol}://${host}:${port}`)) return true;
  const lowerValue = value.toLowerCase();
  const lowerProtocol = protocol.toLowerCase();
  const hasProtocolPrefix = lowerProtocol
    && lowerValue.startsWith(lowerProtocol)
    && /[\s:/]/.test(value.charAt(lowerProtocol.length));
  if (hasProtocolPrefix && host && lowerValue.includes(host.toLowerCase())) return true;
  return /^(?:节点|node|proxy|server)(?:\s*[-_#]?\s*\d*)?$/i.test(value);
}

function cleanNodeLabel(value) {
  const cleaned = String(value ?? '')
    .replace(/^\s*\[(?:anytls|hysteria2?|http|socks5?|ss|trojan|vless|vmess)\]\s*/i, '')
    .replace(/^\s*\((?:anytls|hysteria2?|http|socks5?|ss|trojan|vless|vmess)\)\s*/i, '')
    .replace(/^\s*(?:anytls|hysteria2?|http|socks5?|ss|trojan|vless|vmess)\s*[:：|]\s*/i, '')
    .trim();
  return readableCandidate(cleaned);
}

function deriveNodeName(nodes) {
  const candidates = (Array.isArray(nodes) ? nodes : [])
    .filter((node) => node && typeof node === 'object' && !isSubscriptionInfoNode(node));
  const labels = [];
  for (const node of candidates) {
    for (const value of [node.name, node.title, node.remark, node.tag]) {
      const candidate = cleanNodeLabel(value);
      if (candidate && !genericNodeName(candidate, node)) labels.push(candidate);
    }
  }
  const suffixes = labels
    .map((label) => /\s+(?:[-|·•])\s+([^\-|·•]{2,})$/u.exec(label)?.[1]?.trim())
    .filter(Boolean);
  if (suffixes.length >= 2 && new Set(suffixes).size === 1) return suffixes[0];
  if (labels.length) return labels[0];
  for (const node of candidates) {
    const host = readableCandidate(node.host || node.server || node.address);
    if (host) return host;
  }
  return '';
}

function accountTagNumber(value) {
  const candidate = String(value || '').trim();
  const glyphIndex = ACCOUNT_TAG_GLYPHS.indexOf(candidate);
  if (glyphIndex >= 0) return glyphIndex + 1;
  const numeric = /^#?(\d+)$/.exec(candidate);
  return numeric ? Number(numeric[1]) : 0;
}

function formatAccountTag(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return '';
  return ACCOUNT_TAG_GLYPHS[number - 1] || `#${number}`;
}

function ensureSubscriptionAccountTags(items) {
  const subscriptions = Array.isArray(items) ? items : [];
  const reserved = new Set(subscriptions
    .map((item) => accountTagNumber(item?.accountTag))
    .filter((number) => Number.isSafeInteger(number) && number > 0));
  const used = new Set();
  for (const item of subscriptions) {
    const tag = String(item?.accountTag || '').trim();
    const number = accountTagNumber(tag);
    if (Number.isSafeInteger(number) && number > 0 && !used.has(number)) {
      item.accountTag = formatAccountTag(number);
      used.add(number);
    } else if (item && typeof item === 'object') {
      let next = 1;
      while (reserved.has(next)) next += 1;
      item.accountTag = formatAccountTag(next);
      reserved.add(next);
      used.add(next);
    }
  }
  return subscriptions;
}

function nextSubscriptionAccountTag(items) {
  const used = new Set((Array.isArray(items) ? items : [])
    .map((item) => accountTagNumber(item?.accountTag))
    .filter((number) => number > 0));
  let next = 1;
  while (used.has(next)) next += 1;
  return formatAccountTag(next);
}

function resolveSubscriptionNameDetails({ name, existingName, existingNameSource, url, headers, nodes } = {}) {
  const requested = normalizeSubscriptionName(name);
  if (requested) return { name: requested, source: 'custom' };

  const previous = normalizeSubscriptionName(existingName);
  const source = String(existingNameSource || '').trim().toLowerCase();
  const hostname = deriveSubscriptionName(url);
  const isLegacyAutomaticName = !previous
    || previous === DEFAULT_SUBSCRIPTION_NAME
    || /^订阅\d+$/u.test(previous)
    || previous === hostname;
  if (previous && (source === 'custom' || (!source && !isLegacyAutomaticName))) {
    return { name: previous, source: 'custom' };
  }

  const provider = deriveSubscriptionHeaderName(headers) || deriveSubscriptionUrlName(url);
  if (provider) return { name: provider, source: 'provider' };
  const node = deriveNodeName(nodes);
  if (node) return { name: node, source: 'node' };
  if (hostname) return { name: hostname, source: 'hostname' };
  return { name: previous || DEFAULT_SUBSCRIPTION_NAME, source: source || 'default' };
}

function resolveSubscriptionName(options = {}) {
  return resolveSubscriptionNameDetails(options).name;
}

module.exports = {
  accountTagNumber,
  deriveNodeName,
  deriveSubscriptionHeaderName,
  deriveSubscriptionUrlName,
  DEFAULT_SUBSCRIPTION_NAME,
  ensureSubscriptionAccountTags,
  formatAccountTag,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  nextSubscriptionAccountTag,
  deriveSubscriptionName,
  normalizeSubscriptionName,
  resolveSubscriptionName,
  resolveSubscriptionNameDetails,
};
