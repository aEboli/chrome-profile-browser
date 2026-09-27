'use strict';

const net = require('node:net');
const { performance } = require('node:perf_hooks');
const tls = require('node:tls');
const { isPublicIp, normalizeIp } = require('./ip-geo');

const DEFAULT_TARGET = Object.freeze({ host: 'example.com', port: 80 });
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_HTTP_RESPONSE_BYTES = 64 * 1024;
const EXIT_PROBE_ENDPOINTS = Object.freeze([
  Object.freeze({ host: 'my.ippure.com', port: 443, path: '/v1/info', kind: 'ippure' }),
  Object.freeze({ host: 'ip111.cn', port: 443, path: '/', kind: 'ip111' }),
]);

function monotonicNow() {
  return performance.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(monotonicNow() - startedAt));
}

function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function validHost(value) {
  const host = String(value ?? '').trim();
  return host !== '' && !/[\u0000-\u0020\u007f]/.test(host);
}

function authority(host, port) {
  const value = String(host);
  return value.includes(':') && !value.startsWith('[') ? `[${value}]:${port}` : `${value}:${port}`;
}

function targetFromOptions(options) {
  const target = options.target && typeof options.target === 'object' ? options.target : {};
  const host = String(options.targetHost ?? target.host ?? DEFAULT_TARGET.host).trim();
  const port = validPort(options.targetPort ?? target.port ?? DEFAULT_TARGET.port);
  if (!validHost(host) || port === null) return null;
  return { host, port };
}

function timeoutValue(value) {
  const timeout = Number(value ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 120000) : DEFAULT_TIMEOUT_MS;
}

function resultBase(node, status) {
  const reachable = status === 'reachable';
  return {
    ok: reachable,
    reachable,
    status,
    nodeId: node && node.id,
    protocol: node && node.protocol,
    host: node && node.host,
    port: node && node.port,
  };
}

function errorResult(node, status, phase, error, startedAt) {
  const result = resultBase(node, status);
  result.phase = phase;
  result.error = error instanceof Error ? error.message : String(error);
  if (error && typeof error === 'object' && error.code) result.code = String(error.code);
  if (startedAt !== undefined) result.latencyMs = elapsedMs(startedAt);
  return result;
}

function successResult(node, phase, startedAt, socket) {
  const result = resultBase(node, 'reachable');
  result.phase = phase;
  result.latencyMs = elapsedMs(startedAt);
  const remoteAddress = socket && typeof socket.remoteAddress === 'string' ? socket.remoteAddress : '';
  if (remoteAddress) result.ipAddress = remoteAddress;
  return result;
}

function connectSocket(node, options, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket;
    let timer;
    const secure = Boolean(node.tls || node.secure);
    const onConnect = () => finish(null, socket);
    const onError = (error) => finish(error);
    const onAbort = () => {
      const error = new Error('节点检查已取消');
      error.code = 'ABORT_ERR';
      finish(error);
    };
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (!socket) return;
      if (typeof socket.removeListener === 'function') {
        socket.removeListener(secure ? 'secureConnect' : 'connect', onConnect);
        socket.removeListener('error', onError);
      }
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error && socket && typeof socket.on === 'function') socket.on('error', () => {});
      cleanup();
      if (error) {
        if (socket && typeof socket.destroy === 'function') socket.destroy();
        reject(error);
      } else {
        resolve(value);
      }
    };

    if (signal && signal.aborted) return onAbort();
    timer = setTimeout(() => {
      const error = new Error(`连接超时（${timeoutMs} ms）`);
      error.code = 'ETIMEDOUT';
      finish(error);
    }, timeoutMs);
    try {
      const connectOptions = {
        ...node,
        host: node.host,
        port: node.port,
        servername: node.sni || node.host,
        rejectUnauthorized: node.skipCertVerify ? false : true,
      };
      const connector = options.connect || options.socketFactory;
      if (typeof connector === 'function') {
        socket = connector(connectOptions, node);
      } else if (secure) {
        socket = tls.connect(connectOptions);
      } else {
        socket = net.connect(connectOptions);
      }
      if (socket && typeof socket.then === 'function') {
        socket.then((value) => {
          if (settled) {
            if (value && typeof value.destroy === 'function') value.destroy();
            return;
          }
          socket = value;
          if (!socket) return finish(new Error('连接工厂没有返回 socket'));
          attachSocket();
        }, finish);
      } else {
        attachSocket();
      }
    } catch (error) {
      finish(error);
    }

    function attachSocket() {
      if (!socket || typeof socket.once !== 'function') return finish(new Error('连接工厂返回了无效 socket'));
      socket.once(secure ? 'secureConnect' : 'connect', onConnect);
      socket.once('error', onError);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      // A custom connector may return an already-connected socket.
      if (socket.readyState === 'open' || socket.connecting === false && socket.remoteAddress) {
        queueMicrotask(onConnect);
      }
    }
  });
}

