'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');

const {
  normalizeProxyNode,
  parseSubscriptionContent,
  parseSubscriptionText,
  resolveSubscriptionRedirect,
  sanitizeSource,
} = require('../src/main/proxy-parser');
const { checkNodeReachability, checkProxyReachability } = require('../src/main/proxy-check');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

test('parses HTTP and SOCKS5 URI lines with credentials and names', () => {
  const result = parseSubscriptionText([
    '# comment',
    'http://alice:p%40ss@proxy.example:8080#办公%20节点',
    'socks5://127.0.0.1:1080#local',
    'http://alice:p%40ss@proxy.example:8080#办公%20节点',
  ].join('\n'), { source: 'unit-uri' });

  assert.equal(result.format, 'uri-list');
  assert.equal(result.nodes.length, 2, 'duplicate URI should be de-duplicated');
  assert.deepEqual(result.nodes[0], {
    id: result.nodes[0].id,
    name: '办公 节点',
    protocol: 'http',
    host: 'proxy.example',
    port: 8080,
    supported: true,
    status: 'supported',
    username: 'alice',
    password: 'p@ss',
    source: 'unit-uri',
    line: 2,
  });
  assert.equal(result.errors.length, 0);
});

test('keeps SOCKS5 credentials when a provider appends a display marker', () => {
  const result = parseSubscriptionText(
    'socks5://longlong:Bu82spYrFH@dg.xuyao.xyz:23888 ♾',
    { source: 'https://dg.xuyao.xyz/sub/longlong' },
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].protocol, 'socks5');
  assert.equal(result.nodes[0].host, 'dg.xuyao.xyz');
  assert.equal(result.nodes[0].port, 23888);
  assert.equal(result.nodes[0].username, 'longlong');
  assert.equal(result.nodes[0].password, 'Bu82spYrFH');
});

test('decodes a Base64 URI subscription from a Buffer', () => {
  const encoded = Buffer.from('http://127.0.0.1:8080#one\nsocks5://127.0.0.1:1080#two\n').toString('base64');
  const result = parseSubscriptionContent(Buffer.from(encoded), { source: 'unit-base64' });

  assert.equal(result.format, 'base64');
  assert.equal(result.encoding, 'base64');
  assert.deepEqual(result.nodes.map((node) => [node.protocol, node.host, node.port, node.name]), [
    ['http', '127.0.0.1', 8080, 'one'],
    ['socks5', '127.0.0.1', 1080, 'two'],
  ]);
  assert.equal(result.errors.length, 0);
});

test('parses Clash YAML and reports unsupported protocols explicitly', () => {
  const result = parseSubscriptionText(`
proxies:
  - name: office
    type: http
    server: proxy.example
    port: 3128
    username: alice
    password: secret
  - name: legacy
    type: vmess
    server: legacy.example
    port: 443
  - name: socks
    type: socks5
    server: 127.0.0.1
    port: 1080
    udp: true
`, { source: 'unit-clash' });

  assert.equal(result.format, 'clash-yaml');
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0].username, 'alice');
  assert.equal(result.nodes[1].udp, true);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.unsupported[0].protocol, 'vmess');
  assert.match(result.unsupported[0].reason, /暂不支持/);
  assert.equal(result.errors.length, 0);
});

test('normalizes object nodes and keeps unknown URI schemes visible', () => {
  const normalized = normalizeProxyNode({
    name: 'TLS proxy',
    type: 'http',
    server: 'proxy.example',
    port: '443',
    tls: true,
    'skip-cert-verify': true,
  }, 'unit-object');
  assert.equal(normalized.status, 'supported');
  assert.equal(normalized.protocol, 'http');
  assert.equal(normalized.tls, true);
  assert.equal(normalized.skipCertVerify, true);
  assert.equal(normalized.source, 'unit-object');

  const result = parseSubscriptionText('vless://token@example.test:443#unsupported');
  assert.equal(result.nodes.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.unsupported[0].protocol, 'vless');
});

test('normalizes manually configured HTTPS and SOCKS5 remote DNS fields', () => {
  const https = normalizeProxyNode({
    type: 'https',
    name: '手动 HTTPS',
    server: '[::1]',
    port: 8443,
    username: 'alice',
    password: 'secret',
    sni: 'proxy.example',
  }, { source: 'manual' });
  assert.equal(https.status, 'supported');
  assert.equal(https.protocol, 'http');
  assert.equal(https.tls, true);
  assert.equal(https.host, '::1');
  assert.equal(https.sni, 'proxy.example');
  assert.equal(https.source, 'manual');

  const socks = normalizeProxyNode({
    type: 'socks5',
    name: '手动 SOCKS5',
    server: '127.0.0.1',
    port: 1080,
    remoteDns: true,
  }, { source: 'manual' });
  assert.equal(socks.status, 'supported');
  assert.equal(socks.protocol, 'socks5');
  assert.equal(socks.remoteDns, true);
});

