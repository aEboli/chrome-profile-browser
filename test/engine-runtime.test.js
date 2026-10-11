'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');

const {
  buildExternalEngineArgs,
  discoverChromeExecutable,
  normalizeEngineMode,
  resolveExternalEnginePath,
  sameEnginePath,
  validateEnginePath,
  waitForProcessSpawn,
} = require('../src/main/engine-runtime');

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cpb-engine-'));
}

test('normalizes explicit engine mode and migrates legacy paths', () => {
  assert.equal(normalizeEngineMode('external', ''), 'external');
  assert.equal(normalizeEngineMode('electron', 'C:\\Chrome\\chrome.exe'), 'electron');
  assert.equal(normalizeEngineMode('', 'C:\\Chrome\\chrome.exe'), 'external');
  assert.equal(normalizeEngineMode('', ''), 'electron');
  assert.equal(normalizeEngineMode('unsupported', ''), 'electron');
});

test('validates an absolute Chromium executable and rejects directories', () => {
  const root = tempDirectory();
  const executable = path.join(root, 'chrome.exe');
  fs.writeFileSync(executable, 'test');
  assert.equal(validateEnginePath(executable), executable);
  assert.throws(() => validateEnginePath('chrome.exe'), /绝对路径/);
  assert.throws(() => validateEnginePath(root), /可执行文件/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('discovers Windows Chrome in system-wide, 32-bit, then user locations', () => {
  const pathImpl = path.win32;
  const env = {
    ProgramFiles: 'C:\\System Apps',
    'ProgramFiles(x86)': 'C:\\32-bit Apps',
    LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
  };
  const candidates = Object.values(env).map((root) => pathImpl.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  const found = new Set([candidates[1], candidates[2]]);
  const fsImpl = {
    statSync(candidate) {
      if (!found.has(candidate)) throw new Error('not found');
      return { isFile: () => true, isDirectory: () => false };
    },
  };
  assert.equal(discoverChromeExecutable({ platform: 'win32', pathImpl, fsImpl, env }), candidates[1]);
});

test('discovers macOS Chrome bundles and Linux Chrome from PATH', () => {
  const macBundle = '/Applications/Google Chrome.app';
  const macExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const macFs = {
    statSync(candidate) {
      if (candidate === macBundle) return { isDirectory: () => true, isFile: () => false };
      if (candidate === macExecutable) return { isFile: () => true, isDirectory: () => false };
      throw new Error('not found');
    },
  };
  assert.equal(discoverChromeExecutable({ platform: 'darwin', pathImpl: path.posix, fsImpl: macFs }), macExecutable);

  const linuxFs = {
    statSync(candidate) {
      if (candidate === '/custom/bin/google-chrome') return { isFile: () => true, isDirectory: () => false };
      throw new Error('not found');
    },
  };
  assert.equal(discoverChromeExecutable({
    platform: 'linux',
    pathImpl: path.posix,
    fsImpl: linuxFs,
    env: { PATH: '/custom/bin:/usr/bin' },
  }), '/custom/bin/google-chrome');
});

test('manual Chrome path takes priority and invalid manual paths do not fall back', () => {
  const root = tempDirectory();
  const executable = path.join(root, 'chrome.exe');
  fs.writeFileSync(executable, 'test');
  assert.equal(resolveExternalEnginePath(executable), executable);
  assert.throws(() => resolveExternalEnginePath(path.join(root, 'missing.exe')), /不存在/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('returns an empty discovery result when Chrome is not installed', () => {
  const fsImpl = { statSync: () => { throw new Error('not found'); } };
  assert.equal(discoverChromeExecutable({
    platform: 'win32',
    pathImpl: path.win32,
    fsImpl,
    env: { ProgramFiles: 'C:\\Apps', 'ProgramFiles(x86)': 'C:\\Apps32', LOCALAPPDATA: 'C:\\Users\\Test' },
  }), '');
});

test('resolves a macOS application bundle to its executable', () => {
  const root = tempDirectory();
  const bundle = path.join(root, 'Chromium.app');
  const executable = path.join(bundle, 'Contents', 'MacOS', 'Chromium');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, 'test');
  assert.equal(validateEnginePath(bundle, { platform: 'darwin' }), executable);
  fs.rmSync(root, { recursive: true, force: true });
});

test('builds external arguments without proxy credentials', () => {
  const args = buildExternalEngineArgs({
    profileDataPath: 'C:\\Users\\User Name\\profiles\\one',
    startUrl: 'https://example.com',
    proxyArg: 'socks5://127.0.0.1:1080',
    extensionPaths: ['C:\\extensions\\one'],
  });
  assert.deepEqual(args, [
    '--disable-quic',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--proxy-server=socks5://127.0.0.1:1080',
    '--load-extension=C:\\extensions\\one',
    '--user-data-dir=C:\\Users\\User Name\\profiles\\one',
    '--no-first-run',
    '--no-default-browser-check',
    'https://example.com',
  ]);
  assert.ok(!args.join(' ').includes('password'));
  assert.throws(() => buildExternalEngineArgs({
    profileDataPath: 'C:\\profiles\\one',
    startUrl: 'about:blank',
    extensionPaths: ['C:\\plugin,with-comma'],
  }), /逗号/);
});

test('compares engine paths case-insensitively on Windows', () => {
  assert.equal(sameEnginePath('C:\\Chrome\\chrome.exe', 'c:/chrome/chrome.exe', 'win32'), true);
  assert.equal(sameEnginePath('/opt/chrome', '/opt/other', 'linux'), false);
  assert.equal(sameEnginePath('', '', 'win32'), true);
});

test('waits for external process spawn and reports early errors', async () => {
  const spawned = new EventEmitter();
  const success = waitForProcessSpawn(spawned, 100);
  spawned.emit('spawn');
  await success;

  const failed = new EventEmitter();
  const failure = waitForProcessSpawn(failed, 100);
  failed.emit('error', new Error('not executable'));
  await assert.rejects(failure, /not executable/);
});
