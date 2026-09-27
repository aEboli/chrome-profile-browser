'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  extractSubscriptionMetadata,
  isSubscriptionInfoNode,
  parseSubscriptionUserinfo,
} = require('../src/main/subscription-meta');

test('parses subscription-userinfo traffic, expiry, and reset headers', () => {
  const now = Date.parse('2026-09-22T00:00:00.000Z');
  const metadata = parseSubscriptionUserinfo(
    'upload=1073741824; download=2147483648; total=10737418240; expire=1794009600; reset=86400',
    now,
  );
  assert.equal(metadata.uploadBytes, 1073741824);
  assert.equal(metadata.downloadBytes, 2147483648);
  assert.equal(metadata.totalBytes, 10737418240);
  assert.equal(metadata.expiresAt, '2026-11-07T00:00:00.000Z');
  assert.equal(metadata.resetAfterSeconds, 86400);
  assert.equal(metadata.resetAt, '2026-09-23T00:00:00.000Z');
});

test('keeps comma-formatted byte values and date-form reset headers intact', () => {
  const metadata = parseSubscriptionUserinfo('upload=1,234;total=10,000;reset=2026-10-01', Date.parse('2026-09-22T00:00:00.000Z'));
  assert.equal(metadata.uploadBytes, 1234);
  assert.equal(metadata.totalBytes, 10000);
  assert.equal(metadata.resetAt, '2026-10-01T00:00:00.000Z');
  assert.equal(parseSubscriptionUserinfo('total=10GB').totalBytes, 10 * 1024 ** 3);
});

test('recognizes provider info nodes and excludes them from selectable nodes', () => {
  const now = Date.parse('2026-09-22T00:00:00.000Z');
  const nodes = [
    { id: 'traffic', name: '[ss]剩余流量：4066.42 GB', host: '1.1.1.1', port: 443 },
    { id: 'reset', name: '[ss]距离下次重置剩余：9天', host: '1.1.1.1', port: 443 },
    { id: 'expire', name: '[ss]套餐到期：2027-03-08', host: '1.1.1.1', port: 443 },
    { id: 'notice', name: '[ss]不再支持Clash For Windows', host: '1.1.1.1', port: 443 },
    { id: 'notice-2', name: '[ss]如更新未有可用节点，请更换客户端', host: '1.1.1.1', port: 443 },
    { id: 'real', name: 'Tokyo 01', host: 'edge.example', port: 443 },
  ];
  const result = extractSubscriptionMetadata({ nodes, now });
  assert.equal(result.infoNodes.length, 5);
  assert.equal(result.metadata.remainingBytes, Math.round(4066.42 * 1024 ** 3));
  assert.equal(result.metadata.resetAfterSeconds, 9 * 24 * 60 * 60);
  assert.equal(result.metadata.expiresAt, '2027-03-08T00:00:00.000Z');
  assert.equal(result.metadata.messages[0], '不再支持Clash For Windows');
  assert.equal(isSubscriptionInfoNode(nodes[0]), true);
  assert.equal(isSubscriptionInfoNode(nodes[5]), false);
});

test('header values take precedence while info nodes fill missing fields', () => {
  const result = extractSubscriptionMetadata({
    now: Date.parse('2026-09-22T00:00:00.000Z'),
    headers: { 'subscription-userinfo': 'download=100;total=1000;expire=1794009600' },
    nodes: [{ name: '[ss]剩余流量：9 GB' }, { name: '[ss]距离下次重置剩余：2天' }],
  });
  assert.equal(result.metadata.downloadBytes, 100);
  assert.equal(result.metadata.totalBytes, 1000);
  assert.equal(result.metadata.remainingBytes, 900);
  assert.equal(result.metadata.resetAfterSeconds, 2 * 24 * 60 * 60);
});

test('recognizes an absolute reset date and English duration labels', () => {
  const absolute = extractSubscriptionMetadata({
    nodes: [{ name: '[ss]下次重置时间：2026-10-01 08:00' }],
  });
  assert.equal(absolute.metadata.resetAt, '2026-10-01T00:00:00.000Z');
  const relative = extractSubscriptionMetadata({
    now: Date.parse('2026-09-22T00:00:00.000Z'),
    nodes: [{ name: 'Reset in 3 days' }],
  });
  assert.equal(relative.metadata.resetAfterSeconds, 3 * 24 * 60 * 60);
  const chinese = extractSubscriptionMetadata({ nodes: [{ name: '[ss]套餐到期：2027年03月08日' }] });
  assert.equal(chinese.metadata.expiresAt, '2027-03-08T00:00:00.000Z');
});

test('recognizes AnyTLS-labelled provider information lines', () => {
  const now = Date.parse('2026-09-22T00:00:00.000Z');
  const result = extractSubscriptionMetadata({
    now,
    nodes: [
      { name: '[AnyTLS]剩余流量：74.43 GB' },
      { name: 'AnyTLS-距离下次重置剩余：10 天' },
      { name: 'AnyTLS:套餐到期：2026-10-02' },
      { name: 'AnyTLS|官网:bbqwq.com' },
    ],
  });
  assert.equal(result.infoNodes.length, 4);
  assert.equal(result.metadata.remainingBytes, Math.round(74.43 * 1024 ** 3));
  assert.equal(result.metadata.resetAfterSeconds, 10 * 24 * 60 * 60);
  assert.equal(result.metadata.expiresAt, '2026-10-02T00:00:00.000Z');
  assert.deepEqual(result.metadata.messages, ['官网:bbqwq.com']);
});

test('does not overwrite a node remaining value when the header only supplies total quota', () => {
  const result = extractSubscriptionMetadata({
    headers: { 'subscription-userinfo': 'total=1000' },
    nodes: [{ name: '[ss]剩余流量：500 B' }],
  });
  assert.equal(result.metadata.totalBytes, 1000);
  assert.equal(result.metadata.remainingBytes, 500);
});

test('uses header usage over node remaining and clears stale relative reset data', () => {
  const result = extractSubscriptionMetadata({
    headers: { 'subscription-userinfo': 'total=1000;download=100;reset=1793404800' },
    nodes: [
      { name: '[ss]剩余流量：500 B' },
      { name: '[ss]距离下次重置剩余：2天' },
    ],
  });
  assert.equal(result.metadata.remainingBytes, 900);
  assert.equal(result.metadata.resetAfterSeconds, null);
  assert.equal(result.metadata.resetAt, '2026-10-31T00:00:00.000Z');
});

test('keeps node remaining data when a header omits total quota', () => {
  const result = extractSubscriptionMetadata({
    headers: { 'subscription-userinfo': 'download=100' },
    nodes: [{ name: '[ss]剩余流量：500 B' }],
  });
  assert.equal(result.metadata.remainingBytes, 500);
});
