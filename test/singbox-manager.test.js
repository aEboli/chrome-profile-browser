'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildSingboxConfig } = require('../src/main/singbox-manager');

test('builds a loopback mixed inbound for a VLESS WebSocket TLS node', () => {
  const config = buildSingboxConfig({
    coreConfig: {
      type: 'vless', uuid: 'uuid', address: 'edge.example', port: 443,
      network: 'ws', security: 'tls', tls: true, sni: 'cdn.example',
      path: '/chat', host: 'cdn.example',
    },
  }, 17656);
  assert.equal(config.inbounds[0].type, 'mixed');
  assert.equal(config.inbounds[0].listen, '127.0.0.1');
  assert.equal(config.inbounds[0].listen_port, 17656);
  assert.equal(config.outbounds[0].type, 'vless');
  assert.equal(config.outbounds[0].transport.type, 'ws');
  assert.equal(config.outbounds[0].tls.server_name, 'cdn.example');
});

test('builds Shadowsocks without transport settings', () => {
  const config = buildSingboxConfig({
    coreConfig: {
      type: 'shadowsocks', method: 'aes-128-gcm', password: 'secret',
      address: 'edge.example', port: 8388,
    },
  }, 17657);
  assert.equal(config.outbounds[0].type, 'shadowsocks');
  assert.equal(config.outbounds[0].method, 'aes-128-gcm');
  assert.equal(Object.hasOwn(config.outbounds[0], 'transport'), false);
});

test('builds an AnyTLS outbound with required TLS settings', () => {
  const config = buildSingboxConfig({
    coreConfig: {
      type: 'anytls', password: 'secret', address: 'edge.example', port: 443,
      sni: 'cdn.example', allowInsecure: true,
    },
  }, 17659);
  assert.equal(config.outbounds[0].type, 'anytls');
  assert.equal(config.outbounds[0].password, 'secret');
  assert.equal(config.outbounds[0].tls.enabled, true);
  assert.equal(config.outbounds[0].tls.server_name, 'cdn.example');
  assert.equal(config.outbounds[0].tls.insecure, true);
});

test('rejects unsupported sing-box transports explicitly', () => {
  assert.throws(() => buildSingboxConfig({
    coreConfig: { type: 'vless', uuid: 'uuid', address: 'edge.example', port: 443, network: 'xhttp' },
  }, 17658), /暂不支持/);
});
