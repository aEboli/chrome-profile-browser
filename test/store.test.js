const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/store');

test('store loads defaults and writes atomically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);

  assert.equal(store.load().profiles.length, 0);
  store.update((state) => {
    state.profiles.push({ id: 'p1', name: '测试环境' });
  });

  const reloaded = createStore(filePath);
  const state = reloaded.load();
  assert.equal(state.profiles[0].id, 'p1');
  assert.equal(state.profiles[0].name, '测试环境');
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
});

test('store provides browser shell agent and search defaults', () => {
  const state = createStore(path.join(os.tmpdir(), `chrome-profile-browser-${Date.now()}-defaults`, 'state.json')).load();
  assert.equal(state.settings.agentApiUrl, '');
  assert.equal(state.settings.agentProtocolSuffix, '');
  assert.equal(state.settings.agentApi, '');
  assert.equal(state.settings.agentKey, '');
  assert.equal(state.settings.agentProtocol, 'openai-chat-completions');
  assert.equal(state.settings.agentBaseUrl, '');
  assert.equal(state.settings.agentModel, '');
  assert.equal(state.settings.agentContextBudgetTokens, 200000);
  assert.equal(state.settings.agentMaxOutputTokens, 8192);
  assert.equal(state.settings.agentReasoningEffort, 'medium');
  assert.equal(state.settings.agentMaxSteps, 0);
  assert.equal(state.settings.agentProfileScope, 'all');
  assert.deepEqual(state.settings.agentProfileIds, []);
  assert.deepEqual(state.settings.agentProfileOverrides, {});
  assert.equal(state.settings.jevProvider, 'typesafe');
  assert.equal(state.settings.jevBaseUrl, 'https://api.typesafe.ai');
  assert.equal(state.settings.jevModel, 'jev-latest');
  assert.equal(state.settings.jevKey, '');
  assert.equal(state.settings.searchEngineUrl, 'https://www.google.com/search?q=%s');
  assert.deepEqual(state.settings.browserShortcuts, { reload: 'F5', devtools: 'F12' });
  assert.deepEqual(state.settings.mouseGesture, {
    enabled: true,
    button: 'right',
    sequence: ['right', 'left'],
    threshold: 80,
    action: 'back',
  });
  assert.equal(state.settings.theme.preset, 'midnight');
  assert.equal(state.settings.theme.background, '#0f1423');
});

test('store provides new-tab search, site, banner, and bookmark-bar defaults', () => {
  const state = createStore(path.join(os.tmpdir(), `chrome-profile-browser-${Date.now()}-new-tab`, 'state.json')).load();
  assert.deepEqual(state.settings.searchEngines.map((item) => item.name), ['Google', 'Bing', '百度', 'DuckDuckGo']);
  assert.equal(state.settings.searchEngines[0].url, 'https://www.google.com/search?q=%s');
  assert.equal(state.settings.bookmarkBarAlwaysVisible, false);
  assert.ok(state.settings.newTabSites.some((item) => item.name === 'GitHub'));
  assert.deepEqual(state.settings.newTabBanner, { type: 'image', source: '' });
});

test('store drops unsafe new-tab media and site URLs while keeping safe values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  fs.writeFileSync(filePath, JSON.stringify({ settings: {
    newTabSites: [
      { id: 'safe', name: '安全站点', url: 'https://example.com/', icon: 'E' },
      { id: 'bad', name: '脚本', url: 'javascript:alert(1)' },
    ],
    newTabBanner: { type: 'video', source: 'javascript:alert(1)' },
  } }), 'utf8');
  const state = createStore(filePath).load();
  assert.deepEqual(state.settings.newTabSites.map((item) => item.id), ['safe']);
  assert.deepEqual(state.settings.newTabBanner, { type: 'image', source: '' });
});

test('store falls back from an invalid agent reasoning level', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  fs.writeFileSync(filePath, JSON.stringify({ settings: { agentReasoningEffort: 'unsupported' } }), 'utf8');
  assert.equal(createStore(filePath).load().settings.agentReasoningEffort, 'medium');
});

test('store normalizes theme colors and keeps bounded background images', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.settings.theme = {
      preset: 'custom',
      background: '#ABCDEF',
      surface: 'not-a-color',
      backgroundOpacity: 4,
      blur: -5,
      radius: 200,
      backgroundImage: 'data:image/png;base64,AAAA',
    };
  });
  const theme = createStore(filePath).load().settings.theme;
  assert.equal(theme.preset, 'custom');
  assert.equal(theme.background, '#abcdef');
  assert.equal(theme.surface, '#101f30');
  assert.equal(theme.backgroundOpacity, 1);
  assert.equal(theme.blur, 0);
  assert.equal(theme.radius, 24);
  assert.equal(theme.backgroundImage, 'data:image/png;base64,AAAA');
  store.update((state) => { state.settings.theme.backgroundImage = ''; });
  assert.equal(createStore(filePath).load().settings.theme.backgroundImage, '');
});

test('store recovers from malformed JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  fs.writeFileSync(filePath, '{broken', 'utf8');
  const state = createStore(filePath).load();
  assert.deepEqual(state.profiles, []);
  assert.deepEqual(state.nodes, []);
});

test('store keeps subscription sources and core settings across reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.subscriptions.push({ id: 'sub-1', name: '测试订阅', url: 'enc:value' });
    state.settings.xrayPath = 'C:\\tools\\xray.exe';
  });
  const state = createStore(filePath).load();
  assert.equal(state.subscriptions[0].id, 'sub-1');
  assert.equal(state.settings.xrayPath, 'C:\\tools\\xray.exe');
});

