'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const YAML = require('yaml');

// Electron accepts HTTP and SOCKS5 proxy endpoints.  Other subscription
// protocols are intentionally reported to the caller instead of being
// translated or executed by this application.
const SUPPORTED_PROTOCOLS = new Set(['http', 'https', 'socks', 'socks5', 'socks5h']);
const DEFAULT_PORTS = {
  http: 80,
  https: 443,
  socks: 1080,
  socks5: 1080,
  socks5h: 1080,
};
const REDACTED_DIAGNOSTIC = '[已隐藏]';

function asText(value) {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8');
  throw new TypeError('订阅内容必须是字符串或字节数组');
}

function decodeComponent(value) {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function normalizeHost(value) {
  let host = String(value ?? '').trim();
  if (!host) return '';
  if (/[\u0000-\u0020\u007f]/.test(host)) return '';
  // URL.hostname retains brackets for IPv6 literals in Node.js.
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (net.isIP(host)) return host;
  if (host.length > 253 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(host)) return '';
  return host;
}

/**
 * Keep only the scheme and authority when retaining a subscription source.
 * Tokens are commonly placed in query strings, fragments, or path segments;
 * retaining the path would make it too easy to persist an access token.
 * The same helper is used for parser diagnostics so malformed URI lines do
 * not echo credentials back to the renderer.
 */
function sanitizeSource(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.host) {
      url.username = '';
      url.password = '';
      url.pathname = '/';
      url.search = '';
      url.hash = '';
      return url.toString();
    }
    // Schemes without an authority (for example data: or mailto:) can still
    // carry secrets in their path; retain only the scheme marker.
    return url.protocol;
  } catch {
    // Fall through to a conservative redaction for malformed URI text.
  }

  const uriPrefix = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#\s]*)/i.exec(text);
  if (uriPrefix) {
    // The URL is malformed, so even the authority may contain an encoded
    // credential fragment. Do not echo any of it in diagnostics.
    return `${uriPrefix[1]}[redacted]/`;
  }
  return text.replace(/[?#].*$/, '').slice(0, 240);
}

/**
 * Resolve one subscription redirect without allowing a scheme escape or an
 * HTTPS-to-HTTP downgrade.  Keeping this pure makes the redirect policy
 * independently testable from the network fetch loop in main.js.
 */
function resolveSubscriptionRedirect(current, location) {
  let from;
  let target;
  try {
    from = current instanceof URL ? current : new URL(String(current));
    target = new URL(String(location), from);
  } catch {
    throw new Error('订阅重定向地址无效');
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('订阅重定向必须使用 HTTP 或 HTTPS');
  }
  if (from.protocol === 'https:' && target.protocol !== 'https:') {
    throw new Error('禁止订阅从 HTTPS 降级到 HTTP');
  }
  if (target.username || target.password) {
    throw new Error('订阅重定向地址不得包含账号密码');
  }
  return target;
}

function parsePort(value, fallback) {
  const text = value === undefined || value === null || value === '' ? '' : String(value).trim();
  const port = text === '' ? fallback : Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function sourceInfo(source) {
  if (typeof source === 'string') return { source: sanitizeSource(source) };
  if (source && typeof source === 'object') {
    const result = {};
    if (source.source !== undefined) result.source = sanitizeSource(source.source);
    if (source.line !== undefined) result.line = Number(source.line);
    return result;
  }
  return {};
}

function hashId(parts, prefix = 'proxy') {
  const digest = crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 16);
  return `${prefix}-${digest}`;
}

function protocolInfo(value) {
  const original = String(value ?? '').trim().toLowerCase();
  if (!original) return { original, supported: false, reason: '缺少协议类型' };
  if (!SUPPORTED_PROTOCOLS.has(original)) {
    return {
      original,
      supported: false,
      reason: `协议 ${original} 暂不支持；请先转换为 HTTP 或 SOCKS5 本地端口`,
    };
  }
  return {
    original,
    supported: true,
    protocol: original === 'socks' || original === 'socks5' || original === 'socks5h' ? 'socks5' : 'http',
    secure: original === 'https',
    remoteDns: original === 'socks5h',
  };
}

function baseFields({ name, protocol, host, port, username, password, source, secure, remoteDns, udp, sni, skipCertVerify, country }) {
  const displayHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const fields = {
    id: hashId([
      protocol,
      host,
      String(port),
      username ?? '',
      password ?? '',
      name ?? '',
      secure ? 'tls' : '',
      remoteDns ? 'remote-dns' : '',
      sni ?? '',
      udp === undefined ? '' : String(Boolean(udp)),
      skipCertVerify === undefined ? '' : String(Boolean(skipCertVerify)),
    ]),
    name: name || `${protocol}://${displayHost}:${port}`,
    protocol,
    host,
    port,
    supported: true,
    status: 'supported',
  };
  if (username !== undefined) fields.username = username;
  if (password !== undefined) fields.password = password;
  if (secure) fields.tls = true;
  if (remoteDns) fields.remoteDns = true;
  if (udp !== undefined) fields.udp = Boolean(udp);
  if (sni) fields.sni = sni;
  if (skipCertVerify !== undefined) fields.skipCertVerify = Boolean(skipCertVerify);
  if (country) fields.country = String(country).trim().slice(0, 64);
  if (source) fields.source = source;
  return fields;
}

function unsupportedNode({ rawProtocol, name, host, port, source, reason }) {
  const protocol = String(rawProtocol || 'unknown').trim().toLowerCase() || 'unknown';
  const fields = {
    id: hashId(['unsupported', protocol, host || '', port ? String(port) : ''], 'unsupported'),
    // User-provided labels can contain subscription secrets; keep diagnostics generic.
    name: `${protocol} 节点`,
    protocol,
    supported: false,
    unsupported: true,
    status: 'unsupported',
    reason: reason || `协议 ${protocol} 暂不支持；请先转换为 HTTP 或 SOCKS5 本地端口`,
  };
  if (host) fields.host = host;
  if (port) fields.port = port;
  if (source) fields.source = source;
  return fields;
}

function invalidNode({ rawProtocol, name, source, reason }) {
  const fields = {
    id: hashId(['invalid', String(rawProtocol || ''), String(name || ''), String(reason || '')], 'invalid'),
    name: name || String(rawProtocol || '无效节点'),
    protocol: String(rawProtocol || '').trim().toLowerCase() || undefined,
    supported: false,
    status: 'invalid',
    reason: reason || '节点字段无效',
  };
  if (!fields.protocol) delete fields.protocol;
  if (source) fields.source = source;
  return fields;
}

function normalizeUriInput(value) {
  const raw = String(value ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) return raw;
  try {
    // Keep URI fragments that contain spaces when the URL itself is valid.
    new URL(raw);
    return raw;
  } catch {
    // Providers sometimes append an unescaped display marker (for example
    // " ♾") after the URI. Retry with that trailing decoration removed.
    return /\s+[♾∞]+\s*$/u.test(raw)
      ? raw.replace(/\s+[♾∞]+\s*$/u, '').trim()
      : raw;
  }
}

function nodeFromUri(uri, source) {
  const info = sourceInfo(source);
  const raw = normalizeUriInput(uri);
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (!schemeMatch) return invalidNode({ source: info.source, reason: '节点不是有效的 URI（缺少协议）' });

  const rawProtocol = schemeMatch[1].toLowerCase();
  const pInfo = protocolInfo(rawProtocol);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    if (!pInfo.supported) {
      return unsupportedNode({ rawProtocol, source: info.source, reason: pInfo.reason });
    }
    return invalidNode({ rawProtocol, source: info.source, reason: `URI 解析失败：${error.message}` });
  }

  const host = normalizeHost(parsed.hostname);
  const port = parsePort(parsed.port, DEFAULT_PORTS[rawProtocol]);
  const name = decodeComponent(parsed.hash ? parsed.hash.slice(1) : undefined);
  if (!pInfo.supported) {
    // A URI fragment is often a display remark, but it can also contain a
    // subscription token. Unsupported URI records are diagnostics, so do not
    // echo that fragment back to the renderer.
    return unsupportedNode({ rawProtocol, host, port, source: info.source, reason: pInfo.reason });
  }
  if (!host) return invalidNode({ rawProtocol, name, source: info.source, reason: '节点缺少服务器地址' });
  if (port === null) return invalidNode({ rawProtocol, name, host, source: info.source, reason: '端口必须是 1-65535 的整数' });

  const query = parsed.searchParams;
  const sni = decodeComponent(query.get('sni') || query.get('servername'));
  return baseFields({
    name,
    protocol: pInfo.protocol,
    host,
    port,
    username: decodeComponent(parsed.username),
    password: decodeComponent(parsed.password),
    source: info.source,
    secure: pInfo.secure || toBoolean(query.get('tls')),
    remoteDns: pInfo.remoteDns,
    udp: query.has('udp') ? toBoolean(query.get('udp'), true) : undefined,
    sni,
  });
}

