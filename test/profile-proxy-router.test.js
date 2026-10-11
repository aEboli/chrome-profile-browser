'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { buildUpstreamProxyUrl, createProfileProxyRouter } = require('../src/main/profile-proxy-router');

async function startMockProxy(name) {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(name);
  });
  server.on('connect', (_request, socket) => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    socket.on('end', () => socket.end());
    socket.on('data', (data) => socket.write(`${name}:${data.toString()}`));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

function getThroughProxy(port, url) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: '127.0.0.1',
      port,
      path: url,
      headers: { host: new URL(url).host },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    });
    request.once('error', reject);
  });
}

function openTunnel(port, host = 'example.test:443') {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method: 'CONNECT', path: host });
    request.once('connect', (_response, socket, head) => resolve({ socket, head }));
    request.once('error', reject);
    request.end();
  });
}

function exchange(socket, value) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tunnel response timed out')), 1000);
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once('data', (data) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
    socket.write(value);
  });
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(() => resolve()));
}

test('encodes HTTP credentials and preserves TLS and SOCKS5 upstream schemes', () => {
  const secureProxy = new URL(buildUpstreamProxyUrl({
    protocol: 'http',
    tls: true,
    host: 'proxy.example',
    port: 8443,
    username: 'user name',
    password: 'p@ss word',
  }));
  assert.equal(secureProxy.protocol, 'https:');
  assert.equal(decodeURIComponent(secureProxy.username), 'user name');
  assert.equal(decodeURIComponent(secureProxy.password), 'p@ss word');

  const socksProxy = new URL(buildUpstreamProxyUrl({ protocol: 'socks5', host: '::1', port: 1080 }));
  assert.equal(socksProxy.protocol, 'socks5h:');
  assert.equal(socksProxy.hostname, '[::1]');
});

test('switches new requests in place and keeps old tunnels on their original core', async () => {
  const first = await startMockProxy('first');
  const second = await startMockProxy('second');
  const firstCore = { nodeId: 'first' };
  const secondCore = { nodeId: 'second' };
  const router = await createProfileProxyRouter({
    nodeId: 'first',
    coreRuntime: firstCore,
    upstreamProxyUrl: first.url,
  });
  const firstTunnel = await openTunnel(router.port);
  const idleRuntimes = [];
  router.on('core-runtime-idle', (runtime) => idleRuntimes.push(runtime));

  try {
    assert.equal(await getThroughProxy(router.port, 'http://example.test/one'), 'first');
    const previousRoute = router.setRoute({
      nodeId: 'second',
      coreRuntime: secondCore,
      upstreamProxyUrl: second.url,
    });
    assert.equal(previousRoute.nodeId, 'first');
    router.retireCoreRuntime(firstCore);
    assert.equal(router.isCoreRuntimeInUse(firstCore), true);
    assert.deepEqual(idleRuntimes, []);

    assert.equal(await exchange(firstTunnel.socket, 'still-open'), 'first:still-open');
    assert.equal(await getThroughProxy(router.port, 'http://example.test/two'), 'second');
    assert.equal(router.isCoreRuntimeInUse(firstCore), true);

    const idle = new Promise((resolve) => router.on('core-runtime-idle', resolve));
    firstTunnel.socket.destroy();
    assert.equal(await idle, firstCore);
    assert.equal(router.isCoreRuntimeInUse(firstCore), false);

    const secondTunnel = await openTunnel(router.port);
    try {
      assert.equal(await exchange(secondTunnel.socket, 'new-route'), 'second:new-route');
    } finally {
      secondTunnel.socket.destroy();
    }
  } finally {
    firstTunnel.socket.destroy();
    await router.close();
    await Promise.all([closeServer(first.server), closeServer(second.server)]);
  }
});
