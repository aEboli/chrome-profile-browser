'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/browser-shell.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
function loadFunction(context, source, start, end) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, start);
  const limit = source.indexOf(end, offset + start.length);
  assert.ok(limit > offset, end);
  vm.runInContext(source.slice(offset, limit), context);
}

test('extension popover only renders enabled extensions and shows an empty state when none are enabled', () => {
  const list = { innerHTML: '', hidden: false };
  const empty = { hidden: true };
  const compatibility = { hidden: true };
  const count = { textContent: '', hidden: false };
  const context = vm.createContext({ extensionItems: [], extensionCount: count, extensionsEmpty: empty,
    extensionToolbar: null, extensionsList: list, extensionsCompatibility: compatibility,
    escapeHtml: value => String(value ?? ''),
    extensionIconMarkup: () => '<svg></svg>', bindExtensionIconFallbacks() {},
  });
  loadFunction(context, renderer, 'function renderExtensions(', 'function formatDownloadBytes(');
  const extension = (id, name, enabled) => ({ id, name, enabled, status: 'active', description: '',
    hostPermissions: [], permissions: [], optionalPermissions: [], version: '1.0', manifestVersion: 3,
    hasPanel: false, pinned: false, error: '', requiresUserScripts: false,
  });

  context.renderExtensions([extension('active', '启用插件', true), {
    ...extension('tampermonkey', 'Tampermonkey', true), requiresUserScripts: true,
    hasPanel: true, status: 'error', error: '扩展加载失败',
  }, {
    ...extension('inactive', '未启用插件', false), requiresUserScripts: true,
  }]);
  assert.match(list.innerHTML, /启用插件/);
  assert.doesNotMatch(list.innerHTML, /未启用插件/);
  assert.equal(list.hidden, false);
  assert.equal(empty.hidden, true);
  assert.equal(compatibility.hidden, false);
  assert.match(list.innerHTML, /扩展加载失败/);
  assert.equal(count.textContent, '2');

  context.renderExtensions([extension('inactive', '未启用插件', false)]);
  assert.equal(list.innerHTML, '');
  assert.equal(list.hidden, true);
  assert.equal(empty.hidden, false);
  assert.equal(compatibility.hidden, true);
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/browser-shell.html'), 'utf8');
  assert.match(html, /id="extensions-empty"[^>]*>当前环境没有已启用的插件/);
  assert.match(html, /id="extensions-compatibility"/);
  assert.match(html, /extensions-compatibility[\s\S]*?extensions-status/);
  assert.match(html, /Allow User Scripts/);
  assert.match(html, /chrome\.tabs\.create/);
  assert.match(html, /Tampermonkey 管理面板中使用其导出和导入功能迁移脚本/);
  assert.match(html, /应用不会自动复制/);
});

test('background creation retains activity and pinned insertion boundaries', () => {
  const items = [{ id: 'pinned', pinned: true }, { id: 'active', pinned: false }];
  const activated = [];
  const context = vm.createContext({ tabItems: items, nextTabId: 1, activeTabId: 'active',
    pages: { append() {} }, normalizedUrl: value => value, tabFallbackTitle: value => value,
    fallbackTabAccent: () => '#123456', isNewTabUrl: () => false, isHistoryUrl: () => false,
    document: { createElement: () => ({ setAttribute() {} }) }, partition: 'test', bindTabEvents() {}, renderTabs() {},
    activateTab: (id, focusAddress) => activated.push({ id, focusAddress }),
  });
  loadFunction(context, renderer, 'function createTab(', 'function ensureWebviewForTab(');
  const background = context.createTab('https://example.com', { activate: false, index: 0 });
  assert.equal(activated.length, 0);
  assert.equal(context.activeTabId, 'active');
  assert.equal(items[1], background);
  assert.equal(background.view.hidden, true);
  const pinned = context.createTab('https://other.example', { pinned: true });
  assert.equal(items[1], pinned);
  assert.equal(activated[0].id, pinned.id);
});