test('keeps optional country metadata for connection display', () => {
  const result = parseSubscriptionText(`
proxies:
  - name: Tokyo edge
    type: http
    server: proxy.example
    port: 8080
    country: JP
`, { source: 'unit-country' });
  assert.equal(result.nodes[0].country, 'JP');
});

test('redacts subscription source and malformed URI diagnostics', () => {
  const source = 'https://user:password@sub.example.test/subscription/secret-token?access_token=top-secret#fragment';
  const result = parseSubscriptionText([
    'vless://uuid@proxy.example.test:443/path/secret-token?token=top-secret#fragment-secret',
    'http://user:password@bad host/path/secret?token=top-secret',
  ].join('\n'), { source });

  assert.equal(result.source, 'https://sub.example.test/');
  assert.equal(result.unsupported[0].source, 'https://sub.example.test/');
  assert.equal(result.errors[0].source, 'https://sub.example.test/');
  assert.doesNotMatch(JSON.stringify(result), /password|top-secret|secret-token|access_token/);
  assert.equal(sanitizeSource('https://sub.example.test/path/token?token=secret#x'), 'https://sub.example.test/');
  assert.equal(sanitizeSource('data:text/plain,secret?token=top-secret'), 'data:');
});

test('does not echo labels from unsupported subscription nodes', () => {
  const result = parseSubscriptionText(`
proxies:
  - name: TOPSECRET123
    type: vmess
    server: proxy.example.test
    port: 443
`, { source: 'paste' });

  assert.equal(result.unsupported[0].name, 'vmess 节点');
  assert.doesNotMatch(JSON.stringify(result), /TOPSECRET123/);
});

test('does not echo subscription content in YAML parse diagnostics', () => {
  const result = parseSubscriptionText('proxies:\n  - name: [secret-token\n    type: http', {
    source: 'https://sub.example.test/list?token=top-secret',
  });

  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].reason, 'YAML 解析失败：请检查订阅格式');
  assert.doesNotMatch(JSON.stringify(result), /secret-token|top-secret/);
});

test('redacts raw text from invalid subscription diagnostics', () => {
  const result = parseSubscriptionText([
    'secret-token-without-a-scheme',
    'http://bad host/path?token=top-secret',
  ].join('\n'), { source: 'paste' });

  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.errors.map((error) => error.raw), ['[已隐藏]', '[已隐藏]']);
  assert.doesNotMatch(JSON.stringify(result), /secret-token|top-secret/);

  const unknown = parseSubscriptionText('# only comments\n; no nodes', { source: 'paste' });
  assert.equal(unknown.format, 'unknown');
  assert.equal(unknown.errors[0].raw, '[已隐藏]');
});

test('includes transport parameters in stable node ids', () => {
  const plain = normalizeProxyNode('http://alice:one@proxy.example.test:8080#same');
  const tls = normalizeProxyNode('https://alice:one@proxy.example.test:8080#same');
  const password = normalizeProxyNode('http://alice:two@proxy.example.test:8080#same');
  const sni = normalizeProxyNode({
    type: 'http', server: 'proxy.example.test', port: 8080, name: 'same', sni: 'edge.example.test',
  });

  assert.notEqual(plain.id, tls.id);
  assert.notEqual(plain.id, password.id);
  assert.notEqual(plain.id, sni.id);
});

test('validates subscription redirects without HTTPS downgrade', () => {
  const secure = new URL('https://sub.example.test/start');
  assert.equal(
    resolveSubscriptionRedirect(secure, '/next').toString(),
    'https://sub.example.test/next',
  );
  assert.equal(
    resolveSubscriptionRedirect(new URL('http://sub.example.test/start'), 'https://cdn.example.test/list').protocol,
    'https:',
  );
  assert.throws(
    () => resolveSubscriptionRedirect(secure, 'http://sub.example.test/next'),
    /降级到 HTTP/,
  );
  assert.throws(
    () => resolveSubscriptionRedirect(secure, 'file:///C:/secret'),
    /必须使用 HTTP 或 HTTPS/,
  );
  assert.throws(
    () => resolveSubscriptionRedirect(secure, 'https://user:password@sub.example.test/next'),
    /不得包含账号密码/,
  );
});