function writeSocket(socket, data, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    let done = false;
    const onError = (error) => finish(error);
    const onAbort = () => {
      const error = new Error('节点检查已取消');
      error.code = 'ABORT_ERR';
      finish(error);
    };
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error && typeof socket.on === 'function') socket.on('error', () => {});
      socket.removeListener('error', onError);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    if (signal && signal.aborted) return onAbort();
    socket.once('error', onError);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new Error(`写入超时（${timeoutMs} ms）`);
      error.code = 'ETIMEDOUT';
      finish(error);
    }, timeoutMs);
    try {
      socket.write(data, () => finish());
    } catch (error) {
      finish(error);
    }
  });
}

// Keeps bytes received between the variable-length SOCKS5 replies and avoids
// assuming that one network packet equals one protocol frame.
class SocketReader {
  constructor(socket, timeoutMs, signal) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.signal = signal;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.closed = false;
    this.onData = (chunk) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      this.flush();
    };
    this.onEnd = () => this.fail(new Error('代理在握手完成前关闭了连接'));
    this.onClose = () => {
      if (!this.closed) this.fail(new Error('代理关闭了连接'));
    };
    this.onError = (error) => this.fail(error);
    socket.on('data', this.onData);
    socket.once('end', this.onEnd);
    socket.once('close', this.onClose);
    socket.on('error', this.onError);
  }

  readExact(length) {
    if (!Number.isInteger(length) || length < 0) return Promise.reject(new Error('读取长度无效'));
    if (this.buffer.length >= length) {
      const value = this.buffer.subarray(0, length);
      this.buffer = this.buffer.subarray(length);
      return Promise.resolve(value);
    }
    return this.waitFor((buffer) => buffer.length >= length, () => {
      const value = this.buffer.subarray(0, length);
      this.buffer = this.buffer.subarray(length);
      return value;
    });
  }

  readUntil(delimiter, maxBytes) {
    const marker = Buffer.from(delimiter);
    const finish = () => {
      const index = this.buffer.indexOf(marker);
      if (index < 0) return null;
      const end = index + marker.length;
      const value = this.buffer.subarray(0, end);
      this.buffer = this.buffer.subarray(end);
      return value;
    };
    const immediate = finish();
    if (immediate) return Promise.resolve(immediate);
    return this.waitFor((buffer) => buffer.length > maxBytes || buffer.indexOf(marker) >= 0, () => {
      if (this.buffer.length > maxBytes) throw new Error('代理响应超过允许大小');
      const value = finish();
      if (!value) throw new Error('代理响应格式无效');
      return value;
    });
  }

  readToEnd(maxBytes) {
    if (this.socket.readableEnded) {
      return this.buffer.length <= maxBytes
        ? Promise.resolve(this.buffer)
        : Promise.reject(new Error('代理响应超过允许大小'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        this.socket.removeListener('data', onData);
        this.socket.removeListener('end', onEnd);
        this.socket.removeListener('close', onClose);
        if (error) reject(error); else resolve(this.buffer);
      };
      const onData = () => {
        if (this.buffer.length > maxBytes) finish(new Error('代理响应超过允许大小'));
      };
      const onEnd = () => finish(null);
      const onClose = () => finish(null);
      this.socket.removeListener('end', this.onEnd);
      this.socket.on('data', onData);
      this.socket.once('end', onEnd);
      this.socket.once('close', onClose);
      if (this.buffer.length > maxBytes) finish(new Error('代理响应超过允许大小'));
    });
  }

  waitFor(predicate, take) {
    if (predicate(this.buffer)) {
      try { return Promise.resolve(take()); } catch (error) { return Promise.reject(error); }
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, take, resolve, reject, timer: null, onAbort: null };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        const error = new Error(`读取超时（${this.timeoutMs} ms）`);
        error.code = 'ETIMEDOUT';
        reject(error);
      }, this.timeoutMs);
      if (this.signal) {
        waiter.onAbort = () => {
          clearTimeout(waiter.timer);
          this.waiters = this.waiters.filter((item) => item !== waiter);
          const error = new Error('节点检查已取消');
          error.code = 'ABORT_ERR';
          reject(error);
        };
        if (this.signal.aborted) return waiter.onAbort();
        this.signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
      this.flush();
    });
  }

  flush() {
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(this.buffer)) continue;
      this.waiters = this.waiters.filter((item) => item !== waiter);
      clearTimeout(waiter.timer);
      if (this.signal && waiter.onAbort) this.signal.removeEventListener('abort', waiter.onAbort);
      try { waiter.resolve(waiter.take()); } catch (error) { waiter.reject(error); }
    }
  }

  fail(error) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      if (this.signal && waiter.onAbort) this.signal.removeEventListener('abort', waiter.onAbort);
      waiter.reject(error);
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.fail(new Error('连接已关闭'));
    this.socket.removeListener('data', this.onData);
    this.socket.removeListener('end', this.onEnd);
    this.socket.removeListener('close', this.onClose);
    this.socket.removeListener('error', this.onError);
  }
}

