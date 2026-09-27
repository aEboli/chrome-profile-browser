'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DEFAULT_SUBSCRIPTION_NAME,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  deriveSubscriptionName,
  normalizeSubscriptionName,
  resolveSubscriptionName,
} = require('../src/main/subscription-name');

test('derives a safe display name from an HTTP(S) subscription hostname', () => {
  assert.equal(deriveSubscriptionName(' https://User:secret@WWW.Example.com:8443/sub/token?key=value '), 'www.example.com');
  assert.equal(deriveSubscriptionName(`https://long.example/${'path/'.repeat(40)}`), 'long.example');
  assert.equal(deriveSubscriptionName('https://[2001:db8::1]/subscription'), '2001:db8::1');
  assert.equal(deriveSubscriptionName('ftp://example.com/list'), '');
  assert.equal(deriveSubscriptionName('not a url'), '');
});

test('normalizes custom names and applies domain/default fallbacks', () => {
  assert.equal(normalizeSubscriptionName('  我的订阅\u0000  '), '我的订阅');
  assert.equal(normalizeSubscriptionName({ name: '无效输入' }), '');
  assert.equal(normalizeSubscriptionName('x'.repeat(MAX_SUBSCRIPTION_NAME_LENGTH + 10)).length, MAX_SUBSCRIPTION_NAME_LENGTH);
  assert.equal(resolveSubscriptionName({ name: '  家庭线路  ', url: 'https://example.com/sub' }), '家庭线路');
  assert.equal(resolveSubscriptionName({ url: 'https://example.com/sub' }), 'example.com');
  assert.equal(resolveSubscriptionName({ existingName: DEFAULT_SUBSCRIPTION_NAME, url: 'https://example.com/sub' }), 'example.com');
  assert.equal(resolveSubscriptionName({ existingName: '旧名称', url: 'https://example.com/sub' }), '旧名称');
  assert.equal(resolveSubscriptionName({}), DEFAULT_SUBSCRIPTION_NAME);
});
