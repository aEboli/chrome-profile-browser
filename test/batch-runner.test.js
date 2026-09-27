'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runBoundedBatch } = require('../src/main/batch-runner');

test('runs batch work with bounded concurrency and input order', async () => {
  let active = 0;
  let maximum = 0;
  const result = await runBoundedBatch(['a', 'b', 'c', 'd', 'e'], async (value, index) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2 + (index % 2)));
    active -= 1;
    return value.toUpperCase();
  }, 2);

  assert.deepEqual(result, ['A', 'B', 'C', 'D', 'E']);
  assert.equal(maximum, 2);
});

test('returns an empty result for an empty batch', async () => {
  assert.deepEqual(await runBoundedBatch([], async () => 'unused', 4), []);
});
