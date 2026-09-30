const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'main', 'browser-shell-preload.js'), 'utf8');

test('bookmark bar renders site icons and exposes accessible folder menus', () => {
  assert.match(html, /id="bookmark-menu"[^>]*role="menu"/);
  assert.match(script, /function createBookmarkEntryButton\(/);
  assert.match(script, /function openBookmarkEntry\(/);
  assert.match(script, /function handleBookmarkEntryClick\(/);
  assert.match(script, /button\.addEventListener\('auxclick'/);
  assert.match(script, /async function loadBookmarkFaviconImage\(/);
  assert.match(script, /function saveBookmarkFavicon\(/);
  assert.match(script, /aria-controls', 'bookmark-menu'/);
  assert.match(script, /aria-expanded', 'true'/);
  assert.match(css, /\.bookmark-site-icon/);
  assert.match(css, /\.bookmark-fallback-icon/);
  assert.match(css, /\.bookmark-menu\s*\{[^}]*position:\s*fixed/s);
});

test('bookmark context menus support root, link, folder, escape, and viewport placement', () => {
  assert.match(script, /bookmarkBar\?\.addEventListener\('contextmenu'/);
  assert.match(script, /bookmarkMenu\?\.addEventListener\('contextmenu'/);
  assert.match(script, /function showBookmarkMenu\(/);
  assert.match(script, /function runBookmarkMenuAction\(/);
  assert.match(script, /window\.innerWidth - bounds\.width - margin/);
  assert.match(script, /window\.innerHeight - bounds\.height - margin/);
  assert.match(script, /event\.key === 'Escape' && bookmarkMenu\?\.hidden === false/);
  assert.match(script, /bookmarkMenu\?\.addEventListener\('keydown'/);
  assert.match(script, /在当前标签打开/);
  assert.match(script, /在新标签打开/);
  assert.match(script, /bookmarkOpensInNewTab/);
  assert.match(script, /编辑收藏/);
  assert.match(script, /删除收藏/);
  assert.match(script, /重命名文件夹/);
});

test('bookmark folders open as Chrome-style cascading menus with an overflow chevron', () => {
  assert.match(script, /function openBookmarkSubmenu\(/);
  assert.match(script, /panel\.className = 'bookmark-menu bookmark-submenu'/);
  assert.match(script, /function handleBookmarkMenuHover\(/);
  assert.match(script, /event\.key === 'ArrowRight' && focused\?\.dataset\.bookmarkEntryType === 'folder'/);
  assert.match(script, /bookmarkBar\?\.addEventListener\('mouseover'/);
  assert.match(script, /function layoutBookmarkBarOverflow\(/);
  assert.match(script, /showBookmarkMenu\(\{ type: 'overflow' \}/);
  assert.match(script, /全部在新标签页中打开/);
  assert.doesNotMatch(script, /返回上一级/);
  assert.match(script, /closest\('#bookmark-menu, \.bookmark-submenu, #bookmark-bar'\)/);
  assert.match(css, /\.bookmark-bar-overflow\s*\{/);
  assert.match(css, /\.bookmark-menu-submenu-arrow\s*\{/);
  assert.match(css, /\.bookmark-bar-item\[hidden\]/);
});

test('bookmark changes cross a profile-scoped IPC boundary', () => {
  assert.match(main, /browser-shell:create-bookmark-folder/);
  assert.match(main, /browser-shell:update-bookmark/);
  assert.match(main, /browser-shell:delete-bookmark/);
  assert.match(main, /browser-shell:get-bookmark-favicon/);
  assert.match(main, /profileSession\.fetch\(url/);
  assert.match(main, /MAX_BOOKMARK_FAVICON_BYTES = 64 \* 1024/);
  assert.match(main, /deleteBookmarkRecord\(profile\.bookmarks, input\)/);
  assert.match(preload, /createBookmarkFolder: \(folder\) => ipcRenderer\.invoke\('browser-shell:create-bookmark-folder'/);
  assert.match(preload, /updateBookmark: \(bookmark\) => ipcRenderer\.invoke\('browser-shell:update-bookmark'/);
});
