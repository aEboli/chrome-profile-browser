'use strict';

const net = require('node:net');

const DEFAULT_ENDPOINT = 'https://ipwho.is/';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 64 * 1024;

function normalizeIp(value) {
  let candidate = String(value ?? '').trim();
  const bracketedAuthority = /^\[([^\]]+)\]:\d+$/.exec(candidate);
  if (bracketedAuthority) candidate = bracketedAuthority[1];
  if (candidate.startsWith('[') && candidate.endsWith(']')) candidate = candidate.slice(1, -1);
  if (net.isIP(candidate) === 0 && /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(':'));
  }
  const zoneIndex = candidate.indexOf('%');
  if (zoneIndex >= 0) candidate = candidate.slice(0, zoneIndex);
  if (candidate.toLowerCase().startsWith('::ffff:')) candidate = candidate.slice(7);
  return candidate;
}

function isPublicIp(value) {
  const ip = normalizeIp(value);
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && b === 18) return false;
    if (a === 198 && b === 19) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (version !== 6) return false;
  const lower = ip.toLowerCase();
  return lower !== '::1'
    && !lower.startsWith('::')
    && !/^f[cd]/.test(lower)
    && !/^fe[89ab]/.test(lower)
    && !lower.startsWith('ff')
    && !lower.startsWith('2001:db8:')
    && !lower.startsWith('2001:10:');
}

function timeoutValue(value) {
  const timeout = Number(value ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 30000) : DEFAULT_TIMEOUT_MS;
}

function endpointForIp(ip, endpoint = DEFAULT_ENDPOINT) {
  const base = String(endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(ip)}`;
}

async function responseJson(response) {
  if (!response || response.ok === false) return null;
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('IP 地理查询响应过大');
    try { return JSON.parse(text); } catch { return null; }
  }
  if (typeof response.json === 'function') return response.json();
  return null;
}

async function lookupIpCountry(value, options = {}) {
  const ip = normalizeIp(value);
  if (!isPublicIp(ip)) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;
  const controller = new AbortController();
  const timeoutMs = timeoutValue(options.timeoutMs);
  let rejectTimeout;
  const timeoutPromise = new Promise((_, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectTimeout(new Error('IP 地理查询超时'));
  }, timeoutMs);
  try {
    const response = await Promise.race([
      fetchImpl(endpointForIp(ip, options.endpoint), {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      }),
      timeoutPromise,
    ]);
    const payload = await responseJson(response);
    if (!payload || payload.success === false) return null;
    const countryCode = String(payload.country_code || payload.countryCode || '').trim().toUpperCase();
    const country = String(payload.country || payload.countryName || '').trim();
    if (!countryCode && !country) return null;
    return { ip, country, countryCode };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_ENDPOINT,
  endpointForIp,
  isPublicIp,
  lookupIpCountry,
  normalizeIp,
};
