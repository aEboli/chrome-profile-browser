'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  assetName,
  checkLatestCore,
  compareVersions,
  extractZip,
  findExtractedExecutable,
  parseDigest,
  safeZipPath,
} = require('../src/main/core-updater');

function zipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const { name, content } of entries) {
    const nameBytes = Buffer.from(name);
    const compressed = zlib.deflateRawSync(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

test('maps supported platforms to official Xray release assets', () => {
  assert.equal(assetName('win32', 'x64'), 'Xray-windows-64.zip');
  assert.equal(assetName('win32', 'arm64'), 'Xray-windows-arm64-v8a.zip');
  assert.equal(assetName('darwin', 'arm64'), 'Xray-macos-arm64-v8a.zip');
  assert.equal(assetName('linux', 'x64'), 'Xray-linux-64.zip');
  assert.equal(assetName('win32', 'x64', 'sing-box'), 'sing-box-${VERSION}-windows-amd64.zip');
  assert.throws(() => assetName('freebsd', 'x64'), /暂不支持/);
});

test('finds a core executable inside an official versioned archive directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-core-updater-'));
  try {
    const nested = path.join(root, 'sing-box-1.14.1-windows-amd64');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'sing-box.exe'), 'binary');
    assert.equal(findExtractedExecutable(root, 'sing-box.exe'), path.join(nested, 'sing-box.exe'));
    assert.throws(() => findExtractedExecutable(root, 'xray.exe'), /未找到唯一/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('parses release digests and rejects zip traversal paths', () => {
  assert.equal(parseDigest('SHA-256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'), '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  assert.equal(safeZipPath('xray.exe'), 'xray.exe');
  assert.equal(safeZipPath('geo/geoip.dat'), 'geo\\geoip.dat');
  assert.equal(safeZipPath('../xray.exe'), '');
  assert.equal(safeZipPath('/absolute/xray.exe'), '');
  assert.equal(safeZipPath('C:/xray.exe'), '');
});

test('extracts official archives whose total contents exceed the download limit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-core-extract-limit-'));
  const content = Buffer.alloc(42 * 1024 * 1024, 0x61);
  try {
    const archive = zipArchive([
      { name: 'sing-box.exe', content },
      { name: 'libcronet.dll', content },
    ]);
    extractZip(archive, root);
    assert.equal(fs.statSync(path.join(root, 'sing-box.exe')).size, content.length);
    assert.equal(fs.statSync(path.join(root, 'libcronet.dll')).size, content.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('detects a newer official core release without downloading it', async () => {
  const response = {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => Buffer.from(JSON.stringify({
      tag_name: 'v26.4.0',
      html_url: 'https://github.com/XTLS/Xray-core/releases/tag/v26.4.0',
    })),
  };
  const result = await checkLatestCore({
    core: 'xray',
    currentVersion: 'v26.3.27',
    fetchImpl: async () => response,
  });
  assert.equal(result.updateAvailable, true);
  assert.equal(result.latestVersion, 'v26.4.0');
  assert.equal(compareVersions('v1.14.1', 'v1.9.9'), 1);
  assert.equal(compareVersions('v1.14.1', 'v1.14.1'), 0);
});
