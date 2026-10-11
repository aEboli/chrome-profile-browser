'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DEFAULT_SUBSCRIPTION_NAME,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  deriveNodeName,
  deriveSubscriptionHeaderName,
  deriveSubscriptionUrlName,
  ensureSubscriptionAccountTags,
  formatAccountTag,
  nextSubscriptionAccountTag,
  deriveSubscriptionName,
  normalizeSubscriptionName,
  resolveSubscriptionName,
  resolveSubscriptionNameDetails,
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

test('prefers provider title or account hints before URL hostname', () => {
  assert.equal(deriveSubscriptionHeaderName({ 'Profile-Title': '家庭线路' }), '家庭线路');
  assert.equal(deriveSubscriptionHeaderName({ 'content-disposition': "attachment; filename*=UTF-8''%E5%85%AC%E5%8F%B8.yaml" }), '公司');
  assert.equal(deriveSubscriptionUrlName('https://sub.example.com/subscribe/team-alpha?token=opaque'), 'team alpha');
  assert.equal(deriveSubscriptionUrlName('https://sub.example.com/sub?token=opaque&name=%E6%97%A5%E5%B8%B8%E7%BA%BF%E8%B7%AF'), '日常线路');
});

test('rejects opaque tokens before decoding separators into display text', () => {
  const tokens = [
    '0e4fd4b1-8a63-4af2-9abc-123456789def',
    'cT4xYq9_L7mR2nK5pQ8vWa',
  ];
  for (const token of tokens) {
    const urls = [
      `https://sub.example.com/sub/${token}`,
      `https://sub.example.com/sub/${token.replace(/[-_]/g, (value) => value === '-' ? '%2D' : '%5F')}`,
      `https://sub.example.com/sub?name=${encodeURIComponent(token)}`,
      `https://sub.example.com/sub#${encodeURIComponent(token)}`,
    ];
    for (const url of urls) {
      assert.equal(deriveSubscriptionUrlName(url), '', url);
      assert.deepEqual(resolveSubscriptionNameDetails({ url, nodes: [{ name: 'Tokyo 01' }] }), {
        name: 'Tokyo 01', source: 'node',
      });
      assert.deepEqual(resolveSubscriptionNameDetails({ url }), {
        name: 'sub.example.com', source: 'hostname',
      });
    }
    assert.equal(deriveSubscriptionHeaderName({ 'profile-title': token }), '');
    assert.equal(deriveSubscriptionHeaderName({ 'content-disposition': `attachment; filename="${token}.yaml"` }), '');
  }
});

test('uses a readable node label when the subscription has no provider name', () => {
  assert.equal(deriveNodeName([
    { name: 'vless://edge.example:443', protocol: 'vless', host: 'edge.example', port: 443 },
    { name: 'Tokyo 01', protocol: 'vless', host: 'edge.example', port: 443 },
  ]), 'Tokyo 01');
  assert.deepEqual(resolveSubscriptionNameDetails({
    url: 'https://sub.example.com/sub?token=opaque',
    nodes: [{ name: '首尔专线', host: 'edge.example' }],
  }), { name: '首尔专线', source: 'node' });
  assert.equal(deriveNodeName([
    { name: '[ss]剩余流量：4066 GB', host: 'edge.example' },
    { name: '[vless]Tokyo 01 - B Group', host: 'edge.example' },
  ]), 'Tokyo 01 B Group');
  assert.deepEqual(resolveSubscriptionNameDetails({
    url: 'https://sub.example.com/sub/team-alpha?token=opaque',
    nodes: [{ name: '首尔专线', host: 'edge.example' }],
  }), { name: 'team alpha', source: 'provider' });
});

test('excludes decorated information nodes from labels and host fallbacks', () => {
  for (const name of ['\u{1F4CA}剩余流量: 100 GB', '\u{1F4C5}到期时间: 2027-01-01']) {
    const info = { name, host: 'info.example.com', port: 443 };
    const url = 'https://sub.example.com/sub';
    const nodes = [info, { name: 'Tokyo 01', host: 'edge.example.com', port: 443 }];
    assert.equal(deriveNodeName(nodes), 'Tokyo 01');
    assert.deepEqual(resolveSubscriptionNameDetails({ url, nodes }), { name: 'Tokyo 01', source: 'node' });
    assert.equal(deriveNodeName([info]), '');
    assert.deepEqual(resolveSubscriptionNameDetails({ url, nodes: [info] }), {
      name: 'sub.example.com', source: 'hostname',
    });
  }
});

test('allocates stable circled account tags without reusing existing tags', () => {
  assert.equal(formatAccountTag(1), '①');
  assert.equal(formatAccountTag(21), '#21');
  const records = [{ accountTag: '②' }, {}, { accountTag: '②' }];
  ensureSubscriptionAccountTags(records);
  assert.deepEqual(records.map((item) => item.accountTag), ['②', '①', '③']);
  assert.equal(nextSubscriptionAccountTag(records), '④');
});

test('reserves existing account tags before filling missing or duplicate tags', () => {
  const records = [{}, { accountTag: '①' }, { accountTag: '①' }, { accountTag: '②' }];
  ensureSubscriptionAccountTags(records);
  assert.deepEqual(records.map((item) => item.accountTag), ['③', '①', '④', '②']);
  ensureSubscriptionAccountTags(records);
  assert.deepEqual(records.map((item) => item.accountTag), ['③', '①', '④', '②']);
  assert.equal(nextSubscriptionAccountTag(records), '⑤');
});