function publicProbeResult(value, country, countryCode, ipSource, ipProperty) {
  const ipAddress = normalizeIp(value);
  if (!isPublicIp(ipAddress)) return null;
  const normalizedCountryCode = String(countryCode || '').trim().toUpperCase();
  const normalizedCountry = String(country || '').trim();
  const normalizedIpSource = String(ipSource || '').trim();
  const normalizedIpProperty = String(ipProperty || '').trim();
  return {
    ipAddress,
    ...(normalizedCountry ? { country: normalizedCountry } : {}),
    ...(normalizedCountryCode ? { countryCode: normalizedCountryCode } : {}),
    ...(normalizedIpSource ? { ipSource: normalizedIpSource } : {}),
    ...(normalizedIpProperty ? { ipProperty: normalizedIpProperty } : {}),
  };
}

function booleanValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
}

function ipSourceLabel(payload) {
  const broadcast = booleanValue(payload?.isBroadcast ?? payload?.is_broadcast ?? payload?.traits?.is_broadcast);
  return broadcast === null ? '' : broadcast ? '广播IP' : '原生IP';
}

function ipPropertyLabel(payload) {
  const residential = booleanValue(payload?.isResidential ?? payload?.is_residential);
  if (residential !== null) return residential ? '住宅IP' : '机房IP';
  const type = String(payload?.asn?.type || payload?.asnType || payload?.type || '').trim().toLowerCase();
  return {
    isp: '住宅IP',
    hosting: '机房IP',
    business: '机房IP',
    enterprise: '商业宽带',
    education: '教育IP',
    government: '政府IP',
  }[type] || '';
}

function parseIppureProbe(body) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body || '').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  return publicProbeResult(
    payload.ip || payload.ipAddress || payload.address,
    payload.country || payload.countryName,
    payload.countryCode || payload.country_code,
    ipSourceLabel(payload),
    ipPropertyLabel(payload),
  );
}

function parseIp111Probe(body) {
  const html = Buffer.from(body || '').toString('utf8');
  const candidates = html.match(/(?<![A-Za-z0-9])(?:\d{1,3}\.){3}\d{1,3}(?![A-Za-z0-9])/g) || [];
  const ipAddress = candidates.map((value) => normalizeIp(value)).find((value) => isPublicIp(value));
  if (!ipAddress) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
  const country = text.match(/中国香港|中国台湾|中国|美国|日本|韩国|新加坡|德国|英国|法国|加拿大|澳大利亚|俄罗斯/)?.[0] || '';
  return publicProbeResult(ipAddress, country, '');
}

function parseExitProbeResponse(body, kind) {
  return kind === 'ip111' ? parseIp111Probe(body) : parseIppureProbe(body);
}

