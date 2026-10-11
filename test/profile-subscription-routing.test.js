'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { rankSubscriptionRoutes, supportedSubscriptionNodes } = require('../src/main/profile-subscription-routing');

function node(id, sourceId, extra = {}) {
  return { id, sourceId, protocol: 'http', status: 'unknown', ...extra };
}

test('subscription candidates stay inside the selected source and exclude unsupported records', () => {
  const nodes = [
    node('a', 'sub-a'),
    node('b', 'sub-b'),
    node('unsupported', 'sub-a', { supported: false }),
    node('info', 'sub-a', { subscriptionInfo: true }),
  ];

  assert.deepEqual(supportedSubscriptionNodes(nodes, 'sub-a').map((item) => item.id), ['a']);
  assert.deepEqual(supportedSubscriptionNodes(nodes, 'sub-a', ['a']), []);
});

test('duplicate IDs are considered once and retain the first selected-subscription record', () => {
  const first = node('shared', 'sub-a', { host: 'first.example' });
  const duplicate = node('shared', 'sub-a', { host: 'second.example' });
  assert.deepEqual(supportedSubscriptionNodes([first, duplicate], 'sub-a'), [first]);
  assert.deepEqual(supportedSubscriptionNodes([node('shared', 'sub-b'), first], 'sub-a'), [first]);
});

test('route ranking chooses the lowest successful latency and uses source order for ties', () => {
  const nodes = [node('first', 'sub-a'), node('second', 'sub-a'), node('third', 'sub-a')];
  const results = [
    { nodeId: 'first', ok: true, status: 'ok', latencyMs: 45 },
    { nodeId: 'second', ok: true, status: 'ok', latencyMs: 20 },
    { nodeId: 'third', ok: true, status: 'ok', latencyMs: 20 },
  ];

  assert.deepEqual(rankSubscriptionRoutes(nodes, 'sub-a', results).map((route) => route.node.id), ['second', 'third', 'first']);
});

test('failed and unmeasured routes are not selected as healthy fallbacks', () => {
  const nodes = [node('failed', 'sub-a'), node('unknown', 'sub-a'), node('healthy', 'sub-a')];
  const results = [
    { nodeId: 'failed', ok: false, status: 'error', latencyMs: null },
    { nodeId: 'unknown', status: 'unknown' },
    { nodeId: 'healthy', ok: true, status: 'ok', latencyMs: 80 },
  ];

  assert.deepEqual(rankSubscriptionRoutes(nodes, 'sub-a', results).map((route) => route.node.id), ['healthy']);
});

test('route selection uses reachability and latency rather than IP reputation metadata', () => {
  const nodes = [
    node('risk-flagged', 'sub-a', { ipReputation: { score: 0, status: 'high-risk' } }),
    node('healthy', 'sub-a'),
  ];
  const results = [
    { nodeId: 'risk-flagged', ok: true, status: 'ok', latencyMs: 15 },
    { nodeId: 'healthy', ok: true, status: 'ok', latencyMs: 35 },
  ];

  assert.equal(rankSubscriptionRoutes(nodes, 'sub-a', results)[0].node.id, 'risk-flagged');
});
