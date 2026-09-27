'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');

const {
  createExtensionStoreProxyDispatcher,
  proxyUriForNode,
  selectRandomReachableNode,
  withExtensionStoreProxy,
} = require('../src/main/extension-store-network');
const { searchCrxSosoExtensions } = require('../src/main/extension-store');
const root = path.join(__dirname, '..');

test('chooses a random node only from successful reachability checks', () => {
  const nodes = [{ id: 'reachable-a' }, { id: 'unreachable' }, { id: 'reachable-b' }];
  const results = [
    { nodeId: 'reachable-a', ok: true },
    { nodeId: 'unreachable', ok: false },
    { nodeId: 'reachable-b', reachable: true },
  ];
  const chosen = selectRandomReachableNode(nodes, results, (length) => length - 1);

  assert.equal(chosen.id, 'reachable-b');
  assert.throws(
    () => selectRandomReachableNode(nodes, [{ nodeId: 'unreachable', ok: false }]),
    /没有可联通的代理节点/,
  );
});

test('builds authenticated HTTP, HTTPS, and SOCKS5 proxy URIs', () => {
  assert.equal(proxyUriForNode({ protocol: 'http', host: 'proxy.test', port: 8080 }), 'http://proxy.test:8080/');
  assert.equal(proxyUriForNode({ protocol: 'http', host: 'proxy.test', port: 8080, tls: true }), 'https://proxy.test:8080/');
  assert.equal(
    proxyUriForNode({ protocol: 'https', host: 'proxy.test', port: 8443, username: 'name@site', password: 'p:/?#' }),
    'https://name%40site:p%3A%2F%3F%23@proxy.test:8443/',
  );
  assert.equal(proxyUriForNode({ protocol: 'socks5', host: 'proxy.test', port: 1080 }), 'socks5://proxy.test:1080');
  assert.equal(proxyUriForNode({ protocol: 'vless', host: 'core.test', port: 443, requiresCore: true }), '');
});

test('selects Undici proxy dispatchers without exposing credentials in request options', () => {
  const calls = [];
  class FakeProxyAgent {
    constructor(options) { calls.push(['proxy', options]); }
  }
  class FakeSocks5ProxyAgent {
    constructor(uri) { calls.push(['socks', uri]); }
  }

  createExtensionStoreProxyDispatcher(
    { protocol: 'http', host: 'proxy.test', port: 8080, username: 'user', password: 'secret' },
    { ProxyAgent: FakeProxyAgent, Socks5ProxyAgent: FakeSocks5ProxyAgent },
  );
  createExtensionStoreProxyDispatcher(
    { protocol: 'socks5', host: 'proxy.test', port: 1080 },
    { ProxyAgent: FakeProxyAgent, Socks5ProxyAgent: FakeSocks5ProxyAgent },
  );

  assert.equal(calls[0][0], 'proxy');
  assert.match(calls[0][1].uri, /user:secret@proxy\.test/);
  assert.deepEqual(calls[1], ['socks', 'socks5://proxy.test:1080']);
});

test('uses direct requests when no store node is selected', async () => {
  const fetchCalls = [];
  const result = await withExtensionStoreProxy(null, (request) => request('https://store.test', { method: 'HEAD' }), {
    fetchImpl: async (...args) => { fetchCalls.push(args); return 'direct'; },
  });
  assert.equal(result, 'direct');
  assert.equal(fetchCalls[0][1].dispatcher, undefined);
});

test('routes CRX Soso API requests through the injected store transport', async () => {
  let requestedUrl = '';
  const result = await searchCrxSosoExtensions({ keyword: 'adblock' }, async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => Buffer.from(JSON.stringify({ code: 200, data: { extensionList: [] } })),
    };
  });
  assert.equal(result.extensions.length, 0);
  assert.equal(requestedUrl, 'https://api.crxsoso.com/search/result?type=chrome');
});

