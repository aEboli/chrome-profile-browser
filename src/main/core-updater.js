'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { APP_VERSION } = require('./version');

const RELEASE_APIS = Object.freeze({
  xray: 'https://api.github.com/repos/XTLS/Xray-core/releases/latest',
  singbox: 'https://api.github.com/repos/SagerNet/sing-box/releases/latest',
});
const RELEASE_API = RELEASE_APIS.xray;
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024;
const MAX_REDIRECTS = 4;

function normalizeCoreKind(core) {
  return ['singbox', 'sing-box', 'sing_box'].includes(String(core || '').trim().toLowerCase()) ? 'singbox' : 'xray';
}

function compareVersions(left, right) {
  const parse = (value) => String(value || '').match(/\d+/g)?.map(Number) || [];
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta) return delta > 0 ? 1 : -1;
  }
  return 0;
}

function assetName(platform = process.platform, arch = process.arch, core = 'xray') {
  const kind = normalizeCoreKind(core);
  if (kind === 'singbox') {
    if (platform === 'win32') return arch === 'arm64' ? 'sing-box-${VERSION}-windows-arm64.zip' : arch === 'ia32' ? 'sing-box-${VERSION}-windows-386.zip' : 'sing-box-${VERSION}-windows-amd64.zip';
    if (platform === 'darwin') return arch === 'arm64' ? 'sing-box-${VERSION}-darwin-arm64.tar.gz' : 'sing-box-${VERSION}-darwin-amd64.tar.gz';
    if (platform === 'linux') return arch === 'arm64' ? 'sing-box-${VERSION}-linux-arm64.tar.gz' : 'sing-box-${VERSION}-linux-amd64.tar.gz';
    throw new Error(`暂不支持自动安装 sing-box 的平台：${platform}/${arch}`);
  }
  if (platform === 'win32') return arch === 'arm64' ? 'Xray-windows-arm64-v8a.zip' : arch === 'ia32' ? 'Xray-windows-32.zip' : 'Xray-windows-64.zip';
  if (platform === 'darwin') return arch === 'arm64' ? 'Xray-macos-arm64-v8a.zip' : 'Xray-macos-64.zip';
  if (platform === 'linux') return arch === 'arm64' ? 'Xray-linux-arm64-v8a.zip' : arch === 'ia32' ? 'Xray-linux-32.zip' : 'Xray-linux-64.zip';
  throw new Error(`暂不支持自动安装 Xray 的平台：${platform}/${arch}`);
}

function assertGithubUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('核心下载地址不是受信任的 GitHub HTTPS 地址');
  }
  return url;
}

async function fetchResponse(url, options = {}, fetchImpl = globalThis.fetch) {
  let current = assertGithubUrl(url);
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(current, { ...options, redirect: 'manual' });
    const location = response.headers?.get?.('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (redirects >= MAX_REDIRECTS) throw new Error('核心下载重定向次数过多');
      current = assertGithubUrl(new URL(location, current).toString());
      continue;
    }
    return response;
  }
}

async function readLimited(response, maxBytes = MAX_DOWNLOAD_BYTES) {
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > maxBytes) throw new Error('核心下载文件超过大小限制');
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('核心下载文件超过大小限制');
    return buffer;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('核心下载文件超过大小限制');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

function parseDigest(text) {
  const match = String(text || '').match(/\b([a-f0-9]{64})\b/i);
  return match ? match[1].toLowerCase() : '';
}

function safeZipPath(name) {
  const value = String(name || '').replace(/\\/g, '/');
  if (!value || value.startsWith('/') || /^[A-Za-z]:\//.test(value)) return '';
  const parts = value.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) return '';
  return parts.join(path.sep);
}

function extractZip(buffer, destination, maxBytes = MAX_EXTRACTED_BYTES, maxEntries = 2048) {
  let eocd = -1;
  const start = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('核心压缩包缺少 ZIP 目录');
  const entries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries > maxEntries || directoryOffset + directorySize > buffer.length) throw new Error('核心压缩包目录无效');
  fs.mkdirSync(destination, { recursive: true });
  let offset = directoryOffset;
  let extracted = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('核心压缩包条目无效');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const relative = safeZipPath(rawName);
    if (!relative) throw new Error('核心压缩包包含不安全路径');
    offset += 46 + nameLength + extraLength + commentLength;
    if (rawName.endsWith('/')) continue;
    if (uncompressedSize > maxBytes || localOffset + 30 > buffer.length) throw new Error('核心压缩包条目过大');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('核心压缩包本地条目无效');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error('核心压缩包数据不完整');
    let content;
    if (method === 0) content = buffer.subarray(dataStart, dataEnd);
    else if (method === 8) content = zlib.inflateRawSync(buffer.subarray(dataStart, dataEnd));
    else throw new Error('核心压缩包使用了不支持的压缩方式');
    if (content.length !== uncompressedSize) throw new Error('核心压缩包条目大小校验失败');
    extracted += content.length;
    if (extracted > maxBytes) throw new Error('核心解压内容超过大小限制');
    const target = path.resolve(destination, relative);
    const relativeTarget = path.relative(path.resolve(destination), target);
    if (relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) throw new Error('核心压缩包路径越界');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { mode: 0o700 });
  }
}

