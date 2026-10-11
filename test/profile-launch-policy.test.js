'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { shouldConfirmProfileLaunchIpChange } = require('../src/main/profile-launch-policy');

test('subscription launches skip the second confirmation when their exit IP changes', () => {
  assert.equal(shouldConfirmProfileLaunchIpChange(
    { connectionMode: 'subscription' },
    {},
    '198.51.100.10',
    '203.0.113.20',
  ), false);
});

test('direct and fixed-node launches retain exit-IP change confirmation', () => {
  for (const profile of [{ connectionMode: 'direct' }, { connectionMode: 'node' }]) {
    assert.equal(shouldConfirmProfileLaunchIpChange(
      profile,
      {},
      '198.51.100.10',
      '203.0.113.20',
    ), true);
  }
});

test('unchanged or unavailable IPs and automatic failover do not request confirmation', () => {
  assert.equal(shouldConfirmProfileLaunchIpChange({ connectionMode: 'node' }, {}, '198.51.100.10', '198.51.100.10'), false);
  assert.equal(shouldConfirmProfileLaunchIpChange({ connectionMode: 'node' }, {}, '', '203.0.113.20'), false);
  assert.equal(shouldConfirmProfileLaunchIpChange({ connectionMode: 'node' }, { automaticFailover: true }, '198.51.100.10', '203.0.113.20'), false);
});
