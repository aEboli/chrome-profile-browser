'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compareVersions, extractZip, findExtractedExecutable } = require('./core-updater');

const BROWSER_RELEASE_URL = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 420 * 1024 * 1024;
const MAX_EXTRACT_BYTES = 700 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TRUSTED_HOSTS = new Set(['googlechromelabs.github.io', 'storage.googleapis.com']);

function browserPlatform(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') {
    if (arch === 'arm64') return 'win-arm64';
    if (arch === 'ia32') return 'win32';
    return 'win64';
  }
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux64';
  throw new Error(`暂不支持自动安装 Chromium 的平台：${platform}/${arch}`);
}

function trustedUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('浏览器内核下载地址无效');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !TRUSTED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('浏览器内核下载地址不是受信任的官方 HTTPS 地址');
  }
  return url;
}

async function readLimited(response, maxBytes) {
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > maxBytes) throw new Error('浏览器内核下载文件超过大小限制');
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('浏览器内核下载文件超过大小限制');
    return buffer;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('浏览器内核下载文件超过大小限制');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

async function fetchTrusted(value, options = {}, fetchImpl = globalThis.fetch) {
  let current = trustedUrl(value);
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(current, { ...options, redirect: 'manual' });
    const location = response.headers?.get?.('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (redirects >= MAX_REDIRECTS) throw new Error('浏览器内核下载重定向次数过多');
      current = trustedUrl(new URL(location, current).toString());
      continue;
    }
    return { response, url: current.toString() };
  }
}

function findChromeDownload(metadata, platform, arch) {
  const channel = metadata?.channels?.Stable || metadata?.channels?.stable;
  const downloads = Array.isArray(channel?.downloads?.chrome) ? channel.downloads.chrome : [];
  const platformName = browserPlatform(platform, arch);
  const item = downloads.find((candidate) => candidate?.platform === platformName && candidate?.url);
  if (!item) throw new Error(`官方稳定版未提供当前平台的 Chromium 下载包（${platformName}）`);
  return {
    version: String(channel?.version || '').trim(),
    url: trustedUrl(item.url).toString(),
    platform: platformName,
  };
}

function safeVersion(value) {
  const version = String(value || '').trim().replace(/[^A-Za-z0-9._-]/g, '_');
  if (!version || version === '.' || version === '..') throw new Error('官方 Chromium 版本号无效');
  return version;
}

async function fetchLatestBrowserRelease({ platform = process.platform, arch = process.arch, fetchImpl = globalThis.fetch } = {}) {
  const metadataResponse = await fetchTrusted(BROWSER_RELEASE_URL, {
    headers: { accept: 'application/json', 'user-agent': 'ChromeProfileBrowser-browser-updater' },
  }, fetchImpl);
  if (!metadataResponse.response.ok) throw new Error(`浏览器内核版本查询失败：HTTP ${metadataResponse.response.status}`);
  const metadata = JSON.parse((await readLimited(metadataResponse.response, MAX_METADATA_BYTES)).toString('utf8'));
  const download = findChromeDownload(metadata, platform, arch);
  if (!download.version) throw new Error('官方 Chromium 版本号缺失');
  return download;
}

async function checkLatestBrowser({ currentVersion = '', platform = process.platform, arch = process.arch, fetchImpl = globalThis.fetch } = {}) {
  const download = await fetchLatestBrowserRelease({ platform, arch, fetchImpl });
  const installedVersion = String(currentVersion || '').trim();
  return {
    currentVersion: installedVersion,
    latestVersion: download.version,
    updateAvailable: Boolean(installedVersion) && compareVersions(download.version, installedVersion) > 0,
    platform: download.platform,
    url: download.url,
  };
}

async function installLatestBrowser({
  baseDir,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!baseDir) throw new Error('浏览器内核安装目录无效');
  const download = await fetchLatestBrowserRelease({ platform, arch, fetchImpl });
  if (!download.url.toLowerCase().endsWith('.zip')) {
    throw new Error('当前平台的 Chromium 安装包格式暂不支持');
  }
  const archiveResponse = await fetchTrusted(download.url, {
    headers: { 'user-agent': 'ChromeProfileBrowser-browser-updater' },
  }, fetchImpl);
  if (!archiveResponse.response.ok) throw new Error(`浏览器内核下载失败：HTTP ${archiveResponse.response.status}`);
  const archive = await readLimited(archiveResponse.response, MAX_DOWNLOAD_BYTES);
  const sha256 = crypto.createHash('sha256').update(archive).digest('hex');
  const version = safeVersion(download.version);
  const root = path.resolve(baseDir, 'browsers', 'chrome');
  const versionDir = path.join(root, version);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  try {
    extractZip(archive, tempDir, MAX_EXTRACT_BYTES, 100000);
    const executableName = platform === 'win32' ? 'chrome.exe' : 'chrome';
    const executable = findExtractedExecutable(tempDir, executableName);
    fs.mkdirSync(versionDir, { recursive: true });
    fs.cpSync(path.dirname(executable), versionDir, { recursive: true, force: true });
    const target = path.join(versionDir, executableName);
    if (!fs.existsSync(target)) throw new Error('Chromium 文件复制后未找到可执行文件');
    if (platform !== 'win32') fs.chmodSync(target, 0o700);
    fs.writeFileSync(path.join(versionDir, 'version.json'), JSON.stringify({
      version: download.version,
      platform: download.platform,
      downloadUrl: download.url,
      sha256,
      installedAt: new Date().toISOString(),
    }, null, 2));
    return { version: download.version, path: target, sha256, platform: download.platform, url: download.url };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  BROWSER_RELEASE_URL,
  browserPlatform,
  checkLatestBrowser,
  fetchLatestBrowserRelease,
  findChromeDownload,
  installLatestBrowser,
  trustedUrl,
};
