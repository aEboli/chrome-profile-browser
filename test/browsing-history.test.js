'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  deleteBrowsingHistoryEntry,
  MAX_BROWSING_HISTORY_ENTRIES,
  normalizeBrowsingHistory,
  recordBrowsingHistory,
} = require('../src/main/browsing-history');

test('records committed HTTP(S) visits without URL credentials and updates the latest title', () => {
  const first = recordBrowsingHistory([], { url: 'https://user:pass@example.com/a', title: 'Example' }, '2026-10-06T00:00:00.000Z');
  const next = recordBrowsingHistory(first, { url: 'https://example.com/a', title: 'Updated' }, '2026-10-06T00:01:00.000Z');
  assert.deepEqual(next, [{ url: 'https://example.com/a', title: 'Updated', visitedAt: '2026-10-06T00:01:00.000Z' }]);
  assert.deepEqual(recordBrowsingHistory(next, { url: 'about:blank', title: 'New tab' }), next);
});

test('normalizes historical records, removes duplicate addresses, and enforces the limit', () => {
  const values = Array.from({ length: MAX_BROWSING_HISTORY_ENTRIES + 2 }, (_, index) => ({
    url: `https://site-${index}.example/`, title: `Page ${index}`, visitedAt: '2026-10-06T00:00:00.000Z',
  }));
  const normalized = normalizeBrowsingHistory([...values, { ...values[0], title: 'Old duplicate' }, { url: 'file:///secret', visitedAt: 'now' }]);
  assert.equal(normalized.length, MAX_BROWSING_HISTORY_ENTRIES);
  assert.equal(normalized[0].title, 'Page 0');
  assert.equal(normalized.some((record) => record.title === 'Old duplicate'), false);
  assert.equal(normalized.some((record) => record.url.startsWith('file:')), false);
});

test('deletes a single URL without changing other profile data', () => {
  const history = [
    { url: 'https://example.com/a', title: 'A', visitedAt: 'now' },
    { url: 'https://example.com/b', title: 'B', visitedAt: 'now' },
  ];
  assert.deepEqual(deleteBrowsingHistoryEntry(history, 'https://example.com/a'), [history[1]]);
});
