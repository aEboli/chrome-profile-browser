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
  assert.match(main, /\{ label: '复制图片', click: \(\) => copyGuestImage\(guestContents, params\) \}/);
  assert.match(main, /copyImageAt\(Math\.round\(x\), Math\.round\(y\)\)/);
  assert.match(main, /为此图片创建二维码/);
  assert.match(main, /showResourceQrCode\(hostWindow, mediaUrl, '图片二维码'\)/);
  assert.match(main, /showGuestContextMenu\(/);
  assert.match(main, /sendProfileTabOpen\(/);
  assert.match(main, /function profileWindowOpenResponse\(/);
  assert.match(main, /function isProfilePopupRequest\(/);
  assert.match(main, /profile-window-navigation/);
  assert.ok(main.includes("classifyProfileWindowOpen, classifyProfilePreflightNavigation") && main.includes("require('./profile-window-navigation')"));
  assert.match(main, /routePreflight = \(event, url\)/);
  assert.match(main, /const route = classifyProfileWindowOpen\(details\)/);
  assert.doesNotMatch(main, /if \(disposition === 'new-window'\) return true/);
  assert.match(main, /const preflight = classifyProfileWindowOpen\(openDetails\)\.kind === 'preflight'/);
  assert.match(main, /action: 'allow',[\s\S]*?overrideBrowserWindowOptions: profilePopupOptions/);
  assert.match(main, /route\.kind === 'tab'[\s\S]*?sendProfileTabOpen\(profileId, targetUrl, route\.focus\)/);
  assert.match(main, /function registerProfilePopupWindow\(/);
  assert.match(main, /classifyProfilePreflightNavigation\(openDetails, targetUrl, isAllowedNavigation\)/);
  assert.match(main, /popupContents\.on\('will-navigate', routePreflight\)/);
  assert.match(main, /popupContents\.on\('will-redirect', routePreflight\)/);
  assert.match(main, /popupWindow\.hide\(\)/);
  assert.match(main, /preflightTimer = setTimeout/);
  assert.match(main, /session: profileSession/);
  assert.match(main, /did-create-window/);
  assert.match(main, /profileAuth\.set\(popupContents\.id, node \|\| null\)/);
  assert.match(main, /function closeProfilePopupWindows\(/);
  assert.match(main, /contents\.downloadURL/);
  assert.match(renderer, /setAttribute\('allowpopups', ''\)/);
  assert.match(renderer, /createTab\(normalizedUrl\(url\), \{ activate: details\?\.focus !== false, focusAddress: false \}\)/);
});

test('extension action windows use the profile window-open policy and child popup lifecycle', () => {
  assert.match(main, /panel\.webContents\.setWindowOpenHandler\(\(details\) => profileWindowOpenResponse\(profileKey, details\)\)/);
  assert.match(main, /panel\.webContents\.on\('did-create-window',[\s\S]*?registerProfilePopupWindow\(profileKey, childWindow, panelNode, details\)/);
  assert.match(main, /const panelNode = profileSessions\.get\(profileSession\) \|\| null/);
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
