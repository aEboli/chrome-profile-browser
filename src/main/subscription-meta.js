'use strict';

const BYTE_UNITS = Object.freeze({
  b: 1,
  kb: 1024,
  kib: 1024,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  tb: 1024 ** 4,
  tib: 1024 ** 4,
  pb: 1024 ** 5,
  pib: 1024 ** 5,
});

const DURATION_UNITS = Object.freeze({
  s: 1,
  秒: 1,
  m: 60,
  min: 60,
  分: 60,
  h: 60 * 60,
  hr: 60 * 60,
  小时: 60 * 60,
  时: 60 * 60,
  d: 24 * 60 * 60,
  day: 24 * 60 * 60,
  days: 24 * 60 * 60,
  天: 24 * 60 * 60,
  日: 24 * 60 * 60,
  hours: 60 * 60,
  minutes: 60,
  seconds: 1,
});

const META_FIELDS = Object.freeze([
  'uploadBytes',
  'downloadBytes',
  'totalBytes',
  'remainingBytes',
  'expiresAt',
  'resetAt',
  'resetAfterSeconds',
]);

function finiteNumber(value) {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function parseBytes(value, unit = 'b') {
  const number = finiteNumber(value);
  if (number === null || number < 0) return null;
  const factor = BYTE_UNITS[String(unit || 'b').toLowerCase()] || 1;
  const bytes = number * factor;
  return Number.isFinite(bytes) ? Math.round(bytes) : null;
}

function parseByteToken(value, defaultUnit = 'b') {
  const match = /^\s*([\d,.]+)\s*([kmgtpe]?i?b)?\s*$/iu.exec(String(value ?? ''));
  return match ? parseBytes(match[1], match[2] || defaultUnit) : null;
}

function parseEpoch(value) {
  const number = finiteNumber(value);
  if (number === null || number <= 0) return '';
  const milliseconds = number < 100000000000 ? number * 1000 : number;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function parseDateValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{10,13}$/.test(text)) return parseEpoch(text);
  const normalized = text
    .replace(/[年/.]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function parseDuration(value, unit = 's') {
  const number = finiteNumber(value);
  if (number === null || number < 0) return null;
  const factor = DURATION_UNITS[String(unit || 's').toLowerCase()] || 1;
  const seconds = number * factor;
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

function emptyMetadata() {
  return {
    uploadBytes: null,
    downloadBytes: null,
    totalBytes: null,
    remainingBytes: null,
    expiresAt: '',
    resetAt: '',
    resetAfterSeconds: null,
    messages: [],
  };
}

function headerValue(headers, names) {
  if (!headers) return '';
  const candidates = names.map((name) => String(name).toLowerCase());
  if (typeof headers.get === 'function') {
    for (const name of candidates) {
      const value = headers.get(name);
      if (value) return String(value);
    }
    return '';
  }
  for (const [key, value] of Object.entries(headers)) {
    if (candidates.includes(String(key).toLowerCase()) && value !== undefined && value !== null) return String(value);
  }
  return '';
}

function parseResetValue(value, key, now) {
  const number = finiteNumber(value);
  if (number === null) {
    const resetAt = parseDateValue(value);
    return resetAt ? { resetAt } : {};
  }
  if (number <= 0) return {};
  const normalizedKey = String(key || '').toLowerCase();
  if (normalizedKey.includes('at') || normalizedKey.includes('time') || number >= 1000000000) {
    const resetAt = parseEpoch(number);
    return resetAt ? { resetAt } : {};
  }
  const resetAfterSeconds = Math.round(number);
  const resetAt = new Date(now + resetAfterSeconds * 1000).toISOString();
  return { resetAfterSeconds, resetAt };
}

/** Parse the widely used `subscription-userinfo` response header. */
function parseSubscriptionUserinfo(value, now = Date.now()) {
  const metadata = emptyMetadata();
  const text = String(value || '').trim();
  if (!text) return metadata;
  for (const segment of text.split(/;\s*|,\s*(?=[a-z][a-z0-9_-]*\s*=)/iu)) {
    const match = /^\s*([a-z][a-z0-9_-]*)\s*=\s*([^;]+)\s*$/i.exec(segment);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const rawValue = match[2].trim();
    if (key === 'upload' || key === 'uploaded') metadata.uploadBytes = parseByteToken(rawValue);
    else if (key === 'download' || key === 'downloaded') metadata.downloadBytes = parseByteToken(rawValue);
    else if (key === 'total' || key === 'quota' || key === 'limit') metadata.totalBytes = parseByteToken(rawValue);
    else if (key === 'expire' || key === 'expires' || key === 'expiration') metadata.expiresAt = parseEpoch(rawValue);
    else if (key === 'reset' || key === 'reset_at' || key === 'reset-at' || key === 'reset_time' || key === 'reset-time' || key === 'next_reset' || key === 'next-reset') {
      Object.assign(metadata, parseResetValue(rawValue, key, now));
    } else if (key === 'reset_after' || key === 'reset-after' || key === 'reset_seconds' || key === 'reset-seconds') {
      const resetAfterSeconds = parseDuration(rawValue, 's');
      if (resetAfterSeconds !== null) {
        metadata.resetAfterSeconds = resetAfterSeconds;
        metadata.resetAt = new Date(now + resetAfterSeconds * 1000).toISOString();
      }
    }
  }
  return metadata;
}

function parseSubscriptionHeaders(headers, now = Date.now()) {
  const metadata = parseSubscriptionUserinfo(
    headerValue(headers, ['subscription-userinfo', 'subscription_userinfo', 'x-subscription-userinfo']),
    now,
  );
  const auxiliary = parseSubscriptionUserinfo(
    headerValue(headers, ['subscription-info', 'x-subscription-info']),
    now,
  );
  for (const field of META_FIELDS) {
    if (metadata[field] === null || metadata[field] === '') metadata[field] = auxiliary[field];
  }
  const expire = headerValue(headers, ['subscription-expire', 'subscription-expires', 'x-subscription-expire']);
  if (expire && !metadata.expiresAt) metadata.expiresAt = parseDateValue(expire);
  const reset = headerValue(headers, ['subscription-reset', 'subscription-reset-at', 'x-subscription-reset']);
  if (reset && !metadata.resetAt && metadata.resetAfterSeconds === null) Object.assign(metadata, parseResetValue(reset, 'reset', now));
  return metadata;
}

function parseInfoNode(node, now = Date.now()) {
  const name = String(node?.name || '').trim();
  if (!name) return null;
  const text = name
    .replace(/^\s*\[[^\]]+\]\s*/u, '')
    .replace(/^\s*(?:anytls|ss|http|https|socks5?)(?:\s*[-:：|]\s*|\s+)/iu, '')
    .trim();
  if (!text) return null;

  const metadata = emptyMetadata();
  let matched = false;
  const knownInfoLabel = /^(?:剩余流量|流量余额|流量剩余|距离?下次重置|下次重置|重置时间|套餐到期|到期时间|有效期至|traffic|remaining\s*traffic|reset|expire|expiration)\s*[:：=]/iu.test(text);
  if (knownInfoLabel) matched = true;
  const remaining = /(?:剩余流量|流量余额|流量剩余|traffic\s*(?:remaining|left)|remaining\s*traffic)\s*[:：=]?\s*([\d,.]+)\s*([kmgtpe]?i?b)?/iu.exec(text);
  if (remaining) {
    const remainingBytes = parseByteToken(`${remaining[1]}${remaining[2] || ''}`);
    if (remainingBytes !== null) metadata.remainingBytes = remainingBytes;
    matched = true;
  }

  const resetDate = /(?:下次重置时间|重置时间|下次重置|next\s*reset)\s*[:：=]?\s*((?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:[ t]\d{1,2}(?::\d{2}){0,2})?)|\d{10,13})/iu.exec(text);
  if (resetDate) {
    const resetAt = parseDateValue(resetDate[1]);
    if (resetAt) metadata.resetAt = resetAt;
    matched = true;
  }

  const reset = /(?:距离?下次重置剩余|距离?下次重置|下次重置剩余|重置剩余|reset\s*(?:in|after|left)?)\s*[:：=]?\s*([\d,.]+)\s*(天|日|小时|时|分钟|分|秒|days?|hours?|minutes?|seconds?|d|day|h|hr|m|min|s)?/iu.exec(text);
  if (reset) {
    const resetAfterSeconds = parseDuration(reset[1], reset[2] || 's');
    if (resetAfterSeconds !== null) {
      metadata.resetAfterSeconds = resetAfterSeconds;
      metadata.resetAt = new Date(now + resetAfterSeconds * 1000).toISOString();
    }
    matched = true;
  }

  const expires = /(?:套餐到期|到期时间|有效期至|expire(?:s|d)?|expiration)\s*[:：=]?\s*((?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:[ t]\d{1,2}(?::\d{2}){0,2})?)|\d{10,13})/iu.exec(text);
  if (expires) {
    const expiresAt = parseDateValue(expires[1]);
    if (expiresAt) metadata.expiresAt = expiresAt;
    matched = true;
  }

  const message = /^(?:不再支持|请更换|更换客户端|支持的客户端|客户端详情|使用文档|官网|公告|通知|提示|warning|notice|support(?:ed)?\s*clients?|documentation)(?:\b|[：:\s]|[\u4e00-\u9fff])/iu.test(text);
  const announcement = /^(?:如更新|更新未有|无可用节点|没有可用节点|暂无可用节点)/u.test(text);
  if (matched || message || announcement) {
    if (message || announcement) metadata.messages.push(text.slice(0, 240));
    return metadata;
  }
  return null;
}

