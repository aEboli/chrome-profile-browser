'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CORE_DEFINITIONS = Object.freeze({
  xray: Object.freeze({
    id: 'xray',
    label: 'Xray-core',
    executable: 'xray.exe',
    vendorDirectory: 'vendor/cores',
    versionFile: 'xray-version.json',
  }),
  singbox: Object.freeze({
    id: 'singbox',
    label: 'sing-box',
    executable: 'sing-box.exe',
    vendorDirectory: 'vendor/cores',
    versionFile: 'singbox-version.json',
  }),
});

function normalizeCore(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['singbox', 'sing-box', 'sing_box'].includes(normalized) ? 'singbox' : 'xray';
}

function platformDirectory(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'win32-x64';
  if (platform === 'win32' && arch === 'arm64') return 'win32-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  return `${platform}-${arch}`;
}

function projectRoot(moduleDirectory = __dirname) {
  if (process.resourcesPath && !process.defaultApp && moduleDirectory === __dirname) {
    return process.resourcesPath;
  }
  return path.resolve(moduleDirectory, '..', '..');
}

function bundledCoreInfo(core, options = {}) {
  const kind = normalizeCore(core);
  const definition = CORE_DEFINITIONS[kind];
  const root = options.rootDir || projectRoot(options.moduleDirectory);
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const directory = path.join(root, definition.vendorDirectory, platformDirectory(platform, arch));
  const executablePath = path.join(directory, definition.executable);
  const versionPath = path.join(directory, definition.versionFile);
  let metadata = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    if (parsed && typeof parsed === 'object') metadata = parsed;
  } catch {
    // A missing manifest only means the core is unavailable or user-supplied.
  }
  return {
    ...definition,
    kind,
    platform,
    arch,
    directory,
    path: fs.existsSync(executablePath) ? executablePath : '',
    version: typeof metadata.version === 'string' ? metadata.version : '',
    sha256: typeof metadata.sha256 === 'string' ? metadata.sha256 : '',
    bundled: fs.existsSync(executablePath),
  };
}

function resolveCorePath(core, configuredPath, options = {}) {
  const configured = typeof configuredPath === 'string' ? configuredPath.trim() : '';
  if (configured && path.isAbsolute(configured)) {
    try {
      if (fs.statSync(configured).isFile()) return { ...bundledCoreInfo(core, options), path: configured, bundled: false };
    } catch {
      // Fall through to the bundled copy.
    }
  }
  return bundledCoreInfo(core, options);
}

module.exports = {
  CORE_DEFINITIONS,
  bundledCoreInfo,
  normalizeCore,
  platformDirectory,
  projectRoot,
  resolveCorePath,
};
