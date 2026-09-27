'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  parseCoreObject,
  parseCoreUri,
  parseV2raySubscriptionContent,
} = require('../src/main/v2ray-parser');

const UUID = '11111111-1111-1111-1111-111111111111';

test('parses common v2rayN URI protocols into Xray nodes', () => {
  const vless = parseCoreUri(`vless://${UUID}@edge.example:443?encryption=none&security=tls&type=ws&path=%2Fedge&sni=edge.example#VLESS`, 'https://sub.example/path?token=secret');
  assert.equal(vless.status, 'supported');
  assert.equal(vless.requiresCore, true);
  assert.equal(vless.coreConfig.network, 'ws');
  assert.equal(vless.coreConfig.uuid, UUID);
  assert.equal(vless.source, 'https://sub.example/');

  const trojan = parseCoreUri('trojan://password@example.com:443?security=tls&type=grpc&serviceName=web#trojan', 'paste');
  assert.equal(trojan.status, 'supported');
  assert.equal(trojan.coreConfig.password, 'password');
  assert.equal(trojan.coreConfig.serviceName, 'web');

  const ssPayload = Buffer.from('chacha20-ietf-poly1305:secret').toString('base64');
  const ss = parseCoreUri(`ss://${ssPayload}@ss.example:8388#ss`, 'paste');
  assert.equal(ss.status, 'supported');
  assert.equal(ss.protocol, 'ss');
  assert.equal(ss.coreConfig.method, 'chacha20-ietf-poly1305');
});

test('parses Clash core proxy objects and base64 subscriptions', () => {
  const yaml = `proxies:\n  - name: vless-edge\n    type: vless\n    server: edge.example\n    port: 443\n    uuid: ${UUID}\n    network: ws\n    tls: true\n    ws-opts:\n      path: /chat\n      headers:\n        Host: cdn.example\n`;
  const result = parseV2raySubscriptionContent(yaml, { source: 'paste' });
  assert.equal(result.format, 'clash-yaml');
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].coreConfig.path, '/chat');

  const encoded = Buffer.from(`vless://${UUID}@edge.example:443?security=tls#one\n`).toString('base64');
  const decoded = parseV2raySubscriptionContent(encoded, { source: 'https://sub.example/list?token=secret' });
  assert.equal(decoded.format, 'base64');
  assert.equal(decoded.nodes.length, 1);
  assert.equal(decoded.nodes[0].source, 'https://sub.example/');
});

test('keeps unsupported transports explicit and does not echo secrets', () => {
  const unsupported = parseCoreUri('vless://secret@example.com:443?security=tls&type=quic#private-label', 'https://sub.example/list?token=top-secret');
  assert.equal(unsupported.status, 'unsupported');
  assert.match(unsupported.reason, /传输方式/);
  assert.doesNotMatch(JSON.stringify(unsupported), /top-secret|private-label|secret/);

  const object = parseCoreObject({ type: 'trojan', name: 'private', server: 'edge.example', port: 443, password: 'secret', tls: true }, 'paste');
  assert.equal(object.status, 'supported');
  assert.equal(object.coreConfig.password, 'secret');
});

test('parses AnyTLS URI nodes for the sing-box core', () => {
  const node = parseCoreUri(
    'anytls://pass%3Aword@edge.example:443?insecure=1&sni=cdn.example#HK%20%E9%A6%99%E6%B8%AF',
    'paste',
  );
  assert.equal(node.status, 'supported');
  assert.equal(node.protocol, 'anytls');
  assert.equal(node.core, 'singbox');
  assert.equal(node.coreConfig.type, 'anytls');
  assert.equal(node.coreConfig.password, 'pass:word');
  assert.equal(node.coreConfig.tls, true);
  assert.equal(node.coreConfig.allowInsecure, true);
  assert.equal(node.coreConfig.sni, 'cdn.example');
  assert.equal(node.name, 'HK 香港');
});

test('parses AnyTLS Clash objects and keeps metadata labels', () => {
  const result = parseV2raySubscriptionContent(`proxies:\n  - name: 剩余流量：74.43 GB\n    type: anytls\n    server: edge.example\n    port: 443\n    password: secret\n    skip-cert-verify: true\n`, { source: 'paste' });
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].name, '剩余流量：74.43 GB');
  assert.equal(result.nodes[0].core, 'singbox');
  assert.equal(result.nodes[0].coreConfig.allowInsecure, true);
});

test('retains passwordless AnyTLS info rows for metadata extraction only', () => {
  const result = parseV2raySubscriptionContent(
    'anytls://edge.example:443#%E5%89%A9%E4%BD%99%E6%B5%81%E9%87%8F%EF%BC%9A1%20GB',
    { source: 'paste' },
  );
  assert.equal(result.nodes.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.unsupported[0].name, '剩余流量：1 GB');
});
