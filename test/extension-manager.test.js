const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CHROME_WEB_STORE_UPDATE_URL,
  chromeWebStoreDownloadUrl,
  chromeWebStoreUpdateUrl,
  compareVersions,
  extensionIdFromArchive,
  extensionIdFromManifestKey,
  extensionIconDataUrl,
  inspectExtensionSource,
  isChromeExtensionId,
  isPathWithin,
  normalizeProfileIds,
  normalizeChromeWebStoreExtensionId,
  parseUpdateManifest,
  prepareExtensionSource,
  readManifest,
  resolveExtensionPanels,
  toggleProfileId,
  zipBufferFromArchive,
} = require('../src/main/extension-manager');

test('keeps plugin activation independent for each browser environment', () => {
  const assignments = { A: [], B: [], C: [] };
  assignments.A = toggleProfileId(assignments.A, 'browser-1', true);
  assignments.A = toggleProfileId(assignments.A, 'browser-3', true);
  assignments.B = toggleProfileId(assignments.B, 'browser-2', true);
  assignments.B = toggleProfileId(assignments.B, 'browser-3', true);
  assignments.C = normalizeProfileIds(['browser-1', 'browser-2', 'browser-3']);

  assert.deepEqual(assignments, {
    A: ['browser-1', 'browser-3'],
    B: ['browser-2', 'browser-3'],
    C: ['browser-1', 'browser-2', 'browser-3'],
  });

  assignments.A = toggleProfileId(assignments.A, 'browser-1', false);
  assert.deepEqual(assignments.A, ['browser-3']);
  assert.deepEqual(assignments.B, ['browser-2', 'browser-3']);
  assert.deepEqual(assignments.C, ['browser-1', 'browser-2', 'browser-3']);
});

test('inspects a valid unpacked Manifest V3 extension', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-test-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: '本地测试插件',
    version: '1.2.3',
    description: '只用于测试',
    permissions: ['storage'],
    optional_permissions: ['tabs'],
    host_permissions: ['https://example.com/*'],
  }), 'utf8');

  const result = inspectExtensionSource(root);
  assert.equal(result.path, root);
  assert.equal(result.name, '本地测试插件');
  assert.equal(result.version, '1.2.3');
  assert.equal(result.manifestVersion, 3);
  assert.deepEqual(result.permissions, ['storage']);
  assert.deepEqual(result.optionalPermissions, ['tabs']);
  assert.deepEqual(result.hostPermissions, ['https://example.com/*']);
  assert.equal(result.managed, false);
  assert.equal(result.loadMode, 'direct');

  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-managed-'));
  const prepared = prepareExtensionSource(root, destination, 'direct-test');
  assert.equal(prepared.loadMode, 'direct');
  assert.equal(prepared.path, root);
  assert.deepEqual(fs.readdirSync(destination), []);
});

test('records popup, side panel and options entry points from a manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-panel-test-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: '面板插件',
    version: '1.0.0',
    action: { default_popup: 'ui/popup.html' },
    side_panel: { default_path: 'ui/side.html' },
    options_ui: { page: 'ui/options.html' },
  }), 'utf8');
  assert.deepEqual(readManifest(root).panels, {
    popup: 'ui/popup.html',
    sidePanel: 'ui/side.html',
    options: 'ui/options.html',
  });
});

