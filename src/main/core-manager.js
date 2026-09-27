'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');

const CORE_TIMEOUT_MS = 8000;
const SECRET_CONFIG_KEYS = new Set(['id', 'uuid', 'password', 'publicKey', 'shortId', 'spiderX']);

function safeCorePath(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || !path.isAbsolute(candidate)) return '';
  try { return fs.statSync(candidate).isFile() ? candidate : ''; } catch { return ''; }
}

function waitForPort(port, timeoutMs = CORE_TIMEOUT_MS) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) reject(new Error('代理核心未能监听本地端口'));
        else setTimeout(probe, 80);
      });
    };
    probe();
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function buildXrayConfig(node, port) {
  if (!node || node.supported === false || !node.coreConfig) throw new Error('节点不包含可用的核心配置');
  const c = node.coreConfig;
  const security = String(c.securityLayer || c.security || 'none').toLowerCase();
  const tlsEnabled = Boolean(c.tls) || security === 'tls' || security === 'reality';
  const streamSettings = {
    network: c.network || 'tcp',
    security,
    // Xray 26.3.27 removed allowInsecure; emitting it makes the whole config invalid.
    tlsSettings: tlsEnabled ? {
      serverName: c.sni || undefined,
      alpn: Array.isArray(c.alpn) && c.alpn.length ? c.alpn : undefined,
      fingerprint: c.fingerprint || undefined,
    } : undefined,
  };
  if (streamSettings.network === 'ws') {
    streamSettings.wsSettings = { path: c.path || '/', headers: c.host ? { Host: c.host } : undefined };
  } else if (streamSettings.network === 'http') {
    streamSettings.httpSettings = { path: c.path || '/', host: c.host ? [c.host] : undefined };
  } else if (streamSettings.network === 'httpupgrade') {
    streamSettings.httpupgradeSettings = { path: c.path || '/', host: c.host || undefined };
  } else if (streamSettings.network === 'xhttp') {
    streamSettings.xhttpSettings = { path: c.path || '/', host: c.host || undefined, mode: c.mode || undefined };
  }
  if (streamSettings.network === 'grpc') streamSettings.grpcSettings = { serviceName: c.serviceName || '', authority: c.authority || undefined };
  if (streamSettings.security === 'reality') {
    streamSettings.realitySettings = {
      serverName: c.sni || '',
      fingerprint: c.fingerprint || 'chrome',
      publicKey: c.publicKey || '',
      shortId: c.shortId || '',
      spiderX: c.spiderX || '',
    };
    delete streamSettings.tlsSettings;
  }
  Object.keys(streamSettings).forEach((key) => {
    if (streamSettings[key] === undefined) delete streamSettings[key];
  });
  const outbound = { protocol: c.type === 'shadowsocks' ? 'shadowsocks' : c.type, settings: {} };
  if (c.type === 'vmess') {
    outbound.settings.vnext = [{ address: c.address, port: c.port, users: [{ id: c.uuid, alterId: c.alterId || 0, security: c.security || 'auto' }] }];
  } else if (c.type === 'vless') {
    outbound.settings.vnext = [{ address: c.address, port: c.port, users: [{ id: c.uuid, encryption: c.encryption || 'none', flow: c.flow || undefined }] }];
  } else if (c.type === 'trojan') {
    outbound.settings.servers = [{ address: c.address, port: c.port, password: c.password }];
  } else if (c.type === 'shadowsocks') {
    outbound.settings.servers = [{ address: c.address, port: c.port, method: c.method, password: c.password }];
    delete streamSettings.network;
    delete streamSettings.security;
  } else if (c.type === 'anytls') {
    throw new Error('AnyTLS 需要使用 sing-box 核心；当前 Xray 核心不提供 AnyTLS outbound');
  } else throw new Error(`不支持的核心协议：${c.type}`);
  if (Object.keys(streamSettings).length && c.type !== 'shadowsocks') outbound.streamSettings = streamSettings;
  return {
    log: { loglevel: 'warning' },
    inbounds: [{ listen: '127.0.0.1', port, protocol: 'socks', settings: { auth: 'noauth', udp: true } }],
    outbounds: [outbound, { protocol: 'freedom', tag: 'direct' }],
  };
}

function terminate(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
  } else child.kill();
}

function cleanupRuntime(runtime) {
  if (!runtime?.configPath) return;
  try { fs.rmSync(runtime.configPath, { force: true }); } catch { /* Best-effort cleanup after process exit. */ }
}

function redactConfigSecrets(detail, configPath) {
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return detail; }
  const secrets = [];
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_CONFIG_KEYS.has(key) && typeof item === 'string' && item.length >= 4) secrets.push(item);
      visit(item);
    }
  };
  visit(config);
  return [...new Set(secrets)].sort((left, right) => right.length - left.length)
    .reduce((text, secret) => text.split(secret).join('[已隐藏]'), detail);
}

function commandDiagnostic(stdout, stderr, fallback, configPath) {
  const detail = redactConfigSecrets([stderr, stdout]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim(), configPath);
  return detail ? detail.slice(0, 1200) : fallback;
}

function validateConfig(executable, configPath, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    execFile(executable, ['run', '-test', '-c', configPath], { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const diagnostic = commandDiagnostic(stdout, stderr, error.code === 'ETIMEDOUT' ? '校验超时' : '核心进程拒绝了配置', configPath);
        const validationError = new Error(`Xray 核心配置校验失败：${diagnostic}`);
        if (error.code !== undefined) validationError.code = error.code;
        reject(validationError);
      }
      else resolve();
    });
  });
}

async function startCore({ profileId, node, executable, rootDir, validate = true }) {
  const corePath = safeCorePath(executable);
  if (!corePath) throw new Error('Xray 核心路径不存在，请在设置中指定可执行文件');
  const port = await freePort();
  const dir = path.join(rootDir, 'core', profileId);
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, 'config.json');
  const config = buildXrayConfig(node, port);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (validate) {
    try {
      await validateConfig(corePath, configPath);
    } catch (error) {
      cleanupRuntime({ configPath });
      throw error;
    }
  }
  const child = spawn(corePath, ['run', '-c', configPath], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
  try {
    await waitForPort(port);
  } catch (error) {
    terminate(child);
    try { fs.rmSync(configPath, { force: true }); } catch { /* Best-effort cleanup. */ }
    throw error;
  }
  return { child, port, configPath };
}

module.exports = { buildXrayConfig, cleanupRuntime, freePort, safeCorePath, startCore, terminate, validateConfig };