function isSubscriptionInfoNode(node) {
  return Boolean(parseInfoNode(node));
}

function mergeMetadata(headerMetadata, nodeMetadata, now = Date.now()) {
  const result = emptyMetadata();
  const sources = [nodeMetadata || emptyMetadata(), headerMetadata || emptyMetadata()];
  for (const source of sources) {
    for (const field of META_FIELDS) {
      if (source[field] !== null && source[field] !== undefined && source[field] !== '') result[field] = source[field];
    }
    for (const message of Array.isArray(source.messages) ? source.messages : []) {
      if (!result.messages.includes(message)) result.messages.push(message);
    }
  }
  const headerHasUsage = headerMetadata
    && headerMetadata.remainingBytes === null
    && headerMetadata.totalBytes !== null
    && headerMetadata.totalBytes > 0
    && (headerMetadata.uploadBytes !== null || headerMetadata.downloadBytes !== null);
  if (headerHasUsage) result.remainingBytes = null;
  if (result.remainingBytes === null && result.totalBytes !== null && result.totalBytes > 0) {
    const used = (result.uploadBytes || 0) + (result.downloadBytes || 0);
    result.remainingBytes = Math.max(0, result.totalBytes - used);
  }
  if (headerMetadata?.resetAt && headerMetadata.resetAfterSeconds === null) result.resetAfterSeconds = null;
  if (!result.resetAt && result.resetAfterSeconds !== null) result.resetAt = new Date(now + result.resetAfterSeconds * 1000).toISOString();
  return result;
}