test('loads manifest icons from the extension directory and prefers action icons for the browser toolbar', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-icon-test-'));
  const outsidePath = `${root}-outside.png`;
  const png = fs.readFileSync(path.join(__dirname, '../src/assets/brand-icon.png'));
  const actionPng = Buffer.concat([png, Buffer.from([0])]);
  fs.mkdirSync(path.join(root, 'icons'));
  fs.writeFileSync(outsidePath, png);
  fs.writeFileSync(path.join(root, 'icons', 'extension.png'), png);
  fs.writeFileSync(path.join(root, 'icons', 'action.png'), actionPng);
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: '图标插件',
    version: '1.0.0',
    icons: { 32: `../${path.basename(outsidePath)}`, 48: 'icons/extension.png' },
    action: { default_icon: { 32: 'icons/action.png' } },
  }), 'utf8');

  try {
    assert.equal(extensionIconDataUrl(root), `data:image/png;base64,${png.toString('base64')}`);
    assert.equal(extensionIconDataUrl(root, true), `data:image/png;base64,${actionPng.toString('base64')}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outsidePath, { force: true });
  }
});

test('ignores unsupported extension icon formats', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-icon-test-'));
  fs.writeFileSync(path.join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 2,
    name: 'SVG 图标插件',
    version: '1.0.0',
    icons: { 32: 'icon.svg' },
  }), 'utf8');
  try {
    assert.equal(extensionIconDataUrl(root), '');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('recovers panel entry points for existing records with missing manifest metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-legacy-panel-test-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: '旧记录插件',
    version: '1.0.0',
    action: { default_popup: 'popup.html' },
  }), 'utf8');

  assert.deepEqual(resolveExtensionPanels({ path: root }), {
    popup: 'popup.html',
    sidePanel: '',
    options: '',
  });
  assert.deepEqual(resolveExtensionPanels({ path: root, panels: { popup: '', sidePanel: '', options: '' } }), {
    popup: 'popup.html',
    sidePanel: '',
    options: '',
  });
});

test('reads an HTTPS update URL and parses a higher official version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-test-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 2,
    name: '更新插件',
    version: '1.0.0',
    update_url: 'https://updates.example.test/update.xml',
  }), 'utf8');
  const result = inspectExtensionSource(root);
  assert.equal(result.updateUrl, 'https://updates.example.test/update.xml');
  const update = parseUpdateManifest(
    '<gupdate><app appid="abc"><updatecheck codebase="/plugin.crx" version="1.2.0" /></app></gupdate>',
    result.updateUrl,
    'abc',
  );
  assert.equal(update.codebase, 'https://updates.example.test/plugin.crx');
  assert.equal(compareVersions(update.version, result.version), 1);
});

test('derives a Chrome Web Store update endpoint from a manifest public key', () => {
  const publicKey = Buffer.from('test-public-key-material');
  const encoded = publicKey.toString('base64');
  const extensionId = extensionIdFromManifestKey(encoded);
  assert.match(extensionId, /^[a-p]{32}$/);
  assert.equal(isChromeExtensionId(extensionId), true);
  assert.equal(chromeWebStoreUpdateUrl(extensionId), CHROME_WEB_STORE_UPDATE_URL);
  assert.equal(chromeWebStoreUpdateUrl('not-a-chrome-id'), '');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-test-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: '商店插件',
    version: '2.0.0',
    key: encoded,
  }), 'utf8');
  assert.equal(inspectExtensionSource(root).extensionId, extensionId);
});

test('accepts Chrome Web Store detail URLs and builds an official download URL', () => {
  const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
  assert.equal(normalizeChromeWebStoreExtensionId(extensionId.toUpperCase()), extensionId);
  assert.equal(
    normalizeChromeWebStoreExtensionId(`https://chromewebstore.google.com/detail/example/${extensionId}`),
    extensionId,
  );
  assert.equal(
    normalizeChromeWebStoreExtensionId(`https://chrome.google.com/webstore/detail/example/${extensionId}`),
    extensionId,
  );
  assert.equal(normalizeChromeWebStoreExtensionId(`https://example.test/detail/${extensionId}`), '');
  assert.equal(normalizeChromeWebStoreExtensionId(`https://chromewebstore.google.com/search/${extensionId}`), '');
  assert.equal(normalizeChromeWebStoreExtensionId(`https://chrome.google.com/apps/${extensionId}`), '');
  assert.equal(normalizeChromeWebStoreExtensionId('abcdefghijklmnop'), '');

  const downloadUrl = new URL(chromeWebStoreDownloadUrl(extensionId, '44.4.3'));
  assert.equal(downloadUrl.origin, 'https://clients2.google.com');
  assert.equal(downloadUrl.pathname, '/service/update2/crx');
  assert.equal(downloadUrl.searchParams.get('response'), 'redirect');
  assert.equal(downloadUrl.searchParams.get('prodversion'), '44.4.3');
  assert.equal(downloadUrl.searchParams.get('x'), `id=${extensionId}&installsource=ondemand&uc`);
});

test('derives an extension ID from CRX2 and CRX3 archive headers', () => {
  const publicKey = Buffer.from('test-crx-public-key-material');
  const expected = extensionIdFromManifestKey(publicKey.toString('base64'));
  const crx2 = Buffer.alloc(16 + publicKey.length + 3);
  crx2.write('Cr24', 0, 'ascii');
  crx2.writeUInt32LE(2, 4);
  crx2.writeUInt32LE(publicKey.length, 8);
  crx2.writeUInt32LE(3, 12);
  publicKey.copy(crx2, 16);
  assert.equal(extensionIdFromArchive(crx2), expected);

  const proof = Buffer.concat([
    Buffer.from([0x0a, publicKey.length]), publicKey,
    Buffer.from([0x12, 0x01, 0x00]),
  ]);
  const header = Buffer.concat([Buffer.from([0x12, proof.length]), proof]);
  const crx3 = Buffer.alloc(12 + header.length + 4);
  crx3.write('Cr24', 0, 'ascii');
  crx3.writeUInt32LE(3, 4);
  crx3.writeUInt32LE(header.length, 8);
  header.copy(crx3, 12);
  assert.equal(extensionIdFromArchive(crx3), expected);
});

test('rejects malformed or unsupported manifests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-test-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), '{broken', 'utf8');
  assert.throws(() => readManifest(root), /不是有效 JSON/);
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ manifest_version: 1, name: 'old', version: '1' }), 'utf8');
  assert.throws(() => readManifest(root), /仅支持 Manifest V2 或 V3/);
});

test('recognizes CRX headers and keeps managed paths bounded', () => {
  const crxHeader = Buffer.alloc(12);
  crxHeader.write('Cr24', 0, 'ascii');
  crxHeader.writeUInt32LE(4, 4);
  assert.throws(() => zipBufferFromArchive(crxHeader), /暂不支持 CRX/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-extension-test-'));
  const child = path.join(root, 'copy');
  fs.mkdirSync(child);
  assert.equal(isPathWithin(root, child), true);
  assert.equal(isPathWithin(root, path.dirname(root)), false);
});
