const test = require('node:test');
const assert = require('node:assert/strict');

const { formatTokenCount } = require('../src/renderer/agent-context-usage');

test('formats context token counts as rounded integer k and m units', () => {
  assert.equal(formatTokenCount(102000), '102 k');
  assert.equal(formatTokenCount(257600), '258 k');
  assert.equal(formatTokenCount(648000), '648 k');
  assert.equal(formatTokenCount(1000000), '1 m');
  assert.equal(formatTokenCount(1590000), '2 m');
  assert.equal(formatTokenCount(999500), '1 m');
});

test('formats actual context usage with one decimal place', () => {
  assert.equal(formatTokenCount(102000, 1), '102.0 k');
  assert.equal(formatTokenCount(257600, 1), '257.6 k');
  assert.equal(formatTokenCount(648000, 1), '648.0 k');
  assert.equal(formatTokenCount(999500, 1), '999.5 k');
  assert.equal(formatTokenCount(1590000, 1), '1.6 m');
});

test('keeps small context counts as integers and clamps invalid or negative values', () => {
  assert.equal(formatTokenCount(0), '0');
  assert.equal(formatTokenCount(999), '999');
  assert.equal(formatTokenCount(-20), '0');
  assert.equal(formatTokenCount(Number.NaN), '0');
});
