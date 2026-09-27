const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addBookmarkRecord,
  createBookmarkFolder,
  deleteBookmarkRecord,
  normalizeFavicon,
  normalizeBookmarks,
  updateBookmarkRecord,
} = require('../src/main/bookmarks');

function deterministicOptions() {
  let next = 0;
  return {
    makeId: (prefix) => `${prefix}-${++next}`,
    now: () => '2026-09-26T00:00:00.000Z',
  };
}

test('normalizes legacy links to the root and drops invalid or duplicate URLs', () => {
  const bookmarks = normalizeBookmarks([
    { id: 'old-link', title: 'Example', url: 'https://example.com', favicon: 'javascript:alert(1)' },
    { id: 'bad-link', title: 'Bad', url: 'javascript:alert(1)' },
    { id: 'duplicate-link', title: 'Duplicate', url: 'https://example.com/' },
  ], deterministicOptions());

  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].type, 'bookmark');
  assert.equal(bookmarks[0].parentId, '');
  assert.equal(bookmarks[0].url, 'https://example.com/');
  assert.equal(bookmarks[0].favicon, '');
});

test('accepts only safe HTTP(S) and bounded image data icons', () => {
  assert.equal(normalizeFavicon('https://example.com/icon.png'), 'https://example.com/icon.png');
  assert.equal(normalizeFavicon('data:image/png;base64,aGVsbG8='), 'data:image/png;base64,aGVsbG8=');
  assert.equal(normalizeFavicon('javascript:alert(1)'), '');
  assert.equal(normalizeFavicon(`data:image/png;base64,${'a'.repeat(2 * 1024 * 1024)}`), '');
});

test('normalizes nested folders and roots entries with missing or cyclic parents', () => {
  const bookmarks = normalizeBookmarks([
    { id: 'folder-a', type: 'folder', title: 'A', parentId: 'folder-b' },
    { id: 'folder-b', type: 'folder', title: 'B', parentId: 'folder-a' },
    { id: 'nested-link', title: 'Nested', url: 'https://example.com', parentId: 'missing' },
  ], deterministicOptions());

  assert.equal(bookmarks.find((item) => item.id === 'folder-a').parentId, '');
  assert.equal(bookmarks.find((item) => item.id === 'folder-b').parentId, 'folder-a');
  assert.equal(bookmarks.find((item) => item.id === 'nested-link').parentId, '');
});

test('creates links in a folder and rejects invalid URLs and parent folders', () => {
  const options = deterministicOptions();
  const folder = createBookmarkFolder([], { title: 'Work' }, options);
  const added = addBookmarkRecord(folder.bookmarks, {
    title: 'Example',
    url: 'https://example.com',
    parentId: folder.folder.id,
    favicon: 'https://example.com/favicon.ico',
  }, options);

  assert.equal(added.bookmark.parentId, folder.folder.id);
  assert.equal(added.bookmark.favicon, 'https://example.com/favicon.ico');
  assert.throws(() => addBookmarkRecord([], { title: 'Bad', url: 'file:///bad' }, options), /HTTP\(S\)/);
  assert.throws(() => addBookmarkRecord([], { title: 'Bad', url: 'https://example.com', parentId: 'missing' }, options), /文件夹不存在/);
});

test('moves an existing bookmark when adding it to a different folder', () => {
  const options = deterministicOptions();
  const folder = createBookmarkFolder([], { title: 'Work' }, options);
  const added = addBookmarkRecord(folder.bookmarks, { title: 'Example', url: 'https://example.com' }, options);
  const moved = addBookmarkRecord(added.bookmarks, {
    title: 'Example',
    url: 'https://example.com/',
    parentId: folder.folder.id,
  }, options);

  assert.equal(moved.bookmarks.length, 2);
  assert.equal(moved.bookmark.id, added.bookmark.id);
  assert.equal(moved.bookmark.parentId, folder.folder.id);
});

test('edits a bookmark in place and rejects duplicate URLs', () => {
  const options = deterministicOptions();
  const first = addBookmarkRecord([], { title: 'First', url: 'https://first.example' }, options);
  const second = addBookmarkRecord(first.bookmarks, { title: 'Second', url: 'https://second.example' }, options);
  const updated = updateBookmarkRecord(second.bookmarks, {
    id: first.bookmark.id,
    title: 'Renamed',
    url: 'https://renamed.example/path',
  }, options);

  assert.equal(updated.bookmarks[0].id, second.bookmark.id);
  assert.equal(updated.bookmarks[1].title, 'Renamed');
  assert.equal(updated.bookmarks[1].favicon, '');
  assert.throws(() => updateBookmarkRecord(updated.bookmarks, {
    id: first.bookmark.id,
    title: 'Duplicate',
    url: 'https://second.example/',
  }, options), /已在收藏栏中/);
  assert.throws(() => updateBookmarkRecord(updated.bookmarks, {
    id: first.bookmark.id,
    title: 'Bad',
    url: 'javascript:alert(1)',
  }, options), /HTTP\(S\)/);
});

test('deletes a folder and its descendants while preserving other entries', () => {
  const options = deterministicOptions();
  const outer = createBookmarkFolder([], { title: 'Outer' }, options);
  const inner = createBookmarkFolder(outer.bookmarks, { title: 'Inner', parentId: outer.folder.id }, options);
  const withLink = addBookmarkRecord(inner.bookmarks, {
    title: 'Nested',
    url: 'https://nested.example',
    parentId: inner.folder.id,
  }, options);
  const withOther = addBookmarkRecord(withLink.bookmarks, { title: 'Other', url: 'https://other.example' }, options);
  const remaining = deleteBookmarkRecord(withOther.bookmarks, { id: outer.folder.id }, options);

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].url, 'https://other.example/');
});
