const assert = require('node:assert/strict');
const test = require('node:test');

const { appendActionHistory, confidenceLabel, normalizeJevCompletion } = require('../src/renderer/agent-completion');

test('keeps recent action summaries for JEV and counts older entries', () => {
  let history = { actions: [], omittedCount: 0 };
  for (let batch = 0; batch < 3; batch += 1) {
    history = appendActionHistory(history, Array.from({ length: 10 }, (_, index) => `${batch}:${index}`));
  }

  assert.equal(history.actions.length, 24);
  assert.equal(history.omittedCount, 6);
  assert.equal(history.actions[0], '0:6');
  assert.equal(history.actions.at(-1), '2:9');
});

test('normalizes JEV completion, confidence and reason', () => {
  assert.deepEqual(normalizeJevCompletion({ answers: { completed: true, confidence: 0.875, reason: '结果已保存。' } }), {
    completed: true,
    confidence: 87.5,
    reason: '结果已保存。',
  });
  assert.deepEqual(normalizeJevCompletion({ answers: { completed: '未完成', confidence: '72%', explanation: '还缺少一个字段。' } }), {
    completed: false,
    confidence: 72,
    reason: '还缺少一个字段。',
  });
  assert.equal(confidenceLabel({ confidence: null }), '未返回');
});

test('does not invent a completion result or confidence', () => {
  assert.throws(() => normalizeJevCompletion({ answers: { confidence: 0.9 } }), /completed/);
  assert.deepEqual(normalizeJevCompletion({ answers: { done: 1, confidence: null } }), {
    completed: true,
    confidence: null,
    reason: '',
  });
});
