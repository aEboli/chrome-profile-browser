const assert = require('node:assert/strict');
const test = require('node:test');

const { RETRY_DELAYS_MS, retryOperation } = require('../src/renderer/agent-retry');

test('retries transient failures with increasing bounded delays', async () => {
  const delays = [];
  let attempts = 0;
  const result = await retryOperation(async () => {
    attempts += 1;
    if (attempts < 4) throw new Error('Agent 请求超时');
    return 'done';
  }, {
    shouldRetry: () => true,
    wait: async (delay) => { delays.push(delay); return true; },
  });

  assert.equal(result, 'done');
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.deepEqual(RETRY_DELAYS_MS, [1000, 2000, 4000, 8000, 16000]);
});

test('stops after five retries and does not retry non-retryable errors', async () => {
  const delays = [];
  let attempts = 0;
  await assert.rejects(retryOperation(async () => {
    attempts += 1;
    throw new Error('Agent 请求超时');
  }, {
    shouldRetry: () => true,
    wait: async (delay) => { delays.push(delay); return true; },
  }), /Agent 请求超时/);
  assert.equal(attempts, 6);
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000]);

  attempts = 0;
  await assert.rejects(retryOperation(async () => {
    attempts += 1;
    throw new Error('坐标无效');
  }, { shouldRetry: () => false }), /坐标无效/);
  assert.equal(attempts, 1);
});

test('cancels a retry wait when its signal is aborted', async () => {
  const controller = new AbortController();
  const waiting = retryOperation(async () => { throw new Error('超时'); }, {
    signal: controller.signal,
    shouldRetry: () => true,
    wait: async (_delay, signal) => {
      controller.abort();
      return !signal.aborted;
    },
  });
  await assert.rejects(waiting, { name: 'AbortError' });
});