test('checks an HTTP proxy CONNECT handshake against a local server', async () => {
  const requests = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      if (!buffer.includes('\r\n\r\n')) return;
      requests.push(buffer);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    });
  });
  const port = await listen(server);
  try {
    const result = await checkProxyReachability({
      id: 'http-local', protocol: 'http', host: '127.0.0.1', port,
    }, { targetHost: 'unit.test', targetPort: 80, timeoutMs: 1000 });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'reachable');
    assert.equal(result.phase, 'proxy-handshake');
    assert.equal(Number.isInteger(result.latencyMs), true);
    assert.equal(result.ipAddress, '127.0.0.1');
    assert.equal(requests.length, 1);
    assert.match(requests[0], /^CONNECT unit\.test:80 HTTP\/1\.1/m);
  } finally {
    await close(server);
  }
});

test('checks a core-managed node by TCP reachability and reports latency', async () => {
  const server = net.createServer();
  const port = await listen(server);
  try {
    const result = await checkNodeReachability({
      id: 'vless-local',
      protocol: 'vless',
      host: '127.0.0.1',
      port,
      requiresCore: true,
      coreConfig: { type: 'vless', address: '127.0.0.1', port },
      status: 'supported',
    }, { timeoutMs: 1000 });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'reachable');
    assert.equal(result.phase, 'tcp-connect');
    assert.equal(result.protocol, 'vless');
    assert.equal(Number.isInteger(result.latencyMs), true);
    assert.equal(result.ipAddress, '127.0.0.1');
  } finally {
    await close(server);
  }
});

test('checks a core-managed node through a temporary proxy when a core probe is provided', async () => {
  const server = net.createServer((socket) => {
    socket.once('data', (greeting) => {
      assert.equal(greeting[0], 0x05);
      socket.write(Buffer.from([0x05, 0x00]));
      socket.once('data', (request) => {
        assert.equal(request[0], 0x05);
        assert.equal(request[1], 0x01);
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 80]));
      });
    });
  });
  const port = await listen(server);
  let cleaned = false;
  try {
    const result = await checkNodeReachability({
      id: 'trojan-probe',
      protocol: 'trojan',
      host: 'remote.example',
      port: 443,
      requiresCore: true,
      coreConfig: { type: 'trojan', address: 'remote.example', port: 443 },
      status: 'supported',
    }, {
      timeoutMs: 1000,
      startCore: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { port };
      },
      cleanupCore: async () => { cleaned = true; },
      targetHost: 'unit.test',
      targetPort: 80,
    });
    assert.equal(result.ok, true);
    assert.equal(result.phase, 'proxy-handshake');
    assert.equal(result.protocol, 'trojan');
    assert.ok(result.latencyMs >= 30, `core startup time was dropped: ${result.latencyMs} ms`);
    assert.equal(cleaned, true);
  } finally {
    await close(server);
  }
});

test('checks a SOCKS5 no-auth handshake through an injected connector', async () => {
  const server = net.createServer((socket) => {
    socket.once('data', (greeting) => {
      assert.equal(greeting[0], 0x05);
      socket.write(Buffer.from([0x05, 0x00]));
      socket.once('data', (request) => {
        assert.equal(request[0], 0x05);
        assert.equal(request[1], 0x01);
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 80]));
      });
    });
  });
  const port = await listen(server);
  let connectorOptions;
  try {
    const result = await checkProxyReachability({
      id: 'socks-local', protocol: 'socks5', host: 'proxy.invalid', port,
    }, {
      targetHost: 'unit.test',
      targetPort: 80,
      timeoutMs: 1000,
      connect(options) {
        connectorOptions = options;
        return net.connect({ host: '127.0.0.1', port: options.port });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'reachable');
    assert.equal(result.phase, 'proxy-handshake');
    assert.equal(connectorOptions.host, 'proxy.invalid');
    assert.equal(connectorOptions.port, port);
  } finally {
    await close(server);
  }
});

test('returns unsupported without opening a socket', async () => {
  const result = await checkProxyReachability({
    id: 'unsupported', protocol: 'vmess', host: '127.0.0.1', port: 1, supported: false,
    reason: '协议 vmess 暂不支持',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.phase, 'validation');
});

test('bounds a connector that never resolves', async () => {
  const result = await checkProxyReachability({
    id: 'hanging', protocol: 'http', host: 'proxy.invalid', port: 8080,
  }, {
    timeoutMs: 25,
    connect: () => new Promise(() => {}),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unreachable');
  assert.equal(result.code, 'ETIMEDOUT');
  assert.equal(result.phase, 'timeout');
  assert.equal(Number.isInteger(result.latencyMs), true);
});