function connectTlsSocket(socket, hostname, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let secureSocket;
    const cleanup = () => {
      clearTimeout(timer);
      if (secureSocket) {
        secureSocket.removeListener('secureConnect', onSecureConnect);
        secureSocket.removeListener('error', onError);
      }
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        if (secureSocket && typeof secureSocket.destroy === 'function') secureSocket.destroy();
        else if (socket && typeof socket.destroy === 'function') socket.destroy();
        reject(error);
      } else {
        resolve(value);
      }
    };
    const onSecureConnect = () => finish(null, secureSocket);
    const onError = (error) => finish(error);
    const onAbort = () => {
      const error = new Error('出口 IP 探测已取消');
      error.code = 'ABORT_ERR';
      finish(error);
    };
    if (signal?.aborted) return onAbort();
    timer = setTimeout(() => {
      const error = new Error(`出口 IP 探测连接超时（${timeoutMs} ms）`);
      error.code = 'ETIMEDOUT';
      finish(error);
    }, timeoutMs);
    try {
      secureSocket = tls.connect({
        socket,
        servername: hostname,
        rejectUnauthorized: true,
      });
      secureSocket.once('secureConnect', onSecureConnect);
      secureSocket.once('error', onError);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      if (secureSocket.authorized && secureSocket.readyState === 'open') queueMicrotask(onSecureConnect);
    } catch (error) {
      finish(error);
    }
  });
}

async function readHttpResponse(socket, timeoutMs, signal) {
  const reader = new SocketReader(socket, timeoutMs, signal);
  try {
    const head = await reader.readUntil('\r\n\r\n', MAX_HTTP_RESPONSE_BYTES);
    const lines = head.toString('latin1').split('\r\n');
    const statusLine = lines.shift() || '';
    const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s|$)/i.exec(statusLine);
    if (!statusMatch) throw new Error('出口 IP 探测响应格式无效');
    const headers = new Map();
    for (const line of lines) {
      const separator = line.indexOf(':');
      if (separator <= 0) continue;
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }
    const contentLength = Number(headers.get('content-length'));
    let body;
    if (Number.isSafeInteger(contentLength) && contentLength >= 0) {
      if (contentLength > MAX_HTTP_RESPONSE_BYTES) throw new Error('出口 IP 探测响应过大');
      body = await reader.readExact(contentLength);
    } else if (/chunked/i.test(headers.get('transfer-encoding') || '')) {
      const chunks = [];
      let total = 0;
      while (true) {
        const line = await reader.readUntil('\r\n', 4096);
        const sizeText = line.toString('latin1').slice(0, -2).split(';', 1)[0].trim();
        if (!/^[0-9a-f]+$/i.test(sizeText)) throw new Error('出口 IP 探测分块响应无效');
        const size = Number.parseInt(sizeText, 16);
        if (!Number.isSafeInteger(size) || total + size > MAX_HTTP_RESPONSE_BYTES) {
          throw new Error('出口 IP 探测响应过大');
        }
        if (size === 0) {
          while (true) {
            const trailer = await reader.readUntil('\r\n', 4096);
            if (trailer.length <= 2) break;
          }
          body = Buffer.concat(chunks, total);
          break;
        }
        chunks.push(await reader.readExact(size));
        total += size;
        const delimiter = await reader.readExact(2);
        if (delimiter.toString('latin1') !== '\r\n') throw new Error('出口 IP 探测分块边界无效');
      }
    } else {
      body = await reader.readToEnd(MAX_HTTP_RESPONSE_BYTES);
    }
    const status = Number(statusMatch[1]);
    if (status < 200 || status >= 300) return null;
    return body;
  } finally {
    reader.close();
  }
}

async function requestExitProbe(node, endpoint, options = {}) {
  const timeoutMs = timeoutValue(options.timeoutMs ?? options.timeout);
  const target = { host: endpoint.host, port: endpoint.port };
  const protocol = String(node?.protocol || '').toLowerCase();
  const isDirect = protocol === 'direct';
  let socket;
  try {
    if (isDirect) {
      socket = await connectSocket({ ...node, host: target.host, port: target.port, tls: false, secure: false }, options, timeoutMs, options.signal);
    } else {
      if (!['http', 'https', 'socks5'].includes(protocol)) return null;
      socket = await connectSocket(node, options, timeoutMs, options.signal);
      if (protocol === 'http' || protocol === 'https') {
        await httpConnect(socket, node, target, timeoutMs, options.signal);
      } else {
        await socks5Connect(socket, node, target, timeoutMs, options.signal);
      }
    }
    socket = await connectTlsSocket(socket, endpoint.host, timeoutMs, options.signal);
    const request = [
      `GET ${endpoint.path} HTTP/1.1`,
      `Host: ${endpoint.host}`,
      'Accept: application/json, text/html;q=0.9',
      'Connection: close',
      'User-Agent: ChromeProfileBrowser/0.1',
      '',
      '',
    ].join('\r\n');
    await writeSocket(socket, request, timeoutMs, options.signal);
    return parseExitProbeResponse(await readHttpResponse(socket, timeoutMs, options.signal), endpoint.kind);
  } finally {
    if (socket && typeof socket.destroy === 'function') socket.destroy();
  }
}