test('store migrates subscription ordering and keeps numeric priority stable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.subscriptions.push(
      { id: 'legacy-a', name: '旧订阅 A' },
      { id: 'legacy-b', name: '旧订阅 B' },
      { id: 'priority', name: '优先订阅', sortOrder: 0 },
      { id: 'later', name: '靠后订阅', sortOrder: 8 },
    );
  });
  const state = createStore(filePath).load();
  assert.deepEqual(state.subscriptions.map((item) => item.id), ['priority', 'later', 'legacy-a', 'legacy-b']);
  assert.deepEqual(state.subscriptions.map((item) => item.sortOrder), [0, 8, 9, 10]);
});

test('store keeps extension assignments across reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.profiles.push({ id: 'profile-1', name: '测试环境' });
    state.extensions.push({ id: 'extension-1', name: '测试插件', profileIds: ['profile-1'], pinnedProfileIds: ['profile-1'] });
  });
  const state = createStore(filePath).load();
  assert.deepEqual(state.extensions[0].profileIds, ['profile-1']);
  assert.deepEqual(state.extensions[0].pinnedProfileIds, ['profile-1']);
});

test('store keeps connection health fields across reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.nodes.push({
      id: 'node-1',
      protocol: 'http',
      host: '127.0.0.1',
      port: 8080,
      status: 'reachable',
      latencyMs: 42,
      lastCheckedAt: '2026-09-22T04:00:00.000Z',
      lastCheckPhase: 'proxy-handshake',
      lastCheckError: '',
    });
  });
  const state = createStore(filePath).load();
  assert.equal(state.nodes[0].status, 'reachable');
  assert.equal(state.nodes[0].latencyMs, 42);
  assert.equal(state.nodes[0].lastCheckPhase, 'proxy-handshake');
});

test('store keeps profile bookmarks across reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.profiles.push({
      id: 'profile-bookmark',
      name: '收藏环境',
      bookmarks: [{ id: 'bookmark-1', title: '示例', url: 'https://example.com/' }],
    });
    state.subscriptions.push({ id: 'sub-plain', url: 'https://provider.example/sub?token=local' });
  });
  const state = createStore(filePath).load();
  assert.equal(state.profiles[0].bookmarks[0].url, 'https://example.com/');
  assert.equal(state.subscriptions[0].url, 'https://provider.example/sub?token=local');
});

test('store keeps bookmark folders and favicons isolated by profile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.profiles.push(
      {
        id: 'profile-bookmark-tree-a',
        name: '收藏环境 A',
        bookmarks: [
          { id: 'folder-a', type: 'folder', title: '工作', parentId: '' },
          { id: 'link-a', type: 'bookmark', title: '示例', url: 'https://example.com/', favicon: 'https://example.com/icon.png', parentId: 'folder-a' },
        ],
      },
      { id: 'profile-bookmark-tree-b', name: '收藏环境 B', bookmarks: [] },
    );
  });

  const state = createStore(filePath).load();
  const profileA = state.profiles.find((item) => item.id === 'profile-bookmark-tree-a');
  const profileB = state.profiles.find((item) => item.id === 'profile-bookmark-tree-b');
  assert.equal(profileA.bookmarks[1].parentId, 'folder-a');
  assert.equal(profileA.bookmarks[1].favicon, 'https://example.com/icon.png');
  assert.deepEqual(profileB.bookmarks, []);
});

test('store keeps profile traffic counters across reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.profiles.push({
      id: 'profile-traffic',
      name: '流量环境',
      traffic: { uploadedBytes: 12, downloadedBytes: 34, totalBytes: 46, requestCount: 2 },
    });
  });
  const state = createStore(filePath).load();
  assert.deepEqual(state.profiles[0].traffic, {
    uploadedBytes: 12,
    downloadedBytes: 34,
    totalBytes: 46,
    requestCount: 2,
  });
});

test('store keeps per-profile new-tab site visit summaries across reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.profiles.push({
      id: 'profile-common-sites',
      name: '常用网站环境',
      newTabSiteVisits: [{ host: 'example.com', origin: 'https://example.com', visits: 2, lastVisited: 1_800_000_000_000 }],
      searchHistory: ['temu卖家中心', '店小秘'],
    });
  });
  const state = createStore(filePath).load();
  assert.deepEqual(state.profiles[0].newTabSiteVisits, [
    { host: 'example.com', origin: 'https://example.com', visits: 2, lastVisited: 1_800_000_000_000 },
  ]);
  assert.deepEqual(state.profiles[0].searchHistory, ['temu卖家中心', '店小秘']);
});

test('store keeps password book entries across reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-browser-'));
  const filePath = path.join(dir, 'state.json');
  const store = createStore(filePath);
  store.load();
  store.update((state) => {
    state.profiles.push({ id: 'profile-1', name: 'Test profile' });
    state.passwordEntries.push({
      id: 'password-1',
      profileId: 'profile-1',
      service: 'Example',
      account: 'user@example.com',
      password: 'enc:c2VjcmV0',
    });
  });
  const state = createStore(filePath).load();
  assert.equal(state.profiles[0].id, 'profile-1');
  assert.equal(state.passwordEntries[0].service, 'Example');
  assert.equal(state.passwordEntries[0].profileId, 'profile-1');
  assert.equal(state.passwordEntries[0].password, 'enc:c2VjcmV0');
});
