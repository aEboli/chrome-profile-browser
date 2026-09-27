'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { extractZip } = require('./core-updater');

const MAX_EXTENSION_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_EXTENSION_ICON_BYTES = 256 * 1024;
const CHROME_WEB_STORE_UPDATE_URL = 'https://clients2.google.com/service/update2/crx';
const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const CHROME_WEB_STORE_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
]);

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeUpdateUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

// Chrome encodes an extension ID from the SHA-256 digest of its public key.
function extensionIdFromPublicKey(publicKey) {
  if (!Buffer.isBuffer(publicKey) || publicKey.length < 16) return '';
  const digest = crypto.createHash('sha256').update(publicKey).digest();
  let result = '';
  for (const byte of digest.subarray(0, 16)) {
    result += String.fromCharCode(97 + ((byte >> 4) & 0x0f));
    result += String.fromCharCode(97 + (byte & 0x0f));
  }
  return result;
}

function extensionIdFromManifestKey(value) {
  const encoded = text(value).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return '';
  try {
    return extensionIdFromPublicKey(Buffer.from(encoded, 'base64'));
  } catch {
    return '';
  }
}

function isChromeExtensionId(value) {
  return CHROME_EXTENSION_ID_PATTERN.test(text(value).toLowerCase());
}

function chromeWebStoreUpdateUrl(extensionId) {
  return isChromeExtensionId(extensionId) ? CHROME_WEB_STORE_UPDATE_URL : '';
}

function normalizeChromeWebStoreExtensionId(source) {
  const raw = text(source).toLowerCase();
  if (isChromeExtensionId(raw)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !CHROME_WEB_STORE_HOSTS.has(url.hostname.toLowerCase())
  ) return '';
  const segments = url.pathname.split('/').filter(Boolean);
  const host = url.hostname.toLowerCase();
  if (host === 'chromewebstore.google.com' && segments[0]?.toLowerCase() !== 'detail') return '';
  if (host === 'chrome.google.com' && (segments[0]?.toLowerCase() !== 'webstore' || segments[1]?.toLowerCase() !== 'detail')) return '';
  return segments.find((segment) => isChromeExtensionId(segment)) || '';
}

function chromeWebStoreDownloadUrl(extensionId, productVersion = '') {
  const normalizedId = text(extensionId).toLowerCase();
  if (!isChromeExtensionId(normalizedId)) return '';
  const url = new URL(CHROME_WEB_STORE_UPDATE_URL);
  url.searchParams.set('response', 'redirect');
  const version = text(productVersion);
  if (version) url.searchParams.set('prodversion', version);
  url.searchParams.set('x', `id=${normalizedId}&installsource=ondemand&uc`);
  return url.toString();
}

function readProtoVarint(buffer, offset) {
  let value = 0;
  let shift = 0;
  for (let index = offset; index < buffer.length && shift <= 63; index += 1) {
    const byte = buffer[index];
    value += (byte & 0x7f) * (2 ** shift);
    if (!(byte & 0x80)) return { value, offset: index + 1 };
    shift += 7;
  }
  return null;
}

function crx3PublicKeys(header) {
  const keys = [];
  let offset = 0;
  while (offset < header.length) {
    const tag = readProtoVarint(header, offset);
    if (!tag) break;
    offset = tag.offset;
    const field = Math.floor(tag.value / 8);
    const wireType = tag.value % 8;
    if (wireType === 2) {
      const length = readProtoVarint(header, offset);
      if (!length) break;
      offset = length.offset;
      const end = offset + length.value;
      if (end > header.length) break;
      if (field === 2 || field === 3) {
        let proofOffset = offset;
        while (proofOffset < end) {
          const proofTag = readProtoVarint(header, proofOffset);
          if (!proofTag) break;
          proofOffset = proofTag.offset;
          const proofLength = readProtoVarint(header, proofOffset);
          if (proofTag.value % 8 !== 2 || !proofLength) break;
          proofOffset = proofLength.offset;
          const proofEnd = proofOffset + proofLength.value;
          if (proofEnd > end) break;
          if (Math.floor(proofTag.value / 8) === 1) keys.push(header.subarray(proofOffset, proofEnd));
          proofOffset = proofEnd;
        }
      }
      offset = end;
      continue;
    }
    if (wireType === 0) {
      const value = readProtoVarint(header, offset);
      if (!value) break;
      offset = value.offset;
      continue;
    }
    if (wireType === 1) {
      offset += 8;
      continue;
    }
    if (wireType === 5) {
      offset += 4;
      continue;
    }
    break;
  }
  return keys;
}

function extensionIdFromArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 || buffer.subarray(0, 4).toString('ascii') !== 'Cr24') return '';
  const version = buffer.readUInt32LE(4);
  if (version === 2) {
    const publicKeyLength = buffer.readUInt32LE(8);
    const signatureLength = buffer.readUInt32LE(12);
    const publicKeyEnd = 16 + publicKeyLength;
    const signatureEnd = publicKeyEnd + signatureLength;
    if (!publicKeyLength || signatureEnd > buffer.length) return '';
    return extensionIdFromPublicKey(buffer.subarray(16, publicKeyEnd));
  }
  if (version !== 3) return '';
  const headerSize = buffer.readUInt32LE(8);
  const headerEnd = 12 + headerSize;
  if (!headerSize || headerEnd > buffer.length) return '';
  for (const publicKey of crx3PublicKeys(buffer.subarray(12, headerEnd))) {
    const extensionId = extensionIdFromPublicKey(publicKey);
    if (extensionId) return extensionId;
  }
  return '';
}

function compareVersions(left, right) {
  const parse = (value) => String(value || '').split(/[.-]/).map((part) => {
    const number = Number(part);
    return Number.isFinite(number) ? number : 0;
  });
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta) return delta > 0 ? 1 : -1;
  }
  return 0;
}

function normalizeProfileIds(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source
    .map((item) => String(item ?? '').trim())
    .filter(Boolean))];
}

function toggleProfileId(profileIds, profileId, enabled) {
  const next = new Set(normalizeProfileIds(profileIds));
  const normalizedId = String(profileId ?? '').trim();
  if (!normalizedId) return [...next];
  if (enabled) next.add(normalizedId);
  else next.delete(normalizedId);
  return [...next];
}

function xmlUnescape(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function xmlAttributes(source) {
  const attributes = {};
  const pattern = /(?:^|\s)([A-Za-z_][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = pattern.exec(source))) attributes[match[1]] = xmlUnescape(match[3]);
  return attributes;
}

function parseUpdateManifest(xml, baseUrl, extensionId = '') {
  const source = String(xml || '');
  const matches = [...source.matchAll(/<updatecheck\b([^>]*)>/gi)];
  for (const match of matches) {
    const attributes = xmlAttributes(match[1]);
    if (!attributes.codebase || !attributes.version) continue;
    if (extensionId) {
      const appMatch = source.slice(0, match.index).match(/<app\b([^>]*)>[^]*$/i);
      const appAttributes = appMatch ? xmlAttributes(appMatch[1]) : {};
      if (appAttributes.appid && appAttributes.appid !== extensionId) continue;
    }
    let codebase;
    try {
      codebase = new URL(attributes.codebase, baseUrl).toString();
    } catch {
      continue;
    }
    if (!codebase.startsWith('https://')) continue;
    return {
      version: attributes.version,
      codebase,
      status: attributes.status || 'ok',
    };
  }
  return null;
}

function extensionName(manifest, fallback) {
  const value = manifest && typeof manifest.name === 'string' ? manifest.name.trim() : '';
  return value || fallback;
}

function findManifestRoot(directory) {
  const root = path.resolve(directory);
  const directManifest = path.join(root, 'manifest.json');
  if (fs.existsSync(directManifest)) return root;
  const children = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name));
  if (children.length === 1 && fs.existsSync(path.join(children[0], 'manifest.json'))) return children[0];
  throw new Error('插件目录中未找到 manifest.json');
}

function manifestPagePath(value) {
  const candidate = text(value).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!candidate || candidate.includes('..') || candidate.includes('\0')) return '';
  return candidate.slice(0, 512);
}

function manifestStringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, 256))
    .filter(Boolean))].slice(0, 100);
}

function manifestPanels(manifest) {
  const action = manifest?.action || {};
  const browserAction = manifest?.browser_action || {};
  const pageAction = manifest?.page_action || {};
  const sidePanel = manifest?.side_panel || {};
  const optionsUi = manifest?.options_ui || {};
  return {
    popup: manifestPagePath(action.default_popup || browserAction.default_popup || pageAction.default_popup),
    sidePanel: manifestPagePath(sidePanel.default_path),
    options: manifestPagePath(manifest.options_page || optionsUi.page),
  };
}