async function probeProxyExit(node, options = {}) {
  if (!node || typeof node !== 'object') return null;
  const timeoutMs = timeoutValue(options.timeoutMs ?? options.timeout);
  const deadline = Date.now() + timeoutMs;
  for (let index = 0; index < EXIT_PROBE_ENDPOINTS.length; index += 1) {
    const endpoint = EXIT_PROBE_ENDPOINTS[index];
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const attemptsLeft = EXIT_PROBE_ENDPOINTS.length - index;
    try {
      const result = await requestExitProbe(node, endpoint, {
        ...options,
        timeoutMs: Math.max(1, Math.floor(remaining / attemptsLeft)),
      });
      if (result) return result;
    } catch {
      // A secondary endpoint is intentionally tried when the primary service
      // is unavailable or blocked by the selected proxy.
    }
  }
  return null;
}

async function httpConnect(socket, node, target, timeoutMs, signal) {
  const targetAuthority = authority(target.host, target.port);
  const headers = [
    `CONNECT ${targetAuthority} HTTP/1.1`,
    `Host: ${targetAuthority}`,
    'Proxy-Connection: Keep-Alive',
  ];
  if (node.username !== undefined || node.password !== undefined) {
    const user = node.username || '';
    const password = node.password || '';
    headers.push(`Proxy-Authorization: Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`);
  }
  headers.push('', '');
  await writeSocket(socket, headers.join('\r\n'), timeoutMs, signal);
  const reader = new SocketReader(socket, timeoutMs, signal);
  try {
    const response = await reader.readUntil('\r\n\r\n', MAX_HTTP_RESPONSE_BYTES);
    const firstLine = response.toString('latin1').split('\r\n', 1)[0];
    const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s|$)/i.exec(firstLine);
    if (!match) {
      const error = new Error('HTTP 代理响应格式无效');
      error.code = 'EPROTO';
      throw error;
    }
    const statusCode = Number(match[1]);
    if (statusCode < 200 || statusCode >= 300) {
      const error = new Error(`HTTP 代理拒绝 CONNECT（${statusCode}）`);
      error.code = `HTTP_${statusCode}`;
      throw error;
    }
  } finally {
    reader.close();
  }
}

function encodeSocksAddress(host) {
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    return Buffer.concat([Buffer.from([0x01]), Buffer.from(host.split('.').map((part) => Number(part)))]);
  }
  if (ipVersion === 6) {
    // URL and net normalize IPv6 syntax, but a full parser is unnecessary for
    // the common domain case. Node's built-in address parser handles literals.
    const groups = host.split(':');
    const expanded = [];
    const gap = groups.indexOf('');
    if (gap >= 0) {
      const left = groups.slice(0, gap).filter(Boolean);
      const right = groups.slice(gap + 1).filter(Boolean);
      const missing = 8 - left.length - right.length;
      expanded.push(...left);
      for (let i = 0; i < missing; i += 1) expanded.push('0');
      expanded.push(...right);
    } else {
      expanded.push(...groups);
    }
    if (expanded.length === 8 && expanded.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) {
      const bytes = Buffer.alloc(16);
      expanded.forEach((part, index) => bytes.writeUInt16BE(parseInt(part, 16), index * 2));
      return Buffer.concat([Buffer.from([0x04]), bytes]);
    }
  }
  const domain = Buffer.from(String(host), 'utf8');
  if (!domain.length || domain.length > 255) throw new Error('SOCKS5 目标域名长度无效');
  return Buffer.concat([Buffer.from([0x03, domain.length]), domain]);
}

