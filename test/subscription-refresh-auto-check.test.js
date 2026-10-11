'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');

function createRenderer({ subscriptions = [{ id: 'a', name: '订阅甲' }, { id: 'b', name: '订阅乙' }], nodes = [], refresh, check } = {}) {
  const state = { subscriptions, nodes };
  const calls = [];
  const toasts = [];
  const context = {
    recordToast: (message, kind) => toasts.push({ message, kind }),
    window: {
      api: {
        getState: async () => state,
        refreshSubscription: async (id) => {
          calls.push({ method: 'refresh', id });
          if (refresh) await refresh(id, state);
          return { ok: true, state };
        },
        checkNodes: async (ids) => {
          const requested = Array.from(ids);
          calls.push({ method: 'check', ids: requested });
          if (check) return check(requested, state);
          state.nodes = state.nodes.map((node) => requested.includes(node.id) ? { ...node, status: 'ok' } : node);
          return { ok: true, results: requested.map((nodeId) => ({ nodeId, ok: true })), state };
        },
      },
    },
  };
  const source = rendererSource.replace('if (typeof document !== "undefined") void init();', `
    renderAll = () => {};
    applyTheme = () => {};
    setSyncState = () => {};
    showToast = recordToast;
    globalThis.renderer = { appState, mergeState, refreshSubscription, refreshAllSubscriptions, checkVisibleNodes };
  `);
  vm.runInNewContext(source, context, { filename: 'renderer.js' });
  context.renderer.mergeState(state);
  return { ...context.renderer, calls, toasts, state };
}

const node = (id, sourceId, extra = {}) => ({ id, sourceId, name: id, protocol: 'socks5', host: '127.0.0.1', port: 1080, status: 'unknown', ...extra });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('all subscription updates finish before one automatic check of fresh nodes regardless of filters', async () => {
  const renderer = createRenderer({
    nodes: [node('old-a', 'a'), node('old-b', 'b'), node('manual', '')],
    refresh: async (id, state) => {
      state.nodes = state.nodes.filter((item) => item.sourceId !== id);
      state.nodes.push(node(`new-${id}`, id), node(`unsupported-${id}`, id, { supported: false, status: 'unsupported' }), node(`info-${id}`, id, { subscriptionInfo: true }));
      if (id === 'b') state.nodes.push(node('failed-b', id, { status: 'error' }));
    },
  });
  renderer.appState.nodeGroup = 'manual';
  renderer.appState.nodeFilter = '没有匹配的节点';

  await renderer.refreshAllSubscriptions();

  assert.deepEqual(renderer.calls, [
    { method: 'refresh', id: 'a' },
    { method: 'refresh', id: 'b' },
    { method: 'check', ids: ['new-a', 'new-b', 'failed-b'] },
  ]);
  assert.equal(renderer.appState.nodes.find((item) => item.id === 'manual').status, 'unknown');
  assert.equal(renderer.appState.nodes.find((item) => item.id === 'new-a').status, 'ok');
  assert.equal(renderer.appState.batchChecking, false);
  assert.ok(renderer.toasts.some((item) => item.message.includes('批量检查完成')));
});

test('a single update checks only that subscription even when a different subscription is selected', async () => {
  const renderer = createRenderer({ nodes: [node('a-1', 'a'), node('b-1', 'b'), node('manual', '')] });
  renderer.appState.nodeGroup = 'subscription:b';
  renderer.appState.nodeFilter = 'b-1';

  await renderer.refreshSubscription('a');

  assert.deepEqual(renderer.calls, [{ method: 'refresh', id: 'a' }, { method: 'check', ids: ['a-1'] }]);
});

test('a failed update does not stop later updates or include retained failed-subscription nodes in the check', async () => {
  const renderer = createRenderer({
    nodes: [node('old-a', 'a'), node('old-b', 'b')],
    refresh: async (id, state) => {
      if (id === 'a') throw new Error('订阅甲更新失败');
      state.nodes = state.nodes.filter((item) => item.sourceId !== id).concat(node('new-b', id));
    },
  });

  await renderer.refreshAllSubscriptions();

  assert.deepEqual(renderer.calls, [{ method: 'refresh', id: 'a' }, { method: 'refresh', id: 'b' }, { method: 'check', ids: ['new-b'] }]);
  assert.ok(renderer.toasts.some((item) => item.kind === 'error' && item.message === '订阅甲更新失败'));
});

test('failed updates and subscriptions with no supported nodes do not start an empty batch', async () => {
  for (const refresh of [async () => { throw new Error('更新失败'); }, async () => {}]) {
    const renderer = createRenderer({ nodes: [node('unsupported', 'a', { supported: false }), node('info', 'b', { subscriptionInfo: true })], refresh });
    await renderer.refreshAllSubscriptions();
    assert.equal(renderer.calls.filter((item) => item.method === 'check').length, 0);
    assert.equal(renderer.appState.batchChecking, false);
  }
  const empty = createRenderer({ subscriptions: [] });
  await empty.refreshAllSubscriptions();
  assert.deepEqual(empty.calls, []);
});

test('repeated update and manual check actions are ignored throughout updating and automatic checking', async () => {
  let finishRefresh;
  let finishCheck;
  const renderer = createRenderer({
    subscriptions: [{ id: 'a' }],
    nodes: [node('a-1', 'a')],
    refresh: () => new Promise((resolve) => { finishRefresh = resolve; }),
    check: () => new Promise((resolve) => { finishCheck = resolve; }),
  });
  const run = renderer.refreshAllSubscriptions();
  await flush();

  await Promise.all([renderer.refreshAllSubscriptions(), renderer.refreshSubscription('a'), renderer.checkVisibleNodes()]);
  assert.deepEqual(renderer.calls, [{ method: 'refresh', id: 'a' }]);

  finishRefresh();
  await flush();
  assert.equal(renderer.appState.batchChecking, true);
  assert.equal(renderer.appState.nodes[0].status, 'checking');
  await Promise.all([renderer.refreshAllSubscriptions(), renderer.refreshSubscription('a'), renderer.checkVisibleNodes()]);
  assert.deepEqual(renderer.calls, [{ method: 'refresh', id: 'a' }, { method: 'check', ids: ['a-1'] }]);

  finishCheck({ ok: true, results: [{ nodeId: 'a-1', ok: true }] });
  await run;
  assert.equal(renderer.appState.batchChecking, false);
});

test('automatic check failure restores operation state and allows the next update', async () => {
  let attempts = 0;
  const renderer = createRenderer({
    subscriptions: [{ id: 'a' }],
    nodes: [node('a-1', 'a')],
    check: async (_ids, state) => {
      state.nodes[0].status = 'unknown';
      attempts += 1;
      return attempts === 1 ? { ok: false, error: '检查请求失败' } : { ok: true, results: [{ ok: true }], state };
    },
  });

  await renderer.refreshAllSubscriptions();
  assert.equal(renderer.appState.batchChecking, false);
  assert.ok(renderer.toasts.some((item) => item.message === '检查请求失败' && item.kind === 'error'));
  await renderer.refreshAllSubscriptions();
  assert.equal(attempts, 2);
});

test('manual batch checks continue to follow the selected group and search', async () => {
  const renderer = createRenderer({ nodes: [node('a-1', 'a'), node('b-1', 'b'), node('manual-1', ''), node('manual-2', '')] });
  renderer.appState.nodeGroup = 'manual';
  renderer.appState.nodeFilter = 'manual-1';

  await renderer.checkVisibleNodes();

  assert.deepEqual(renderer.calls, [{ method: 'check', ids: ['manual-1'] }]);
});