function nodeFromObject(raw, source) {
  const info = sourceInfo(source);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return invalidNode({ source: info.source, reason: '节点必须是 URI 字符串或对象' });
  }
  const rawProtocol = raw.type ?? raw.protocol ?? raw.scheme;
  const pInfo = protocolInfo(rawProtocol);
  const name = raw.name ?? raw.remark ?? raw.title;
  const host = normalizeHost(raw.server ?? raw.host ?? raw.address ?? raw.hostname);
  const suppliedPort = raw.port;
  const port = parsePort(suppliedPort, DEFAULT_PORTS[String(rawProtocol ?? '').toLowerCase()]);
  if (!pInfo.supported) {
    return unsupportedNode({ rawProtocol, name, host, port, source: info.source, reason: pInfo.reason });
  }
  if (!host) return invalidNode({ rawProtocol, name, source: info.source, reason: '节点缺少 server 地址' });
  if (port === null) return invalidNode({ rawProtocol, name, host, source: info.source, reason: '端口必须是 1-65535 的整数' });
  const username = raw.username ?? raw.user;
  const password = raw.password ?? raw.pass;
  const sni = raw.sni ?? raw.servername ?? raw.serverName;
  const country = raw.countryName ?? raw.country ?? raw.countryCode ?? raw['country-code'];
  return baseFields({
    name: name === undefined || name === null ? undefined : String(name),
    protocol: pInfo.protocol,
    host,
    port,
    username: username === undefined ? undefined : String(username),
    password: password === undefined ? undefined : String(password),
    source: info.source,
    secure: pInfo.secure || toBoolean(raw.tls),
    remoteDns: pInfo.remoteDns || toBoolean(raw['remote-dns']) || toBoolean(raw.remoteDns),
    udp: raw.udp === undefined ? undefined : toBoolean(raw.udp),
    sni: sni === undefined || sni === null ? undefined : String(sni),
    skipCertVerify: raw['skip-cert-verify'] === undefined ? undefined : toBoolean(raw['skip-cert-verify']),
    country: country === undefined || country === null ? undefined : String(country),
  });
}