async function socks5Connect(socket, node, target, timeoutMs, signal) {
  const methods = node.username !== undefined || node.password !== undefined ? [0x00, 0x02] : [0x00];
  await writeSocket(socket, Buffer.from([0x05, methods.length, ...methods]), timeoutMs, signal);
  const reader = new SocketReader(socket, timeoutMs, signal);
  try {
    const greeting = await reader.readExact(2);
    if (greeting[0] !== 0x05) {
      const error = new Error('SOCKS5 版本响应无效');
      error.code = 'EPROTO';
      throw error;
    }
    if (greeting[1] === 0xff) {
      const error = new Error('SOCKS5 代理不接受认证方式');
      error.code = 'EAUTH';
      throw error;
    }
    if (greeting[1] === 0x02) {
      const username = Buffer.from(String(node.username || ''), 'utf8');
      const password = Buffer.from(String(node.password || ''), 'utf8');
      if (username.length > 255 || password.length > 255) throw new Error('SOCKS5 用户名或密码过长');
      await writeSocket(socket, Buffer.concat([Buffer.from([0x01, username.length]), username, Buffer.from([password.length]), password]), timeoutMs, signal);
      const auth = await reader.readExact(2);
      if (auth[1] !== 0x00) {
        const error = new Error('SOCKS5 用户名密码认证失败');
        error.code = 'EAUTH';
        throw error;
      }
    } else if (greeting[1] !== 0x00) {
      const error = new Error(`SOCKS5 返回了不支持的认证方式（${greeting[1]}）`);
      error.code = 'EAUTH';
      throw error;
    }

    const address = encodeSocksAddress(target.host);
    const request = Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), address, Buffer.from([(target.port >> 8) & 0xff, target.port & 0xff])]);
    await writeSocket(socket, request, timeoutMs, signal);
    const header = await reader.readExact(4);
    if (header[0] !== 0x05) {
      const error = new Error('SOCKS5 连接响应版本无效');
      error.code = 'EPROTO';
      throw error;
    }
    if (header[1] !== 0x00) {
      const error = new Error(`SOCKS5 代理拒绝连接（代码 ${header[1]}）`);
      error.code = `SOCKS5_${header[1]}`;
      throw error;
    }
    let addressLength;
    if (header[3] === 0x01) addressLength = 4;
    else if (header[3] === 0x04) addressLength = 16;
    else if (header[3] === 0x03) addressLength = (await reader.readExact(1))[0];
    else throw new Error('SOCKS5 地址类型无效');
    await reader.readExact(addressLength + 2);
  } finally {
    reader.close();
  }
}

/**
 * Check only TCP reachability and the selected proxy protocol handshake.
 * `options.connect` (or `options.socketFactory`) may be injected in tests and
 * receives connection options plus the normalized node; production uses
 * Node's net/tls implementation.
 */
async function checkProxyReachability(node, options = {}) {
  // A caller that owns a larger probe (for example a temporary core) can
  // provide its start time so the reported latency covers the whole check.
  const startedAt = Number.isFinite(options.startedAt) ? options.startedAt : monotonicNow();
  if (!node || typeof node !== 'object') return errorResult(node, 'invalid', 'validation', '节点必须是对象', startedAt);
  if (node.status === 'invalid') {
    return errorResult(node, 'invalid', 'validation', node.reason || '节点字段无效', startedAt);
  }
  if (node.supported === false || node.status === 'unsupported') {
    return errorResult(node, 'unsupported', 'validation', node.reason || '节点协议不受支持', startedAt);
  }
  const protocol = String(node.protocol || '').toLowerCase();
  const isDirect = protocol === 'direct';
  if (!isDirect && protocol !== 'http' && protocol !== 'socks5' && protocol !== 'https') {
    return errorResult(node, 'unsupported', 'validation', `协议 ${protocol || 'unknown'} 不受支持`, startedAt);
  }
  if (!isDirect && (!validHost(node.host) || validPort(node.port) === null)) {
    return errorResult(node, 'invalid', 'validation', '节点 host/port 无效', startedAt);
  }
  const hasExplicitTarget = options.target || options.targetHost || options.targetPort;
  const target = targetFromOptions(isDirect && !hasExplicitTarget
    ? { ...options, targetHost: node.host, targetPort: node.port }
    : options);
  if (!target) return errorResult(node, 'invalid', 'validation', '检查目标 host/port 无效', startedAt);
  const timeoutMs = timeoutValue(options.timeoutMs ?? options.timeout);
  let socket;
  try {
    if (isDirect) {
      socket = await connectSocket({ ...node, host: target.host, port: target.port }, options, timeoutMs, options.signal);
      const result = successResult(node, 'tcp-connect', startedAt, socket);
      if (options.probeExit) {
        delete result.ipAddress;
        Object.assign(result, await probeProxyExit(node, { ...options, timeoutMs }));
      }
      return result;
    }
    socket = await connectSocket(node, options, timeoutMs, options.signal);
    if (protocol === 'http' || protocol === 'https') {
      await httpConnect(socket, node, target, timeoutMs, options.signal);
    } else {
      await socks5Connect(socket, node, target, timeoutMs, options.signal);
    }
    const result = successResult(node, 'proxy-handshake', startedAt, socket);
    if (options.probeExit) {
      delete result.ipAddress;
      Object.assign(result, await probeProxyExit(node, { ...options, timeoutMs }));
    }
    return result;
  } catch (error) {
    const status = error && error.code === 'ABORT_ERR' ? 'aborted' : 'unreachable';
    const phase = error && error.code === 'ETIMEDOUT' ? 'timeout' : 'proxy-handshake';
    return errorResult(node, status, phase, error, startedAt);
  } finally {
    if (socket && typeof socket.destroy === 'function') socket.destroy();
  }
}