test('middle-clicked bookmarks stay in the background unless Shift is held', () => {
  let listener;
  const opened = [];
  const item = { id: 'bookmark', type: 'bookmark' };
  const context = vm.createContext({ button: { dataset: { bookmarkEntryId: item.id }, addEventListener: (_event, handler) => { listener = handler; } },
    bookmarkById: () => item, openBookmarkEntry: (_item, options) => opened.push(options),
  });
  const start = renderer.indexOf("  button.addEventListener('auxclick', (event) => {");
  const end = renderer.indexOf('  return button;', start);
  vm.runInContext(renderer.slice(start, end), context);
  listener({ button: 1, shiftKey: false, preventDefault() {}, stopPropagation() {} });
  listener({ button: 1, shiftKey: true, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(opened.map((options) => ({ ...options })), [{ newTab: true, activate: false }, { newTab: true, activate: true }]);
});

test('bulk tab closure retains pinned tabs and closes only requested positions', () => {
  const items = [{ id: 'pin', pinned: true }, { id: 'left' }, { id: 'target' }, { id: 'right' }, { id: 'last' }];
  const closed = [];
  const context = vm.createContext({ tabItems: items, closeTab: id => closed.push(id) });
  loadFunction(context, renderer, 'function runTabAction(', 'function createTab(');
  context.runTabAction('target', 'close-right');
  assert.deepEqual(closed, ['last', 'right']);
  closed.length = 0;
  context.runTabAction('target', 'close-others');
  assert.deepEqual(closed, ['last', 'right', 'left']);
});

test('find requests use the documented initial and continuation options and cancel stale tokens', async () => {
  const calls = [];
  const item = { view: { getWebContentsId: () => 4 }, findQuery: '' };
  const context = vm.createContext({ nextFindToken: 0, activeTab: () => item, isShellPage: () => false,
    pageFindInput: { value: 'needle' }, pageFindCount: { textContent: '' },
    window: { shellApi: { findPage: async input => { calls.push(input); return { ok: true }; } } },
  });
  loadFunction(context, renderer, 'async function runPageFind(', 'function runBrowserShortcut(');
  await context.runPageFind(true, true);
  await context.runPageFind(false);
  assert.equal(calls[0].findNext, true);
  assert.equal(calls[1].findNext, false);
  assert.equal(calls[1].forward, false);
  assert.ok(calls[1].token > calls[0].token);
  context.pageFindInput.value = '';
  await context.runPageFind();
  assert.equal(calls[2].query, '');
  assert.equal(context.pageFindCount.textContent, '0/0');
});

test('address editing retains the protocol prefix and selected positions', () => {
  const address = { value: 'https://example.com/page', selectionStart: 0, selectionEnd: 24, selectionDirection: 'forward',
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  };
  const context = vm.createContext({ address, addressEditing: false, addressHiddenScheme: '', ADDRESS_SCHEME_PATTERN: /^(?:https?|chrome):\/\//i });
  loadFunction(context, renderer, 'function hideAddressSchemeForEditing(', 'function revealAddressScheme(');
  context.hideAddressSchemeForEditing();
  assert.equal(context.addressHiddenScheme, 'https://');
  assert.equal(address.value, 'example.com/page');
  assert.equal(address.selectionStart, 0);
  assert.equal(address.selectionEnd, 16);
});

test('download controls reject other environments and invalid states', () => {
  let paused = false;
  const record = { state: 'progressing' };
  const actions = [];
  const item = { isPaused: () => paused, canResume: () => paused, pause() { paused = true; actions.push('pause'); }, resume() { paused = false; actions.push('resume'); } };
  const context = vm.createContext({ profileDownloadItems: new Map([['file', { profileId: 'first', item }]]),
    downloadRecordFor: () => record, safeText: value => String(value || ''), safeProfileId: value => value, sendBrowserDownloads() {},
  });
  loadFunction(context, main, 'function controlProfileDownload(', 'function clearCompletedProfileDownloads(');
  assert.throws(() => context.controlProfileDownload('other', { id: 'file', action: 'pause' }), /下载任务不存在/);
  context.controlProfileDownload('first', { id: 'file', action: 'pause' });
  assert.equal(record.paused, true);
  context.controlProfileDownload('first', { id: 'file', action: 'resume' });
  assert.equal(record.paused, false);
  assert.deepEqual(actions, ['pause', 'resume']);
  record.state = 'completed';
  assert.throws(() => context.controlProfileDownload('first', { id: 'file', action: 'pause' }), /不支持/);
});

test('guest shortcuts preserve configured actions and forward browser commands only once', () => {
  const { browserShortcutCommand } = require('../src/main/browser-shortcuts');
  const sent = [];
  let prevented = 0;
  let reloads = 0;
  const contents = { id: 12, reload: () => reloads++ };
  const context = vm.createContext({ profileIdForGuestContents: () => 'profile',
    profileWindows: new Map([['profile', { isDestroyed: () => false, webContents: { send: (_channel, input) => sent.push(input) } }]]),
    store: { get: () => ({ settings: { browserShortcuts: { reload: 'custom-reload', devtools: 'custom-devtools' } } }) },
    normalizedBrowserShortcuts: value => value, shortcutMatches: (input, key) => input.key === key,
    browserShortcutCommand, toggleGuestDevTools() {},
  });
  loadFunction(context, main, 'function handleGuestShortcut(', 'function handleGuestInput(');
  const event = { preventDefault: () => prevented++ };
  context.handleGuestShortcut(event, { type: 'keyDown', key: 'custom-reload' }, contents);
  assert.equal(reloads, 1);
  assert.equal(sent.length, 0);
  context.handleGuestShortcut(event, { type: 'keyDown', key: 't', control: true, shift: true }, contents);
  assert.deepEqual({ ...sent[0] }, { command: 'restore-closed-tab', webContentsId: 12 });
  context.handleGuestShortcut(event, { type: 'keyUp', key: 't', control: true }, contents);
  assert.equal(sent.length, 1);
  assert.equal(prevented, 2);
});
