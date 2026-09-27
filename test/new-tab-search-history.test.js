'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  MAX_SEARCH_HISTORY_ENTRIES,
  MAX_SEARCH_QUERY_LENGTH,
  isSearchQuery,
  normalizeSearchHistory,
  recordSearchQuery,
} = require('../src/main/new-tab-search-history');

test('normalizes recent search history by trimming, filtering, deduplicating, and limiting entries', () => {
  const history = normalizeSearchHistory([
    '  店小秘  ',
    'temu卖家中心',
    '店小秘',
    'https://example.com',
    'example.org',
    '',
    null,
    ...Array.from({ length: 12 }, (_, index) => `query ${index}`),
  ]);

  assert.deepEqual(history, ['店小秘', 'temu卖家中心', 'query 0', 'query 1', 'query 2', 'query 3', 'query 4', 'query 5', 'query 6', 'query 7']);
  assert.equal(history.length, MAX_SEARCH_HISTORY_ENTRIES);
});

test('records the latest query first and updates case-insensitive duplicates', () => {
  const next = recordSearchQuery(['first query', 'Second query'], ' FIRST QUERY ');

  assert.deepEqual(next, ['FIRST QUERY', 'Second query']);
});

test('does not retain empty, direct-navigation, or overlong inputs', () => {
  assert.equal(isSearchQuery('   '), false);
  assert.equal(isSearchQuery('https://example.com'), false);
  assert.equal(isSearchQuery('shop.example.com/path'), false);
  assert.equal(isSearchQuery('localhost:3000'), false);
  assert.equal(isSearchQuery('x'.repeat(MAX_SEARCH_QUERY_LENGTH + 1)), false);
  assert.equal(isSearchQuery('店小秘'), true);
  assert.equal(isSearchQuery('query words'), true);
});

test('profile search history is stored privately and cleared with browsing data', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'main', 'browser-shell-preload.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.js'), 'utf8');

  assert.match(main, /searchHistory: normalizeSearchHistory\(existingProfile\?\.searchHistory\)/);
  assert.match(main, /searchHistory: _searchHistory/);
  assert.match(main, /profile\.searchHistory = \[\]/);
  assert.match(main, /browser-shell:get-search-history/);
  assert.match(main, /browser-shell:record-search-query/);
  assert.match(preload, /getSearchHistory:.*browser-shell:get-search-history/);
  assert.match(preload, /recordSearchQuery:.*browser-shell:record-search-query/);
  assert.match(shell, /new-tab-search-suggestion/);
  assert.match(shell, /recordSearchQuery/);
  assert.match(shell, /sites\.hidden = Boolean\(searchInput\.value\.trim\(\)\)/);
});