function executableName(platform = process.platform, core = 'xray') {
  const kind = normalizeCoreKind(core);
  if (kind === 'singbox') return platform === 'win32' ? 'sing-box.exe' : 'sing-box';
  return platform === 'win32' ? 'xray.exe' : 'xray';
}

function findExtractedExecutable(rootDir, filename) {
  const matches = [];
  const visit = (directory) => {
    if (matches.length > 1) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) matches.push(target);
      if (matches.length > 1) return;
    }
  };
  visit(rootDir);
  if (matches.length !== 1) throw new Error('核心压缩包中未找到唯一的可执行文件');
  return matches[0];
}

async function installLatestCore({ baseDir, core = 'xray', platform = process.platform, arch = process.arch, fetchImpl = globalThis.fetch } = {}) {
  if (!baseDir) throw new Error('核心安装目录无效');
  const kind = normalizeCoreKind(core);
  const metadata = await fetchLatestCoreRelease({ core: kind, fetchImpl });
  const template = assetName(platform, arch, kind);
  const versionToken = String(metadata.tag_name || '').replace(/^v/i, '');
  const name = kind === 'singbox' ? template.replace('${VERSION}', versionToken) : template;
  const asset = Array.isArray(metadata.assets) ? metadata.assets.find((item) => item.name === name) : null;
  const digestAsset = Array.isArray(metadata.assets) ? metadata.assets.find((item) => item.name === `${name}.dgst`) : null;
  if (!asset?.browser_download_url || (kind === 'xray' && !digestAsset?.browser_download_url)) throw new Error('官方版本缺少当前平台的校验文件');
  const archiveResponse = await fetchResponse(asset.browser_download_url, {}, fetchImpl);
  if (!archiveResponse.ok) throw new Error(`核心下载失败：HTTP ${archiveResponse.status}`);
  const archive = await readLimited(archiveResponse);
  let expected = parseDigest(asset.digest);
  if (kind === 'xray') {
    const digestResponse = await fetchResponse(digestAsset.browser_download_url, {}, fetchImpl);
    if (!digestResponse.ok) throw new Error(`核心校验文件下载失败：HTTP ${digestResponse.status}`);
    expected = parseDigest((await readLimited(digestResponse, 64 * 1024)).toString('utf8'));
  }
  if (!expected) throw new Error('官方校验文件格式无法识别');
  const actual = crypto.createHash('sha256').update(archive).digest('hex');
  if (actual !== expected) throw new Error('核心 SHA-256 校验失败');
  const version = String(metadata.tag_name || '').replace(/[^A-Za-z0-9._-]/g, '_');
  if (!version) throw new Error('官方版本号无效');
  const versionDir = path.join(baseDir, 'cores', kind, version);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `chrome-profile-${kind}-`));
  try {
    extractZip(archive, tempDir);
    const executable = findExtractedExecutable(tempDir, executableName(platform, kind));
    fs.mkdirSync(versionDir, { recursive: true });
    // Official archives may place the executable in a versioned directory and
    // include sidecar DLL/data files required at runtime.
    fs.cpSync(path.dirname(executable), versionDir, { recursive: true, force: true });
    const target = path.join(versionDir, executableName(platform, kind));
    if (!fs.existsSync(target)) throw new Error('核心文件复制后未找到可执行文件');
    if (platform !== 'win32') fs.chmodSync(target, 0o700);
    fs.writeFileSync(path.join(versionDir, 'version.json'), JSON.stringify({ version: metadata.tag_name, core: kind, asset: name, sha256: actual, installedAt: new Date().toISOString() }, null, 2));
    return { version: metadata.tag_name, path: target, sha256: actual, asset: name };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function fetchLatestCoreRelease({ core = 'xray', fetchImpl = globalThis.fetch } = {}) {
  const kind = normalizeCoreKind(core);
  const response = await fetchResponse(RELEASE_APIS[kind], {
    headers: {
      'user-agent': `ChromeProfileBrowser-core-updater/${APP_VERSION}`,
      accept: 'application/vnd.github+json',
    },
  }, fetchImpl);
  if (!response.ok) throw new Error(`核心版本查询失败：HTTP ${response.status}`);
  const metadata = JSON.parse((await readLimited(response, 2 * 1024 * 1024)).toString('utf8'));
  if (!metadata || typeof metadata !== 'object' || !String(metadata.tag_name || '').trim()) {
    throw new Error('官方核心版本号缺失');
  }
  return metadata;
}

async function checkLatestCore({ core = 'xray', currentVersion = '', fetchImpl = globalThis.fetch } = {}) {
  const kind = normalizeCoreKind(core);
  const metadata = await fetchLatestCoreRelease({ core: kind, fetchImpl });
  const latestVersion = String(metadata.tag_name || '').trim();
  const installedVersion = String(currentVersion || '').trim();
  return {
    core: kind,
    currentVersion: installedVersion,
    latestVersion,
    updateAvailable: Boolean(installedVersion) && compareVersions(latestVersion, installedVersion) > 0,
    releaseUrl: typeof metadata.html_url === 'string' ? metadata.html_url : '',
    publishedAt: typeof metadata.published_at === 'string' ? metadata.published_at : '',
  };
}

module.exports = {
  RELEASE_APIS,
  RELEASE_API,
  assetName,
  checkLatestCore,
  compareVersions,
  extractZip,
  fetchLatestCoreRelease,
  findExtractedExecutable,
  installLatestCore,
  normalizeCoreKind,
  parseDigest,
  safeZipPath,
};