/**
 * Normalize either a supported URI or a Clash-style proxy object.
 * Unsupported protocols return an explicit `status: 'unsupported'` record.
 * Malformed supported records return `status: 'invalid'`; this keeps import
 * operations lossless and lets the caller show a useful diagnostic.
 */
function normalizeProxyNode(raw, source) {
  if (typeof raw === 'string') return nodeFromUri(raw, source);
  return nodeFromObject(raw, source);
}

function emptyResult(format, source) {
  const result = { format, nodes: [], unsupported: [], errors: [] };
  const safeSource = sanitizeSource(source);
  if (safeSource) result.source = safeSource;
  return result;
}

function addNormalized(result, node, raw, line) {
  const source = result.source;
  if (line !== undefined && node.line === undefined) node.line = line;
  if (node.status === 'supported') {
    if (!result.nodes.some((item) => item.id === node.id)) result.nodes.push(node);
  } else if (node.status === 'unsupported') {
    if (!result.unsupported.some((item) => item.id === node.id)) result.unsupported.push(node);
  } else {
    const error = {
      raw: REDACTED_DIAGNOSTIC,
      reason: node.reason,
      status: 'invalid',
    };
    if (line !== undefined) error.line = line;
    if (source) error.source = source;
    result.errors.push(error);
  }
}