function hasMetadata(metadata) {
  return Boolean(metadata && (
    META_FIELDS.some((field) => metadata[field] !== null && metadata[field] !== undefined && metadata[field] !== '')
    || (Array.isArray(metadata.messages) && metadata.messages.length)
  ));
}

function extractSubscriptionMetadata({ headers, nodes = [], now = Date.now() } = {}) {
  const headerMetadata = parseSubscriptionHeaders(headers, now);
  const nodeMetadata = emptyMetadata();
  const infoNodes = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const parsed = parseInfoNode(node, now);
    if (!parsed) continue;
    infoNodes.push(node);
    for (const field of META_FIELDS) {
      if (parsed[field] !== null && parsed[field] !== undefined && parsed[field] !== '') nodeMetadata[field] = parsed[field];
    }
    for (const message of parsed.messages) {
      if (!nodeMetadata.messages.includes(message)) nodeMetadata.messages.push(message);
    }
  }
  const metadata = mergeMetadata(headerMetadata, nodeMetadata, now);
  return { metadata: hasMetadata(metadata) ? metadata : null, infoNodes };
}

function sanitizeSubscriptionMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const metadata = emptyMetadata();
  for (const field of ['uploadBytes', 'downloadBytes', 'totalBytes', 'remainingBytes', 'resetAfterSeconds']) {
    const number = finiteNumber(value[field]);
    if (number !== null && number >= 0) metadata[field] = Math.round(number);
  }
  for (const field of ['expiresAt', 'resetAt']) {
    const text = String(value[field] || '').trim();
    if (text) metadata[field] = text;
  }
  metadata.messages = [...new Set((Array.isArray(value.messages) ? value.messages : []).map((item) => String(item).trim()).filter(Boolean))].slice(0, 8);
  return hasMetadata(metadata) ? metadata : null;
}

module.exports = {
  extractSubscriptionMetadata,
  isSubscriptionInfoNode,
  parseInfoNode,
  parseSubscriptionHeaders,
  parseSubscriptionUserinfo,
  sanitizeSubscriptionMetadata,
};