/**
 * Check a node using the most meaningful probe available to the application.
 * Plain HTTP/SOCKS5 nodes keep the full proxy-handshake probe. Core-managed
 * nodes use injected lifecycle callbacks when available so the check can pass
 * through a temporary local SOCKS5 listener instead of stopping at TCP.
 */
async function checkNodeReachability(node, options = {}) {
  if (!node || typeof node !== 'object'
    || node.supported === false || node.status === 'unsupported' || node.status === 'invalid'
    || (!node.requiresCore && !node.coreConfig)) {
    return checkProxyReachability(node, options);
  }
  const coreConfig = node.coreConfig && typeof node.coreConfig === 'object' ? node.coreConfig : {};
  const host = String(node.host || coreConfig.address || '').trim();
  const port = validPort(node.port ?? coreConfig.port);
  const startedAt = monotonicNow();
  if (!validHost(host) || port === null) {
    return errorResult(node, 'invalid', 'validation', '核心节点 host/port 无效', startedAt);
  }
  if (typeof options.startCore === 'function') {
    let runtime;
    try {
      runtime = await options.startCore(node);
      const localNode = {
        id: node.id,
        protocol: 'socks5',
        host: '127.0.0.1',
        port: validPort(runtime?.port),
        supported: true,
        status: 'supported',
      };
      if (localNode.port === null) {
        return errorResult(node, 'error', 'core-startup', '代理核心没有返回有效的本地端口', startedAt);
      }
      const result = await checkProxyReachability(localNode, {
        ...options,
        startedAt,
        target: options.target || {
          host: options.targetHost || 'example.com',
          port: options.targetPort || 80,
        },
      });
      return {
        ...result,
        // Keep the core startup and proxy handshake time in the value shown to
        // the user; the optional exit lookup is not health-check latency.
        latencyMs: Number.isFinite(result?.latencyMs) ? result.latencyMs : elapsedMs(startedAt),
        nodeId: node.id,
        protocol: node.protocol,
        host: node.host || host,
        port: node.port || port,
        phase: result.phase === 'proxy-handshake' ? 'proxy-handshake' : result.phase,
      };
    } catch (error) {
      const status = error && error.code === 'ABORT_ERR' ? 'aborted' : 'error';
      const phase = error && error.code === 'ETIMEDOUT' ? 'timeout' : 'core-startup';
      return errorResult(node, status, phase, error, startedAt);
    } finally {
      if (runtime && typeof options.cleanupCore === 'function') {
        try { await options.cleanupCore(runtime); } catch {}
      }
    }
  }
  const result = await checkProxyReachability({
    ...node,
    host,
    port,
    protocol: 'direct',
    supported: true,
    status: 'supported',
    // A core node may use TLS, REALITY, or another transport. A plain TCP
    // probe avoids claiming a protocol handshake that was not performed.
    tls: false,
  }, {
    ...options,
    probeExit: false,
    startedAt,
    targetHost: host,
    targetPort: port,
  });
  return {
    ...result,
    nodeId: node.id,
    protocol: node.protocol,
    host: node.host || host,
    port: node.port || port,
    phase: result.phase === 'tcp-connect' ? 'tcp-connect' : result.phase,
  };
}

module.exports = {
  checkNodeReachability,
  checkProxyReachability,
  parseExitProbeResponse,
  probeProxyExit,
};