function parseClashYaml(text, options) {
  const source = sanitizeSource(options.source);
  const result = emptyResult('clash-yaml', source);
  let document;
  try {
    document = YAML.parse(text);
  } catch (error) {
    // YAML parser messages can include a source excerpt; never echo subscription
    // content because it may contain credentials or access tokens.
    result.errors.push({ reason: 'YAML 解析失败：请检查订阅格式', status: 'invalid', source });
    return result;
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    result.errors.push({ reason: 'Clash YAML 顶层必须是对象', status: 'invalid', source });
    return result;
  }
  if (!Array.isArray(document.proxies)) {
    result.errors.push({ reason: 'Clash YAML 缺少 proxies 数组', status: 'invalid', source });
    return result;
  }
  document.proxies.forEach((raw, index) => {
    addNormalized(result, normalizeProxyNode(raw, source), raw, index + 1);
  });
  return result;
}

function looksLikeClashYaml(text) {
  return /(^|\n)\s*(?:proxies|proxy-groups|mixed-port|port)\s*:/i.test(text)
    || /^\s*\{[\s\S]*\"proxies\"\s*:/i.test(text);
}

function looksLikeUriList(text) {
  return text.split(/\r?\n/).some((line) => /^[ \t]*[a-z][a-z0-9+.-]*:\/\//i.test(line.trim()));
}

function decodeBase64Candidate(text) {
  const compact = text.replace(/[\r\n\t ]+/g, '');
  if (compact.length < 8 || compact.length % 4 === 1 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return null;
  const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  let decoded;
  try {
    decoded = Buffer.from(padded, 'base64').toString('utf8').replace(/^\uFEFF/, '').trim();
  } catch {
    return null;
  }
  if (!decoded || /\uFFFD/.test(decoded)) return null;
  const hasRecognizableContent = looksLikeUriList(decoded) || looksLikeClashYaml(decoded);
  return hasRecognizableContent ? decoded : null;
}

function parseTextInternal(text, options, allowBase64) {
  const parseOptions = { ...options, source: sanitizeSource(options.source) };
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return emptyResult('empty', parseOptions.source);

  if (looksLikeClashYaml(trimmed)) return parseClashYaml(trimmed, parseOptions);

  const result = emptyResult('uri-list', parseOptions.source);
  let candidateCount = 0;
  trimmed.split(/\r?\n/).forEach((line, index) => {
    const value = line.trim();
    if (!value || value.startsWith('#') || value.startsWith(';') || value.startsWith('//')) return;
    candidateCount += 1;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      result.errors.push({ raw: REDACTED_DIAGNOSTIC, line: index + 1, status: 'invalid', reason: '忽略无法识别的节点行', source: parseOptions.source });
      return;
    }
    addNormalized(result, normalizeProxyNode(value, { source: parseOptions.source, line: index + 1 }), value, index + 1);
  });

  if (allowBase64 && candidateCount > 0 && result.nodes.length === 0 && result.unsupported.length === 0 && !looksLikeUriList(trimmed)) {
    const decoded = decodeBase64Candidate(trimmed);
    if (decoded) {
      const decodedResult = parseTextInternal(decoded, parseOptions, false);
      decodedResult.format = decodedResult.format === 'clash-yaml' ? 'base64-clash-yaml' : 'base64';
      decodedResult.encoding = 'base64';
      return decodedResult;
    }
  }

  if (candidateCount === 0) {
    if (allowBase64) {
      const decoded = decodeBase64Candidate(trimmed);
      if (decoded) {
        const decodedResult = parseTextInternal(decoded, parseOptions, false);
        decodedResult.format = decodedResult.format === 'clash-yaml' ? 'base64-clash-yaml' : 'base64';
        decodedResult.encoding = 'base64';
        return decodedResult;
      }
    }
    result.format = 'unknown';
    result.errors.push({ raw: REDACTED_DIAGNOSTIC, status: 'invalid', reason: '未识别为 URI 列表、Base64 订阅或 Clash YAML', source: parseOptions.source });
  }
  return result;
}

/** Parse text supplied directly by a user or a fetched subscription body. */
function parseSubscriptionText(text, options = {}) {
  const value = asText(text);
  const source = options.source === undefined ? undefined : String(options.source);
  return parseTextInternal(value, { ...options, source }, true);
}

/** Parse a Buffer/string response and detect plain, Base64, or Clash formats. */
function parseSubscriptionContent(content, options = {}) {
  return parseSubscriptionText(asText(content), options);
}

module.exports = {
  SUPPORTED_PROTOCOLS,
  normalizeProxyNode,
  parseSubscriptionText,
  parseSubscriptionContent,
  resolveSubscriptionRedirect,
  sanitizeSource,
};
