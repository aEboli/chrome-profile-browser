'use strict';

const DEFAULT_JEV_SETTINGS = Object.freeze({
  provider: 'typesafe',
  baseUrl: 'https://api.typesafe.ai',
  model: 'jev-latest',
});

const PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'typesafe',
    label: 'TypeSafe 官方',
    defaultBaseUrl: 'https://api.typesafe.ai',
    defaultPath: '/v1/systemone',
    modelsPath: '/v1/models',
  }),
  Object.freeze({
    id: 'custom',
    label: '自定义 JEV 接口',
    defaultBaseUrl: '',
    defaultPath: '/v1/systemone',
    modelsPath: '/v1/models',
  }),
]);

function providerDefinition(value) {
  const source = String(value || '').trim().toLowerCase();
  const aliases = {
    official: 'typesafe',
    'type-safe': 'typesafe',
    'type-safe-ai': 'typesafe',
    typesafe: 'typesafe',
    custom: 'custom',
    openrouter: 'custom',
  };
  const id = aliases[source] || source;
  return PROVIDERS.find((item) => item.id === id) || PROVIDERS[0];
}

function normalizeProvider(value) {
  return providerDefinition(value).id;
}

function stripKnownEndpoint(pathname) {
  let path = String(pathname || '').replace(/\/+$/, '');
  for (const suffix of ['/v1/systemone', '/v1/models', '/systemone', '/models', '/v1']) {
    if (path.toLowerCase().endsWith(suffix.toLowerCase())) {
      path = path.slice(0, -suffix.length).replace(/\/+$/, '');
      break;
    }
  }
  return path;
}

function normalizeBaseUrl(value, provider = DEFAULT_JEV_SETTINGS.provider) {
  const definition = providerDefinition(provider);
  const raw = String(value || '').trim();
  if (!raw) return definition.defaultBaseUrl;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('JEV 接口地址必须是有效 URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('JEV 接口地址只支持 HTTP 或 HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new Error('JEV 接口地址不得包含账号或密码');
  }
  const pathname = stripKnownEndpoint(parsed.pathname);
  return `${parsed.origin}${pathname}`;
}

function endpointFor(provider, baseUrl) {
  const definition = providerDefinition(provider);
  const root = normalizeBaseUrl(baseUrl, definition.id).replace(/\/+$/, '');
  return `${root}${definition.defaultPath}`;
}

function modelsEndpointFor(provider, baseUrl) {
  const definition = providerDefinition(provider);
  const root = normalizeBaseUrl(baseUrl, definition.id).replace(/\/+$/, '');
  return `${root}${definition.modelsPath}`;
}

function authHeaders(token) {
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (String(token || '')) headers.authorization = `Bearer ${String(token)}`;
  return headers;
}

function buildJevRequest(input = {}) {
  const provider = normalizeProvider(input.provider);
  const model = String(input.model || DEFAULT_JEV_SETTINGS.model).trim();
  if (!model) throw new Error('尚未填写 JEV 模型');
  const baseUrl = normalizeBaseUrl(input.baseUrl, provider);
  if (!baseUrl) throw new Error('尚未填写 JEV 接口地址');
  const questions = input.questions && typeof input.questions === 'object' && !Array.isArray(input.questions)
    ? input.questions
    : {};
  if (!Object.keys(questions).length) throw new Error('JEV 判断问题不能为空');
  if (input.state === undefined || input.state === null || input.state === '') {
    throw new Error('JEV 判断状态不能为空');
  }
  return {
    provider,
    url: endpointFor(provider, baseUrl),
    headers: authHeaders(input.token),
    body: { state: input.state, model, questions },
  };
}

function parseJevResponse(payload) {
  const root = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
  const answers = root.answers && typeof root.answers === 'object' && !Array.isArray(root.answers)
    ? root.answers
    : {};
  return {
    model: String(root.model || ''),
    answers,
    usage: root.usage && typeof root.usage === 'object' ? root.usage : null,
  };
}

function extractErrorMessage(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.slice(0, 2000);
  if (typeof payload === 'object') {
    if (typeof payload.error === 'string') return payload.error.slice(0, 2000);
    if (payload.error && typeof payload.error === 'object' && payload.error.message) return String(payload.error.message).slice(0, 2000);
    if (payload.message) return String(payload.message).slice(0, 2000);
    if (payload.detail) return String(payload.detail).slice(0, 2000);
  }
  return '';
}

module.exports = {
  DEFAULT_JEV_SETTINGS,
  PROVIDERS,
  authHeaders,
  buildJevRequest,
  endpointFor,
  extractErrorMessage,
  modelsEndpointFor,
  normalizeBaseUrl,
  normalizeProvider,
  parseJevResponse,
};