function resolveExtensionPanels(record) {
  const source = record?.panels && typeof record.panels === 'object' ? record.panels : {};
  const stored = {
    popup: text(source.popup),
    sidePanel: text(source.sidePanel),
    options: text(source.options),
  };
  if (stored.popup || stored.sidePanel || stored.options || !text(record?.path)) return stored;
  try {
    return inspectExtensionSource(record.path).panels || stored;
  } catch {
    return stored;
  }
}

function readManifest(root) {
  const manifestPath = path.join(root, 'manifest.json');
  let stat;
  try {
    stat = fs.statSync(manifestPath);
  } catch {
    throw new Error('插件目录中未找到 manifest.json');
  }
  if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) throw new Error('插件 manifest.json 无效或过大');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('插件 manifest.json 不是有效 JSON');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('插件 manifest.json 格式无效');
  const manifestVersion = Number(manifest.manifest_version);
  if (![2, 3].includes(manifestVersion)) throw new Error('仅支持 Manifest V2 或 V3 插件');
  const fallbackName = path.basename(root) || '未命名插件';
  const name = extensionName(manifest, fallbackName).slice(0, 160);
  const version = text(manifest.version, '未知版本').slice(0, 80);
  const extensionId = extensionIdFromManifestKey(manifest.key);
  const panels = manifestPanels(manifest);
  return {
    name,
    version,
    description: text(manifest.description).slice(0, 400),
    manifestVersion,
    updateUrl: normalizeUpdateUrl(manifest.update_url),
    permissions: manifestStringList(manifest.permissions),
    optionalPermissions: manifestStringList(manifest.optional_permissions),
    hostPermissions: manifestStringList(manifest.host_permissions),
    panels,
    ...(extensionId ? { extensionId } : {}),
  };
}

function manifestIconPaths(definition) {
  if (typeof definition === 'string') return [definition];
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return [];
  return Object.entries(definition)
    .filter(([size, file]) => /^\d+$/.test(size) && typeof file === 'string')
    .sort(([left], [right]) => Math.abs(Number(left) - 32) - Math.abs(Number(right) - 32) || Number(right) - Number(left))
    .map(([, file]) => file);
}

function rasterImageMimeType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 4 && buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 1 && buffer[3] === 0) return 'image/x-icon';
  return '';
}

function extensionIconDataUrl(directory, preferActionIcon = false) {
  try {
    const root = fs.realpathSync(findManifestRoot(directory));
    const manifestPath = path.join(root, 'manifest.json');
    const manifestStat = fs.statSync(manifestPath);
    if (!manifestStat.isFile() || manifestStat.size > MAX_MANIFEST_BYTES) return '';
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const action = manifest.action || {};
    const browserAction = manifest.browser_action || {};
    const pageAction = manifest.page_action || {};
    const extensionIcons = manifestIconPaths(manifest.icons);
    const actionIcons = [
      ...manifestIconPaths(action.default_icon),
      ...manifestIconPaths(browserAction.default_icon),
      ...manifestIconPaths(pageAction.default_icon),
    ];
    const candidates = (preferActionIcon ? [...actionIcons, ...extensionIcons] : [...extensionIcons, ...actionIcons]).slice(0, 32);
    for (const candidate of candidates) {
      try {
        const relativePath = text(candidate).replace(/\\/g, '/');
        if (!relativePath || relativePath.includes('\0') || path.posix.isAbsolute(relativePath) || /^[a-z]:\//i.test(relativePath)) continue;
        const target = path.resolve(root, ...relativePath.split('/'));
        if (!isPathWithin(root, target)) continue;
        const realTarget = fs.realpathSync(target);
        if (!isPathWithin(root, realTarget)) continue;
        const stat = fs.statSync(realTarget);
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_EXTENSION_ICON_BYTES) continue;
        const image = fs.readFileSync(realTarget);
        if (!image.length || image.length > MAX_EXTENSION_ICON_BYTES) continue;
        const mimeType = rasterImageMimeType(image);
        if (mimeType) return `data:${mimeType};base64,${image.toString('base64')}`;
      } catch {
        continue;
      }
    }
  } catch {
    return '';
  }
  return '';
}

function zipBufferFromArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw new Error('插件压缩包无效');
  if (buffer.readUInt16LE(0) === 0x4b50) return buffer;
  if (buffer.subarray(0, 4).toString('ascii') !== 'Cr24' || buffer.length < 12) {
    throw new Error('插件文件不是 ZIP 或 CRX 格式');
  }
  const version = buffer.readUInt32LE(4);
  let zipOffset;
  if (version === 2) {
    if (buffer.length < 16) throw new Error('CRX v2 文件头不完整');
    zipOffset = 16 + buffer.readUInt32LE(8) + buffer.readUInt32LE(12);
  } else if (version === 3) {
    zipOffset = 12 + buffer.readUInt32LE(8);
  } else {
    throw new Error(`暂不支持 CRX v${version} 插件`);
  }
  if (!Number.isSafeInteger(zipOffset) || zipOffset < 0 || zipOffset >= buffer.length) throw new Error('CRX 文件头无效');
  const zip = buffer.subarray(zipOffset);
  if (zip.length < 4 || zip.readUInt16LE(0) !== 0x4b50) throw new Error('CRX 中未找到 ZIP 内容');
  return zip;
}

function inspectExtensionSource(sourcePath) {
  const rawPath = text(sourcePath);
  if (!rawPath) throw new Error('插件路径不存在');
  const absolute = path.resolve(rawPath);
  if (!fs.existsSync(absolute)) throw new Error('插件路径不存在');
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    const root = findManifestRoot(absolute);
    return {
      sourcePath: absolute,
      path: root,
      managed: false,
      loadMode: 'direct',
      ...readManifest(root),
    };
  }
  if (!stat.isFile() || !['.crx', '.zip'].includes(path.extname(absolute).toLowerCase())) {
    throw new Error('请选择未打包插件文件夹、ZIP 或 CRX 文件');
  }
  if (stat.size > MAX_EXTENSION_ARCHIVE_BYTES) throw new Error('插件压缩包超过 80MB 限制');
  const buffer = zipBufferFromArchive(fs.readFileSync(absolute));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-extension-'));
  try {
    extractZip(buffer, tempDir);
    const root = findManifestRoot(tempDir);
    return {
      sourcePath: absolute,
      path: absolute,
      managed: true,
      loadMode: 'managed',
      ...readManifest(root),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function prepareExtensionSource(sourcePath, destinationRoot, extensionId) {
  const inspected = inspectExtensionSource(sourcePath);
  if (!inspected.managed) return inspected;
  const targetRoot = path.resolve(destinationRoot);
  const target = path.join(targetRoot, extensionId);
  fs.mkdirSync(target, { recursive: true });
  try {
    const buffer = zipBufferFromArchive(fs.readFileSync(inspected.sourcePath));
    extractZip(buffer, target);
    const root = findManifestRoot(target);
    return {
      ...readManifest(root),
      sourcePath: inspected.sourcePath,
      path: root,
      managed: true,
      loadMode: 'managed',
      managedRoot: target,
    };
  } catch (error) {
    fs.rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

function isPathWithin(rootDirectory, targetPath) {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function removeManagedExtension(record, destinationRoot) {
  const managedRoot = text(record?.managedRoot);
  if (!managedRoot || !isPathWithin(destinationRoot, managedRoot) || !fs.existsSync(managedRoot)) return false;
  fs.rmSync(managedRoot, { recursive: true, force: true });
  return true;
}

module.exports = {
  CHROME_WEB_STORE_UPDATE_URL,
  MAX_EXTENSION_ARCHIVE_BYTES,
  chromeWebStoreUpdateUrl,
  chromeWebStoreDownloadUrl,
  extensionIdFromManifestKey,
  extensionIdFromArchive,
  extensionIdFromPublicKey,
  extensionIconDataUrl,
  findManifestRoot,
  inspectExtensionSource,
  isChromeExtensionId,
  isPathWithin,
  normalizeChromeWebStoreExtensionId,
  prepareExtensionSource,
  compareVersions,
  normalizeProfileIds,
  normalizeUpdateUrl,
  parseUpdateManifest,
  readManifest,
  manifestPanels,
  resolveExtensionPanels,
  removeManagedExtension,
  toggleProfileId,
  zipBufferFromArchive,
};
