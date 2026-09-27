'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { freePort, safeCorePath, terminate, cleanupRuntime } = require('./core-manager');

const CORE_TIMEOUT_MS = 8000;
const SECRET_CONFIG_KEYS = new Set(['uuid', 'password', 'public_key', 'short_id', 'client_metadata']);

function omitUndefined(value) {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== '')
    .map(([key, item]) => [key, omitUndefined(item)]));
}

function buildTls(coreConfig, forceEnabled = false) {
  const reality = coreConfig.security === 'reality' || Boolean(coreConfig.publicKey || coreConfig.shortId);
  const enabled = forceEnabled || Boolean(coreConfig.tls) || reality;
  if (!enabled) return undefined;
  const tls = {
    enabled: true,
    server_name: coreConfig.sni || undefined,
    insecure: Boolean(coreConfig.allowInsecure),
    alpn: Array.isArray(coreConfig.alpn) && coreConfig.alpn.length ? coreConfig.alpn : undefined,
  };
  if (coreConfig.fingerprint) {
    tls.utls = { enabled: true, fingerprint: coreConfig.fingerprint };
  }
  if (reality) {
    tls.reality = {
      enabled: true,
      public_key: coreConfig.publicKey || undefined,
      short_id: coreConfig.shortId || undefined,
    };
  }
  return tls;
}

function buildTransport(coreConfig) {
  const network = String(coreConfig.network || 'tcp').toLowerCase();
  if (network === 'tcp') return undefined;
  if (network === 'ws') {
    return {
      type: 'ws',
      path: coreConfig.path || '/',
      headers: coreConfig.host ? { Host: coreConfig.host } : undefined,
    };
  }
  if (network === 'grpc') {
    return { type: 'grpc', service_name: coreConfig.serviceName || undefined, idle_timeout: '15s' };
  }
  if (network === 'httpupgrade') {
    return { type: 'httpupgrade', path: coreConfig.path || '/', host: coreConfig.host || undefined };
  }
  throw new Error(`sing-box 暂不支持 ${network} 传输方式`);
}

function buildSingboxOutbound(node) {
  if (!node || !node.coreConfig) throw new Error('节点不包含可用的核心配置');
  const c = node.coreConfig;
  const base = {
    tag: 'proxy',
    server: c.address,
    server_port: c.port,
  };
  if (c.type === 'vmess') {
    return {
      type: 'vmess',
      ...base,
      uuid: c.uuid,
      security: c.security && c.security !== 'auto' ? c.security : 'auto',
      alter_id: Number.isInteger(c.alterId) ? c.alterId : 0,
      tls: buildTls(c),
      transport: buildTransport(c),
    };
  }
  if (c.type === 'vless') {
    return {
      type: 'vless',
      ...base,
      uuid: c.uuid,
      flow: c.flow || undefined,
      tls: buildTls(c),
      transport: buildTransport(c),
    };
  }
  if (c.type === 'trojan') {
    return {
      type: 'trojan',
      ...base,
      password: c.password,
      tls: buildTls(c, true),
      transport: buildTransport(c),
    };
  }
  if (c.type === 'anytls') {
    return {
      type: 'anytls',
      ...base,
      password: c.password,
      idle_session_check_interval: c.idleSessionCheckInterval || undefined,
      idle_session_timeout: c.idleSessionTimeout || undefined,
      min_idle_session: Number.isInteger(c.minIdleSession) ? c.minIdleSession : undefined,
      client_metadata: c.clientMetadata || undefined,
      // AnyTLS always requires TLS; sing-box rejects an outbound without it.
      tls: buildTls({ ...c, tls: true }, true),
    };
  }
  if (c.type === 'shadowsocks' || c.type === 'ss') {
    return {
      type: 'shadowsocks',
      ...base,
      method: c.method,
      password: c.password,
    };
  }
  throw new Error(`sing-box 不支持的核心协议：${c.type}`);
}

function buildSingboxConfig(node, port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('本地核心端口无效');
  const outbound = omitUndefined(buildSingboxOutbound(node));
  return {
    log: { level: 'warn' },
    inbounds: [{
      type: 'mixed',
      tag: 'local-in',
      listen: '127.0.0.1',
      listen_port: port,
    }],
    outbounds: [outbound, { type: 'direct', tag: 'direct' }],
    route: { final: 'proxy' },
  };
}

function waitForPort(port, timeoutMs = CORE_TIMEOUT_MS) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = require('node:net').connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) reject(new Error('sing-box 未能监听本地端口'));
        else setTimeout(probe, 80);
      });
    };
    probe();
  });
}

function validateSingboxConfig(executable, configPath, timeoutMs = CORE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(executable, ['check', '-c', configPath], { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        let detail = [stderr, stdout]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .join('\n')
          .replace(/\s+/g, ' ')
          .trim();
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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
          detail = [...new Set(secrets)].sort((left, right) => right.length - left.length)
            .reduce((text, secret) => text.split(secret).join('[已隐藏]'), detail);
        } catch {}
        const fallback = error.code === 'ETIMEDOUT' ? '校验超时' : '核心进程拒绝了配置';
        const validationError = new Error(`sing-box 核心配置校验失败：${(detail || fallback).slice(0, 1200)}`);
        if (error.code !== undefined) validationError.code = error.code;
        reject(validationError);
      }
      else resolve();
    });
  });
}

async function startSingbox({ profileId, node, executable, rootDir, validate = true }) {
  const corePath = safeCorePath(executable);
  if (!corePath) throw new Error('sing-box 核心路径不存在');
  const port = await freePort();
  const dir = path.join(rootDir, 'core', 'singbox', profileId);
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(configPath, `${JSON.stringify(buildSingboxConfig(node, port), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (validate) {
    try {
      await validateSingboxConfig(corePath, configPath);
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
    cleanupRuntime({ configPath });
    throw error;
  }
  return { child, port, configPath, core: 'singbox' };
}

module.exports = {
  buildSingboxConfig,
  buildSingboxOutbound,
  startSingbox,
  validateSingboxConfig,
};
