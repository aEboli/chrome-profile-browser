'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildXrayConfig } = require('../src/main/core-manager');

test('builds a loopback SOCKS inbound for VLESS WebSocket TLS', () => {
  const config = buildXrayConfig({
    coreConfig: {
      type: 'vless', uuid: 'uuid', address: 'edge.example', port: 443,
      network: 'ws', security: 'tls', tls: true, sni: 'cdn.example',
      path: '/chat', host: 'cdn.example',
    },
  }, 17654);
  assert.equal(config.inbounds[0].listen, '127.0.0.1');
  assert.equal(config.inbounds[0].port, 17654);
  assert.equal(config.inbounds[0].protocol, 'socks');
  assert.equal(config.outbounds[0].protocol, 'vless');
  assert.equal(config.outbounds[0].streamSettings.wsSettings.path, '/chat');
  assert.equal(config.outbounds[0].streamSettings.tlsSettings.serverName, 'cdn.example');
});

test('builds Shadowsocks without irrelevant stream settings', () => {
  const config = buildXrayConfig({
    coreConfig: {
      type: 'shadowsocks', method: 'aes-128-gcm', password: 'secret',
      address: 'edge.example', port: 8388,
    },
  }, 17655);
  assert.equal(config.outbounds[0].protocol, 'shadowsocks');
  assert.equal(config.outbounds[0].settings.servers[0].method, 'aes-128-gcm');
  assert.equal(Object.hasOwn(config.outbounds[0], 'streamSettings'), false);
});

test('rejects nodes without a core configuration', () => {
  assert.throws(() => buildXrayConfig({ supported: false }, 1080), /核心配置/);
});

test('directs AnyTLS nodes to sing-box instead of Xray', () => {
  assert.throws(() => buildXrayConfig({
    coreConfig: { type: 'anytls', password: 'secret', address: 'edge.example', port: 443 },
  }, 1080), /sing-box/);
});
