'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  removeSubscriptionData,
  subscriptionNodeIds,
} = require('../src/main/subscription-lifecycle');

test('deleting a subscription removes its source nodes and clears profile references', () => {
  const state = {
    subscriptions: [
      { id: 'sub-a', nodeIds: ['node-a'] },
      { id: 'sub-b', nodeIds: ['node-b'] },
    ],
    nodes: [
      { id: 'node-a', sourceId: 'sub-a' },
      { id: 'node-b', sourceId: 'sub-b' },
      { id: 'manual', sourceId: '' },
    ],
    profiles: [
      { id: 'profile-a', connectionMode: 'node', nodeId: 'node-a' },
      { id: 'profile-b', connectionMode: 'node', nodeId: 'node-b' },
    ],
  };

  assert.deepEqual([...subscriptionNodeIds(state, 'sub-a')], ['node-a']);
  const removed = removeSubscriptionData(state, 'sub-a');

  assert.deepEqual([...removed], ['node-a']);
  assert.deepEqual(state.nodes.map((node) => node.id), ['node-b', 'manual']);
  assert.deepEqual(state.profiles, [
    { id: 'profile-a', connectionMode: 'direct', nodeId: null },
    { id: 'profile-b', connectionMode: 'node', nodeId: 'node-b' },
  ]);
  assert.deepEqual(state.subscriptions, [{ id: 'sub-b', nodeIds: ['node-b'] }]);
});

test('deleting a selected subscription clears subscription mode even when no route is active', () => {
  const state = {
    subscriptions: [{ id: 'sub-a', nodeIds: ['node-a'] }],
    nodes: [{ id: 'node-a', sourceId: 'sub-a' }],
    profiles: [
      { id: 'active', connectionMode: 'subscription', subscriptionId: 'sub-a', nodeId: 'node-a' },
      { id: 'waiting', connectionMode: 'subscription', subscriptionId: 'sub-a', nodeId: null },
    ],
  };

  removeSubscriptionData(state, 'sub-a');

  assert.deepEqual(state.profiles, [
    { id: 'active', connectionMode: 'direct', subscriptionId: null, nodeId: null },
    { id: 'waiting', connectionMode: 'direct', subscriptionId: null, nodeId: null },
  ]);
});

test('deleting a subscription cleans legacy nodeIds without stealing another subscription node', () => {
  const state = {
    subscriptions: [
      { id: 'sub-old', nodeIds: ['orphan', 'shared'] },
      { id: 'sub-live', nodeIds: ['shared'] },
    ],
    nodes: [
      { id: 'orphan', sourceId: '' },
      { id: 'shared', sourceId: 'sub-live' },
    ],
    profiles: [],
  };

  assert.deepEqual([...subscriptionNodeIds(state, 'sub-old')], ['orphan']);
  removeSubscriptionData(state, 'sub-old');

  assert.deepEqual(state.nodes.map((node) => node.id), ['shared']);
  assert.deepEqual(state.subscriptions, [{ id: 'sub-live', nodeIds: ['shared'] }]);
});

test('deleting a subscription removes stale source nodes even when its record is missing nodeIds', () => {
  const state = {
    subscriptions: [{ id: 'sub-a' }],
    nodes: [{ id: 'node-a', sourceId: 'sub-a' }],
    profiles: [],
  };

  removeSubscriptionData(state, 'sub-a');
  assert.deepEqual(state.nodes, []);
  assert.deepEqual(state.subscriptions, []);
});

test('deleting one of two records with the same node ID preserves the other subscription and its references', () => {
  const state = {
    subscriptions: [
      { id: 'sub-a', nodeIds: ['shared', 'only-a'] },
      { id: 'sub-b', nodeIds: ['shared', 'only-a'] },
    ],
    nodes: [
      { id: 'shared', sourceId: 'sub-a', name: 'Edited Tokyo' },
      { id: 'shared', sourceId: 'sub-b', name: 'Tokyo' },
      { id: 'only-a', sourceId: 'sub-a' },
    ],
    profiles: [
      { id: 'shared-profile', connectionMode: 'node', nodeId: 'shared' },
      { id: 'removed-profile', connectionMode: 'node', nodeId: 'only-a' },
    ],
  };

  assert.deepEqual([...subscriptionNodeIds(state, 'sub-a')], ['shared', 'only-a']);
  assert.deepEqual([...removeSubscriptionData(state, 'sub-a')], ['only-a']);
  assert.deepEqual(state.nodes, [{ id: 'shared', sourceId: 'sub-b', name: 'Tokyo' }]);
  assert.deepEqual(state.subscriptions, [{ id: 'sub-b', nodeIds: ['shared'] }]);
  assert.deepEqual(state.profiles, [
    { id: 'shared-profile', connectionMode: 'node', nodeId: 'shared' },
    { id: 'removed-profile', connectionMode: 'direct', nodeId: null },
  ]);
});

test('legacy and manual records with colliding IDs are removed only when owned by the deleted subscription', () => {
  const state = {
    subscriptions: [
      { id: 'sub-old', nodeIds: ['legacy'] },
      { id: 'sub-live', nodeIds: ['legacy'] },
    ],
    nodes: [
      { id: 'legacy', sourceId: '' },
      { id: 'legacy', sourceId: 'sub-live' },
      { id: 'manual', sourceId: 'sub-old' },
      { id: 'manual', sourceId: '' },
    ],
    profiles: [{ id: 'profile', connectionMode: 'node', nodeId: 'legacy' }],
  };

  assert.deepEqual([...removeSubscriptionData(state, 'sub-old')], []);
  assert.deepEqual(state.nodes, [
    { id: 'legacy', sourceId: 'sub-live' },
    { id: 'manual', sourceId: '' },
  ]);
  assert.deepEqual(state.subscriptions, [{ id: 'sub-live', nodeIds: ['legacy'] }]);
  assert.deepEqual(state.profiles, [{ id: 'profile', connectionMode: 'node', nodeId: 'legacy' }]);
});
