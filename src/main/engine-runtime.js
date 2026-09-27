'use strict';

const fs = require('node:fs');
const path = require('node:path');

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateEnginePath(value, options = {}) {
  const candidate = safeText(value);
  if (!candidate) return '';
  const fsImpl = options.fsImpl || fs;
  const pathImpl = options.pathImpl || path;
  const platform = options.platform || process.platform;
  if (!pathImpl.isAbsolute(candidate)) throw new Error('外部 Chromium 路径必须是绝对路径');
  let stat;
  try {
    stat = fsImpl.statSync(candidate);
  } catch {
    throw new Error('外部 Chromium 路径不存在');
  }
  if (platform === 'darwin' && stat.isDirectory() && pathImpl.extname(candidate).toLowerCase() === '.app') {
    const bundleName = pathImpl.basename(candidate, '.app');
    const executable = pathImpl.join(candidate, 'Contents', 'MacOS', bundleName);
    try {
      if (fsImpl.statSync(executable).isFile()) return executable;
    } catch {
      // Fall through to the common invalid-path error.
    }
  }
  if (!stat.isFile()) throw new Error('外部 Chromium 路径必须指向可执行文件');
  return candidate;
}

function buildExternalEngineArgs({ profileDataPath, startUrl, proxyArg, extensionPaths = [] }) {
  const args = [
    `--user-data-dir=${profileDataPath}`,
    '--no-first-run',
    '--no-default-browser-check',
    startUrl,
  ];
  const paths = extensionPaths.filter((item) => typeof item === 'string' && item.trim());
  if (paths.some((item) => item.includes(','))) {
    throw new Error('外部 Chromium 插件路径不能包含逗号');
  }
  if (paths.length) args.unshift(`--load-extension=${paths.join(',')}`);
  if (proxyArg) {
    // Fixed proxy sessions must not let WebRTC or QUIC open a direct path.
    args.unshift(
      '--disable-quic',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      `--proxy-server=${proxyArg}`,
    );
  }
  return args;
}

function sameEnginePath(left, right, platform = process.platform) {
  const first = safeText(left);
  const second = safeText(right);
  if (!first || !second) return first === second;
  const normalized = (value) => path.resolve(value).replace(/[\\/]+$/, '');
  const leftPath = normalized(first);
  const rightPath = normalized(second);
  return platform === 'win32' ? leftPath.toLowerCase() === rightPath.toLowerCase() : leftPath === rightPath;
}

function waitForProcessSpawn(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('外部 Chromium 启动超时')), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      child.removeListener('spawn', onSpawn);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onSpawn = () => finish();
    const onError = (error) => finish(new Error(error?.message || '外部 Chromium 启动失败'));
    const onExit = (code, signal) => finish(new Error(`外部 Chromium 在启动阶段退出（${signal || `代码 ${code ?? '未知'}`}）`));
    child.once('spawn', onSpawn);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

module.exports = {
  buildExternalEngineArgs,
  sameEnginePath,
  validateEnginePath,
  waitForProcessSpawn,
};
