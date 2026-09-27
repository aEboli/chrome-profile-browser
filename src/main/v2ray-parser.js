'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const YAML = require('yaml');
const { sanitizeSource } = require('./proxy-parser');

// These are the outbound protocols commonly exposed by v2rayN/Xray
// subscriptions. AnyTLS is emitted for sing-box because the bundled Xray
// release does not register that outbound. The parser deliberately keeps the
// transport model small; adapters can reject fields they cannot translate
// instead of silently changing the user's connection.
const CORE_PROTOCOLS = new Set(['vmess', 'vless', 'trojan', 'ss', 'shadowsocks', 'anytls']);
const KNOWN_CORE_UNSUPPORTED = new Set([
  'hysteria', 'hysteria2', 'tuic', 'wireguard', 'socks', 'http', 'ssh',
  'naive', 'juicity', 'mieru', 'snell', 'shadowtls', 'dokodemo-door',
]);
const SUPPORTED_NETWORKS = new Set(['tcp', 'ws', 'grpc', 'httpupgrade', 'xhttp']);
const REDACTED_DIAGNOSTIC = '[已隐藏]';

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function integer(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function port(value, fallback = null) {
  const candidate = value === undefined || value === null || value === '' ? fallback : value;
  const number = integer(candidate);
  return number && number >= 1 && number <= 65535 ? number : null;
}

function host(value) {
  let result = text(value);
  if (!result || /[\u0000-\u0020\u007f]/.test(result)) return '';
  if (result.startsWith('[') && result.endsWith(']')) result = result.slice(1, -1);
  if (net.isIP(result)) return result;
  if (result.length > 253 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(result)) return '';
  return result;
}

function decode(value) {
  if (value === undefined || value === null || value === '') return '';
  try { return decodeURIComponent(String(value)); } catch { return String(value); }
}

function base64Decode(value) {
  const compact = String(value || '').replace(/[\r\n\t\s]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (compact.length < 4 || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return '';
  const padded = compact + '='.repeat((4 - (compact.length % 4)) % 4);
  try {
    const decoded = Buffer.from(padded, 'base64').toString('utf8').replace(/^\uFEFF/, '').trim();
    return decoded && !/\uFFFD/.test(decoded) ? decoded : '';
  } catch {
    return '';
  }
}

function hashId(parts, prefix = 'core') {
  return `${prefix}-${crypto.createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\u001f')).digest('hex').slice(0, 16)}`;
}

function sourceValue(source) {
  if (typeof source === 'string') return sanitizeSource(source);
  if (source && typeof source === 'object') return sanitizeSource(source.source);
  return '';
}

function normalizeUriInput(value) {
  const raw = text(value).replace(/^['"]|['"]$/g, '');
  if (!raw) return raw;
  try {
    new URL(raw);
    return raw;
  } catch {
    // Some providers append an unescaped display marker after the URI.
    return /\s+[♾∞]+\s*$/u.test(raw)
      ? raw.replace(/\s+[♾∞]+\s*$/u, '').trim()
      : raw;
  }
}

function subscriptionInfoLabel(value) {
  const candidate = text(value)
    .replace(/^\s*\[[^\]]+\]\s*/u, '')
    .replace(/^\s*(?:anytls|ss|http|https|socks5?)(?:\s*[-:：|]\s*|\s+)/iu, '')
    .trim();
  if (!candidate || candidate.length > 240) return '';
  return /^(?:剩余流量|流量余额|流量剩余|距离?下次重置|下次重置|重置时间|套餐到期|到期时间|有效期至|官网|公告|通知|提示|traffic|remaining\s*traffic|reset|expire|expiration)(?:\b|[\s:：=]|$)/iu.test(candidate)
    ? candidate
    : '';
}

function unsupported(protocol, source, hostValue, portValue, reason, displayName) {
  const kind = text(protocol).toLowerCase() || 'unknown';
  const safeDisplayName = subscriptionInfoLabel(displayName);
  const idParts = ['unsupported', kind, hostValue || '', portValue || ''];
  if (safeDisplayName) idParts.push(safeDisplayName);
  const fields = {
    id: hashId(idParts, 'unsupported'),
    name: safeDisplayName || `${kind} 节点`,
    protocol: kind,
    supported: false,
    requiresCore: true,
    status: 'unsupported',
    reason: reason || `协议 ${kind} 暂不支持；请使用兼容的 Xray 核心或转换为 HTTP/SOCKS5 本地端口`,
  };
  if (hostValue) fields.host = hostValue;
  if (portValue) fields.port = portValue;
  const safeSource = sourceValue(source);
  if (safeSource) fields.source = safeSource;
  return fields;
}

function invalid(protocol, source, reason) {
  const kind = text(protocol).toLowerCase() || 'unknown';
  const fields = {
    id: hashId(['invalid', kind, reason || ''], 'invalid'),
    name: `${kind} 节点`,
    protocol: kind,
    supported: false,
    requiresCore: true,
    status: 'invalid',
    reason: reason || '节点字段无效',
  };
  const safeSource = sourceValue(source);
  if (safeSource) fields.source = safeSource;
  return fields;
}

function parseAlpn(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean).slice(0, 8);
  return text(value).split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function normalizeNetwork(value) {
  const result = text(value || 'tcp').toLowerCase();
  return result;
}

function transportFromQuery(query) {
  const network = normalizeNetwork(query.get('type') || query.get('network') || 'tcp');
  if (!SUPPORTED_NETWORKS.has(network)) return { error: `传输方式 ${network} 暂不支持` };
  const transport = { network };
  if (network === 'ws' || network === 'httpupgrade' || network === 'xhttp') {
    transport.path = text(query.get('path') || '/') || '/';
    transport.host = text(query.get('host') || query.get('eh') || '');
  } else if (network === 'grpc') {
    transport.serviceName = text(query.get('serviceName') || query.get('servicename') || '');
    transport.authority = text(query.get('authority') || '');
  }
  if (query.get('headerType')) transport.headerType = text(query.get('headerType'));
  return { transport };
}

function transportFromObject(raw) {
  // Clash uses `type` for the proxy protocol; the transport lives in
  // `network`/`net` and defaults to TCP.
  const network = normalizeNetwork(raw.network || raw.net || 'tcp');
  if (!SUPPORTED_NETWORKS.has(network)) return { error: `传输方式 ${network} 暂不支持` };
  const transport = { network };
  const ws = raw['ws-opts'] && typeof raw['ws-opts'] === 'object' ? raw['ws-opts'] : {};
  const grpc = raw['grpc-opts'] && typeof raw['grpc-opts'] === 'object' ? raw['grpc-opts'] : {};
  const httpupgrade = raw['http-upgrade-opts'] && typeof raw['http-upgrade-opts'] === 'object' ? raw['http-upgrade-opts'] : {};
  const xhttp = raw['xhttp-opts'] && typeof raw['xhttp-opts'] === 'object' ? raw['xhttp-opts'] : {};
  if (network === 'ws') {
    transport.path = text(ws.path || raw.path || '/') || '/';
    transport.host = text(ws.headers?.Host || ws.headers?.host || raw.host || '');
  } else if (network === 'httpupgrade') {
    transport.path = text(httpupgrade.path || raw.path || '/') || '/';
    transport.host = text(httpupgrade.host || raw.host || '');
  } else if (network === 'xhttp') {
    transport.path = text(xhttp.path || raw.path || '/') || '/';
    transport.host = text(xhttp.host || raw.host || '');
    transport.mode = text(xhttp.mode || 'auto');
  } else if (network === 'grpc') {
    transport.serviceName = text(grpc['grpc-service-name'] || grpc.serviceName || raw.serviceName || '');
    transport.authority = text(grpc.authority || raw.authority || '');
  }
  if (raw.headerType) transport.headerType = text(raw.headerType);
  return { transport };
}

function securityFromQuery(query) {
  const security = text(query.get('security') || '').toLowerCase();
  const tls = security === 'tls' || security === 'reality' || bool(query.get('tls'));
  const result = { security: security || (tls ? 'tls' : 'none'), tls };
  result.sni = text(query.get('sni') || query.get('servername') || '');
  result.alpn = parseAlpn(query.get('alpn') || '');
  result.fingerprint = text(query.get('fp') || query.get('fingerprint') || '');
  result.publicKey = text(query.get('pbk') || query.get('publicKey') || '');
  result.shortId = text(query.get('sid') || query.get('shortId') || '');
  result.spiderX = text(query.get('spx') || query.get('spiderX') || '');
  result.allowInsecure = bool(query.get('allowInsecure') || query.get('insecure') || query.get('skip-cert-verify'));
  return result;
}

function securityFromObject(raw) {
  const reality = raw['reality-opts'] && typeof raw['reality-opts'] === 'object' ? raw['reality-opts'] : {};
  const security = text(raw.security || (raw.reality ? 'reality' : '')) .toLowerCase();
  const tls = bool(raw.tls) || security === 'tls' || security === 'reality';
  const result = { security: security || (tls ? 'tls' : 'none'), tls };
  result.sni = text(raw.servername || raw.sni || '');
  result.alpn = parseAlpn(raw.alpn);
  result.fingerprint = text(raw['client-fingerprint'] || raw.fingerprint || '');
  result.publicKey = text(reality['public-key'] || reality.pbk || raw.publicKey || '');
  result.shortId = text(reality['short-id'] || reality.sid || raw.shortId || '');
  result.spiderX = text(reality['spider-x'] || reality.spx || raw.spiderX || '');
  result.allowInsecure = bool(raw['skip-cert-verify'] || raw.allowInsecure);
  return result;
}

function buildNode({ protocol, name, server, serverPort, coreConfig, source, country }) {
  const address = host(server);
  const endpoint = port(serverPort, protocol === 'ss' || protocol === 'shadowsocks' ? 8388 : 443);
  if (!address) return invalid(protocol, source, '节点缺少有效服务器地址');
  if (!endpoint) return invalid(protocol, source, '端口必须是 1-65535 的整数');
  const config = { ...coreConfig, address, port: endpoint };
  const secretParts = [
    protocol, address, endpoint, name || '', config.uuid || '', config.password || '',
    config.method || '', config.network || '', config.security || '', config.sni || '',
    config.path || '', config.serviceName || '', config.publicKey || '', config.shortId || '',
    JSON.stringify(config),
  ];
  const fields = {
    id: hashId(secretParts),
    name: text(name) || `${protocol}://${address}:${endpoint}`,
    protocol: protocol === 'shadowsocks' ? 'ss' : protocol,
    host: address,
    port: endpoint,
    supported: true,
    status: 'supported',
    requiresCore: true,
    coreConfig: config,
  };
  if (protocol === 'anytls') fields.core = 'singbox';
  const safeSource = sourceValue(source);
  if (safeSource) fields.source = safeSource;
  if (country !== undefined && country !== null && text(country)) fields.country = text(country).slice(0, 64);
  return fields;
}

function parseVmess(uri, source) {
  const encoded = String(uri).slice(String(uri).indexOf('://') + 3).split('#')[0];
  const decoded = base64Decode(decode(encoded));
  if (!decoded) return invalid('vmess', source, 'VMess 内容不是有效的 Base64 JSON');
  let raw;
  try { raw = JSON.parse(decoded); } catch { return invalid('vmess', source, 'VMess 内容不是有效的 JSON'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('vmess', source, 'VMess 节点对象无效');
  const transportResult = transportFromObject(raw);
  if (transportResult.error) return unsupported('vmess', source, host(raw.add || raw.address), port(raw.port), transportResult.error);
  const security = text(raw.tls).toLowerCase() === 'reality' ? 'reality' : (bool(raw.tls) ? 'tls' : 'none');
  const coreConfig = {
    type: 'vmess',
    uuid: text(raw.id),
    alterId: integer(raw.aid, 0),
    security: text(raw.scy || 'auto'),
    ...transportResult.transport,
    securityLayer: security,
    sni: text(raw.sni || raw.host || ''),
    alpn: parseAlpn(raw.alpn),
    fingerprint: text(raw.fp || ''),
    allowInsecure: bool(raw.allowInsecure || raw['skip-cert-verify']),
  };
  if (!coreConfig.uuid) return invalid('vmess', source, 'VMess 缺少用户 ID');
  if (coreConfig.securityLayer === 'reality') {
    coreConfig.publicKey = text(raw.pbk || raw.publicKey || '');
    coreConfig.shortId = text(raw.sid || raw.shortId || '');
    coreConfig.spiderX = text(raw.spx || raw.spiderX || '');
    if (!coreConfig.publicKey) return unsupported('vmess', source, host(raw.add), port(raw.port), 'VMess REALITY 缺少公钥');
  }
  return buildNode({ protocol: 'vmess', name: raw.ps, server: raw.add || raw.server, serverPort: raw.port, coreConfig, source });
}

function parseUrlSecurity(url) {
  const security = securityFromQuery(url.searchParams);
  const transportResult = transportFromQuery(url.searchParams);
  return { security, transportResult };
}

function parseVless(uri, source) {
  let url;
  try { url = new URL(uri); } catch { return invalid('vless', source, 'VLESS URI 无效'); }
  const { security, transportResult } = parseUrlSecurity(url);
  if (transportResult.error) return unsupported('vless', source, host(url.hostname), port(url.port), transportResult.error);
  const uuid = decode(url.username);
  if (!uuid) return invalid('vless', source, 'VLESS 缺少用户 ID');
  const coreConfig = {
    type: 'vless',
    uuid,
    encryption: text(url.searchParams.get('encryption') || 'none'),
    flow: text(url.searchParams.get('flow') || ''),
    ...transportResult.transport,
    ...security,
  };
  if (coreConfig.security === 'reality' && !coreConfig.publicKey) return unsupported('vless', source, host(url.hostname), port(url.port), 'VLESS REALITY 缺少公钥');
  return buildNode({ protocol: 'vless', name: decode(url.hash.slice(1)), server: url.hostname, serverPort: url.port, coreConfig, source });
}

function parseTrojan(uri, source) {
  let url;
  try { url = new URL(uri); } catch { return invalid('trojan', source, 'Trojan URI 无效'); }
  const { security, transportResult } = parseUrlSecurity(url);
  if (transportResult.error) return unsupported('trojan', source, host(url.hostname), port(url.port), transportResult.error);
  const password = decode(url.username || '');
  if (!password) return invalid('trojan', source, 'Trojan 缺少密码');
  const coreConfig = { type: 'trojan', password, ...transportResult.transport, ...security };
  if (!coreConfig.tls) return unsupported('trojan', source, host(url.hostname), port(url.port), 'Trojan 节点必须启用 TLS');
  return buildNode({ protocol: 'trojan', name: decode(url.hash.slice(1)), server: url.hostname, serverPort: url.port, coreConfig, source });
}

function parseAnytls(uri, source) {
  let url;
  try { url = new URL(uri); } catch { return invalid('anytls', source, 'AnyTLS URI 无效'); }
  const query = url.searchParams;
  const userInfo = url.username !== '' || url.password !== ''
    ? `${url.username}${url.password ? `:${url.password}` : ''}`
    : '';
  const password = userInfo
    ? decode(userInfo)
    : text(query.get('password') || query.get('pwd') || '');
  const name = decode(url.hash.slice(1));
  if (!password) {
    return unsupported(
      'anytls',
      source,
      host(url.hostname),
      port(url.port),
      'AnyTLS 缺少密码',
      name,
    );
  }
  const coreConfig = {
    type: 'anytls',
    password,
    tls: true,
    security: 'tls',
    securityLayer: 'tls',
    sni: text(query.get('sni') || query.get('servername') || ''),
    alpn: parseAlpn(query.get('alpn') || ''),
    fingerprint: text(query.get('fp') || query.get('fingerprint') || ''),
    allowInsecure: bool(query.get('insecure'))
      || bool(query.get('allowInsecure'))
      || bool(query.get('skip-cert-verify')),
    clientMetadata: text(query.get('client_metadata') || query.get('client-metadata') || ''),
    idleSessionCheckInterval: text(query.get('idle_session_check_interval') || query.get('idle-session-check-interval') || ''),
    idleSessionTimeout: text(query.get('idle_session_timeout') || query.get('idle-session-timeout') || ''),
    minIdleSession: integer(query.get('min_idle_session') || query.get('min-idle-session'), 0),
  };
  return buildNode({
    protocol: 'anytls',
    name,
    server: url.hostname,
    serverPort: url.port,
    coreConfig,
    source,
  });
}

function decodeSsUserInfo(value) {
  const decoded = base64Decode(value);
  const candidate = decoded || decode(value);
  const separator = candidate.indexOf(':');
  if (separator <= 0) return null;
  return { method: candidate.slice(0, separator), password: candidate.slice(separator + 1) };
}

function parseShadowsocks(uri, source) {
  let url;
  try { url = new URL(uri); } catch { return invalid('ss', source, 'Shadowsocks URI 无效'); }
  let method;
  let password;
  let server;
  let serverPort;
  if (url.username && url.hostname) {
    const info = decodeSsUserInfo(`${decode(url.username)}${url.password ? `:${decode(url.password)}` : ''}`);
    if (info) ({ method, password } = info);
    server = url.hostname;
    serverPort = url.port;
  } else {
    const payload = base64Decode(url.hostname || url.pathname.replace(/^\//, ''));
    const at = payload.lastIndexOf('@');
    if (at > 0) {
      const info = decodeSsUserInfo(payload.slice(0, at));
      if (info) ({ method, password } = info);
      try {
        const endpoint = new URL(`ss://${payload.slice(at + 1)}`);
        server = endpoint.hostname;
        serverPort = endpoint.port;
      } catch {
        // The outer validation below reports a generic invalid node.
      }
    }
  }
  if (!method || password === undefined) return invalid('ss', source, 'Shadowsocks 缺少加密方式或密码');
  const plugin = text(url.searchParams.get('plugin') || '');
  if (plugin) return unsupported('ss', source, host(server), port(serverPort), 'Shadowsocks 插件传输暂不支持');
  const coreConfig = {
    type: 'shadowsocks',
    method,
    password,
    network: 'tcp',
    plugin,
  };
  return buildNode({ protocol: 'ss', name: decode(url.hash.slice(1)), server, serverPort, coreConfig, source });
}

function parseCoreUri(uri, source) {
  const raw = normalizeUriInput(uri);
  const match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw);
  if (!match) return null;
  const protocol = match[1].toLowerCase();
  if (protocol === 'vmess') return parseVmess(raw, source);
  if (protocol === 'vless') return parseVless(raw, source);
  if (protocol === 'trojan') return parseTrojan(raw, source);
  if (protocol === 'ss' || protocol === 'shadowsocks') return parseShadowsocks(raw, source);
  if (protocol === 'anytls') return parseAnytls(raw, source);
  if (KNOWN_CORE_UNSUPPORTED.has(protocol)) {
    let parsedHost = '';
    let parsedPort = null;
    try { const url = new URL(raw); parsedHost = host(url.hostname); parsedPort = port(url.port); } catch { /* Diagnostics stay generic. */ }
    return unsupported(protocol, source, parsedHost, parsedPort);
  }
  return null;
}

function parseCoreObject(raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const protocol = text(raw.type || raw.protocol || raw.scheme).toLowerCase();
  if (!CORE_PROTOCOLS.has(protocol)) {
    if (KNOWN_CORE_UNSUPPORTED.has(protocol)) return unsupported(protocol, source, host(raw.server), port(raw.port));
    return null;
  }
  const server = raw.server || raw.address || raw.host;
  const serverPort = raw.port;
  if (protocol === 'anytls') {
    const tls = raw.tls && typeof raw.tls === 'object' ? raw.tls : {};
    const password = text(raw.password || raw.pass || raw.token);
    const name = raw.name || raw.remark;
    if (!password) return unsupported(protocol, source, host(server), port(serverPort), 'AnyTLS 缺少密码', name);
    const coreConfig = {
      type: 'anytls',
      password,
      tls: true,
      security: 'tls',
      securityLayer: 'tls',
      sni: text(raw.servername || raw.sni || raw.serverName || raw['server-name'] || tls.server_name || tls.serverName || ''),
      alpn: parseAlpn(raw.alpn || tls.alpn),
      fingerprint: text(raw['client-fingerprint'] || raw.fingerprint || tls['client-fingerprint'] || tls.fingerprint || ''),
      allowInsecure: bool(raw['skip-cert-verify'])
        || bool(raw.allowInsecure)
        || bool(raw.insecure)
        || bool(tls.insecure),
      clientMetadata: text(raw.client_metadata || raw['client-metadata'] || ''),
      idleSessionCheckInterval: text(raw.idle_session_check_interval || raw['idle-session-check-interval'] || ''),
      idleSessionTimeout: text(raw.idle_session_timeout || raw['idle-session-timeout'] || ''),
      minIdleSession: integer(raw.min_idle_session ?? raw['min-idle-session'], 0),
    };
    return buildNode({
      protocol,
      name,
      server,
      serverPort,
      coreConfig,
      source,
      country: raw.countryName || raw.country || raw.countryCode || raw['country-code'],
    });
  }
  const transportResult = transportFromObject(raw);
  if (transportResult.error) return unsupported(protocol, source, host(server), port(serverPort), transportResult.error);
  const security = securityFromObject(raw);
  const base = {
    ...transportResult.transport,
    ...security,
    securityLayer: security.security,
    udp: bool(raw.udp, true),
  };
  if (protocol === 'vmess') {
    base.type = 'vmess';
    base.uuid = text(raw.uuid || raw.id);
    base.alterId = integer(raw.alterId ?? raw.aid, 0);
    base.security = text(raw.cipher || raw.scy || 'auto');
    if (!base.uuid) return invalid(protocol, source, 'VMess 缺少用户 ID');
  } else if (protocol === 'vless') {
    base.type = 'vless';
    base.uuid = text(raw.uuid || raw.id);
    base.encryption = text(raw.encryption || 'none');
    base.flow = text(raw.flow || '');
    if (!base.uuid) return invalid(protocol, source, 'VLESS 缺少用户 ID');
  } else if (protocol === 'trojan') {
    base.type = 'trojan';
    base.password = text(raw.password || raw.pass);
    if (!base.password) return invalid(protocol, source, 'Trojan 缺少密码');
    if (!base.tls) return unsupported(protocol, source, host(server), port(serverPort), 'Trojan 节点必须启用 TLS');
  } else {
    base.type = 'shadowsocks';
    base.method = text(raw.cipher || raw.method);
    base.password = text(raw.password || raw.pass);
    base.plugin = text(raw.plugin || '');
    base.network = 'tcp';
    if (!base.method || !base.password) return invalid(protocol, source, 'Shadowsocks 缺少加密方式或密码');
  }
  if (base.security === 'reality' && !base.publicKey) return unsupported(protocol, source, host(server), port(serverPort), 'REALITY 节点缺少公钥');
  return buildNode({
    protocol,
    name: raw.name || raw.remark,
    server,
    serverPort,
    coreConfig: base,
    source,
    country: raw.countryName || raw.country || raw.countryCode || raw['country-code'],
  });
}

function looksLikeYaml(value) {
  return /(^|\n)\s*(?:proxies|proxy-groups|mixed-port|port)\s*:/i.test(value);
}

function looksLikeUri(value) {
  return value.split(/\r?\n/).some((line) => /^[ \t]*[a-z][a-z0-9+.-]*:\/\//i.test(line.trim()));
}

function emptyResult(format, source) {
  const result = { format, nodes: [], unsupported: [], errors: [] };
  const safeSource = sourceValue(source);
  if (safeSource) result.source = safeSource;
  return result;
}

function add(result, node, line) {
  if (!node) return;
  if (line !== undefined && node.line === undefined) node.line = line;
  if (node.status === 'supported') {
    if (!result.nodes.some((item) => item.id === node.id)) result.nodes.push(node);
  } else if (node.status === 'unsupported') {
    if (!result.unsupported.some((item) => item.id === node.id)) result.unsupported.push(node);
  } else {
    result.errors.push({ raw: REDACTED_DIAGNOSTIC, status: 'invalid', reason: node.reason, ...(line ? { line } : {}) });
  }
}

function parseCoreTextInternal(value, options, allowBase64) {
  const source = options.source;
  const trimmed = String(value || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) return emptyResult('empty', source);
  if (looksLikeYaml(trimmed)) {
    let document;
    try { document = YAML.parse(trimmed); } catch { return { ...emptyResult('clash-yaml', source), errors: [{ raw: REDACTED_DIAGNOSTIC, status: 'invalid', reason: 'YAML 解析失败：请检查订阅格式' }] }; }
    const result = emptyResult('clash-yaml', source);
    if (!document || typeof document !== 'object' || !Array.isArray(document.proxies)) return result;
    document.proxies.forEach((item, index) => add(result, parseCoreObject(item, source), index + 1));
    return result;
  }
  const result = emptyResult('uri-list', source);
  let candidate = 0;
  trimmed.split(/\r?\n/).forEach((line, index) => {
    const item = line.trim();
    if (!item || item.startsWith('#') || item.startsWith(';') || item.startsWith('//')) return;
    candidate += 1;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(item)) return;
    add(result, parseCoreUri(item, source), index + 1);
  });
  if (allowBase64 && !looksLikeUri(trimmed) && (candidate === 0 || (result.nodes.length === 0 && result.unsupported.length === 0))) {
    const decoded = base64Decode(trimmed);
    if (decoded) {
      const decodedResult = parseCoreTextInternal(decoded, options, false);
      decodedResult.format = decodedResult.format === 'clash-yaml' ? 'base64-clash-yaml' : 'base64';
      decodedResult.encoding = 'base64';
      return decodedResult;
    }
  }
  if (candidate === 0 && !allowBase64) result.errors.push({ raw: REDACTED_DIAGNOSTIC, status: 'invalid', reason: '未识别为 v2rayN/Xray 订阅内容' });
  return result;
}

function parseV2raySubscriptionContent(content, options = {}) {
  let value;
  if (typeof content === 'string') value = content;
  else if (Buffer.isBuffer(content) || content instanceof Uint8Array) value = Buffer.from(content).toString('utf8');
  else throw new TypeError('订阅内容必须是字符串或字节数组');
  return parseCoreTextInternal(value, { ...options, source: options.source }, true);
}

module.exports = {
  CORE_PROTOCOLS,
  parseCoreUri,
  parseCoreObject,
  parseV2raySubscriptionContent,
};
