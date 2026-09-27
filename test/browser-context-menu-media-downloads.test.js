const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'main', 'browser-shell-preload.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.js'), 'utf8');

test('browser guests route links, popups, context menus, and media downloads', () => {
  assert.match(main, /function guestContextMenuTemplate\(/);
  assert.match(main, /在新标签页中打开链接/);
  assert.match(main, /下载视频/);
  assert.match(main, /播放\/暂停/);
  assert.match(main, /media\.controls = true/);
  assert.match(main, /showGuestContextMenu\(/);
  assert.match(main, /sendProfileTabOpen\(/);
  assert.match(main, /contents\.downloadURL/);
  assert.match(renderer, /setAttribute\('allowpopups', ''\)/);
  assert.match(renderer, /createTab\(normalizedUrl\(url\), details\?\.focus !== false\)/);
});

test('download manager is exposed through the profile shell', () => {
  assert.match(main, /browser-shell:open-download/);
  assert.match(main, /browser-shell:cancel-download/);
  assert.match(main, /browser-shell:clear-downloads/);
  assert.match(preload, /openDownload:/);
  assert.match(preload, /cancelDownload:/);
  assert.match(preload, /clearDownloads:/);
  assert.match(html, /id="downloads-toggle"/);
  assert.match(html, /id="downloads-panel"/);
  assert.match(renderer, /function renderDownloads\(/);
  assert.match(renderer, /handleDownloadAction\(/);
});

test('Agent entry stays beside the address form and uses SVG AI paths', () => {
  assert.match(html, /<symbol id="shell-icon-ai"[^>]*><path/);
  assert.doesNotMatch(html, /shell-icon-agent/);
  assert.match(html, /<\/form>\s*<button id="agent-toggle" class="icon-button toolbar-agent-button"/);
  assert.match(html, /id="agent-toggle"[^>]*aria-label="AI 网页助手"/);
});