test('sends HTTPS CONNECT through the selected HTTP proxy', async () => {
  const targets = [];
  const proxy = http.createServer();
  proxy.on('connect', (request, socket) => {
    targets.push(request.url);
    socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const { port } = proxy.address();
  try {
    await assert.rejects(withExtensionStoreProxy({ protocol: 'http', host: '127.0.0.1', port }, (request) => (
      request('https://chromewebstore.google.com/search/proxy-test')
    )));
    assert.deepEqual(targets, ['chromewebstore.google.com:443']);
  } finally {
    await new Promise((resolve) => proxy.close(resolve));
  }
});

test('starts a temporary core proxy and always stops it after the request', async () => {
  const calls = [];
  const dispatcher = { close: async () => calls.push('dispatcher-close') };
  class FakeSocks5ProxyAgent {
    constructor(uri) { calls.push(['socks-uri', uri]); return dispatcher; }
  }
  const result = await withExtensionStoreProxy({
    id: 'core-node', protocol: 'vless', host: 'remote.test', port: 443, requiresCore: true,
  }, async (request) => {
    await request('https://store.test');
    return 'done';
  }, {
    startCore: async () => { calls.push('core-start'); return { port: 19081 }; },
    stopCore: async () => calls.push('core-stop'),
    factories: { Socks5ProxyAgent: FakeSocks5ProxyAgent },
    fetchImpl: async (_url, init) => {
      assert.equal(init.dispatcher, dispatcher);
      return { ok: true };
    },
  });

  assert.equal(result, 'done');
  assert.deepEqual(calls, [
    'core-start',
    ['socks-uri', 'socks5://127.0.0.1:19081'],
    'dispatcher-close',
    'core-stop',
  ]);
});

test('cleans up a temporary core when the proxied request fails', async () => {
  let stopped = false;
  await assert.rejects(withExtensionStoreProxy({
    id: 'core-node', protocol: 'vless', host: 'remote.test', port: 443, requiresCore: true,
  }, (request) => request('https://store.test'), {
    startCore: async () => ({ port: 19082 }),
    stopCore: async () => { stopped = true; },
    factories: { Socks5ProxyAgent: class { close() {} } },
    fetchImpl: async () => { throw new Error('proxy failed'); },
  }), /proxy failed/);
  assert.equal(stopped, true);
});

test('rejects malformed or unsupported proxy nodes', () => {
  assert.throws(() => proxyUriForNode({ protocol: 'http', host: '', port: 80 }), /地址无效/);
  assert.throws(() => proxyUriForNode({ protocol: 'http', host: 'proxy.test@other.test', port: 80 }), /地址无效/);
  assert.throws(() => proxyUriForNode({ protocol: 'http', host: 'proxy.test/path', port: 80 }), /地址无效/);
  assert.throws(() => proxyUriForNode({ protocol: 'vmess', host: 'proxy.test', port: 443 }), /不支持/);
});

test('store discovery and install UI pass the selected node ID through their IPC calls', () => {
  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8');

  assert.equal((html.match(/data-extension-store-proxy-node/g) || []).length, 2);
  assert.match(html, /id="extension-store-proxy-node"/);
  assert.match(html, /id="extension-store-install-proxy-node"/);
  assert.match(renderer, /function extensionStoreProxyNodeId\(\)/);
  assert.match(renderer, /proxyNodeId: extensionStoreProxyNodeId\(\)/);
  assert.match(main, /function withExtensionStoreNode\(proxyNodeId, operation\)/);
  assert.match(main, /function selectRandomExtensionStoreNode\(\)/);
  assert.match(main, /handle\('extension:select-official-store-proxy'/);
  assert.match(preload, /selectOfficialExtensionStoreProxy: \(\) => invoke\('extension:select-official-store-proxy'\)/);
  assert.match(renderer, /await ensureOfficialStoreProxyForRequest\(\)/);
  assert.match(renderer, /if \(!extensionStoreProxyNodeId\(\) && !appState\.extensionStore\.proxyNodeSelectionExplicit\)/);
  assert.match(renderer, /async function selectExtensionStoreSource\(source\)[\s\S]*?await selectRandomOfficialStoreProxy\(\)[\s\S]*?void searchExtensionStore\(\)/);
  assert.match(renderer, /case "install-extension-store":[\s\S]*?selectRandomOfficialStoreProxy\(\)/);
  assert.match(main, /searchOfficialExtensionStore\(payload, requestFetch\)/);
  assert.match(main, /getOfficialExtensionStoreDetail\(payload\.extensionId, requestFetch\)/);
  assert.match(main, /fetchExtensionResource\(downloadUrl, MAX_EXTENSION_ARCHIVE_BYTES, requestFetch\)/);
});
