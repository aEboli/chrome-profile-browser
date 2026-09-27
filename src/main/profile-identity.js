const crypto = require('node:crypto');

const TEST_IDENTITY_HEADER = 'X-CPB-Test-Identity';
const MAX_TEST_IDENTITY_ORIGINS = 32;
const MAX_TEST_IDENTITY_ORIGIN_LENGTH = 256;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createTestIdentityId() {
  return crypto.randomUUID();
}

function normalizeTestIdentityId(value) {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return UUID_PATTERN.test(candidate) ? candidate : '';
}

function originParts(value) {
  if (typeof value !== 'string') return [];
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeTestIdentityOrigin(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return '';
  if (candidate.length > MAX_TEST_IDENTITY_ORIGIN_LENGTH) {
    throw new Error('测试站点来源过长');
  }
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`测试站点来源无效：${candidate}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash) {
    throw new Error(`测试站点来源必须是完整的 HTTP(S) 来源：${candidate}`);
  }
  return parsed.origin;
}

function normalizeTestIdentityOrigins(value, options = {}) {
  const strict = Boolean(options.strict);
  const values = Array.isArray(value)
    ? value.flatMap((item) => typeof item === 'string' ? originParts(item) : [])
    : originParts(value);
  if (strict && values.length > MAX_TEST_IDENTITY_ORIGINS) {
    throw new Error(`测试站点来源最多支持 ${MAX_TEST_IDENTITY_ORIGINS} 个`);
  }
  const origins = [];
  for (const item of values.slice(0, MAX_TEST_IDENTITY_ORIGINS)) {
    try {
      const origin = normalizeTestIdentityOrigin(item);
      if (origin && !origins.includes(origin)) origins.push(origin);
    } catch (error) {
      if (strict) throw error;
    }
  }
  return origins;
}

function ensureTestIdentity(profile) {
  const current = profile && typeof profile === 'object' ? profile : {};
  return {
    ...current,
    testIdentityId: normalizeTestIdentityId(current.testIdentityId) || createTestIdentityId(),
    testIdentityOrigins: normalizeTestIdentityOrigins(current.testIdentityOrigins),
  };
}

function isAllowedTestIdentityOrigin(value, origins) {
  let origin;
  try {
    origin = new URL(value).origin;
  } catch {
    return false;
  }
  return normalizeTestIdentityOrigins(origins).includes(origin);
}

function addTestIdentityHeader(requestHeaders, url, identityId, origins) {
  const headers = { ...(requestHeaders || {}) };
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === TEST_IDENTITY_HEADER.toLowerCase()) delete headers[key];
  }
  const normalizedId = normalizeTestIdentityId(identityId);
  if (!normalizedId || !isAllowedTestIdentityOrigin(url, origins)) return headers;
  headers[TEST_IDENTITY_HEADER] = normalizedId;
  return headers;
}

function createTestIdentityRequestHandler({ identityId, origins }) {
  return (details, callback) => {
    const isPreflight = details?.method?.toUpperCase() === 'OPTIONS';
    const requestHeaders = addTestIdentityHeader(
      details?.requestHeaders,
      details?.url,
      isPreflight ? '' : identityId,
      isPreflight ? [] : origins,
    );
    callback({ requestHeaders });
  };
}

module.exports = {
  MAX_TEST_IDENTITY_ORIGINS,
  TEST_IDENTITY_HEADER,
  addTestIdentityHeader,
  createTestIdentityId,
  createTestIdentityRequestHandler,
  ensureTestIdentity,
  isAllowedTestIdentityOrigin,
  normalizeTestIdentityId,
  normalizeTestIdentityOrigin,
  normalizeTestIdentityOrigins,
};
