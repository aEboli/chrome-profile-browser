const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MAX_BOOKMARK_DEPTH,
  MAX_BOOKMARK_FILE_BYTES,
  MAX_SOURCE_NODES,
  createManualBookmarkSource,
  discoverBookmarkSources,
  mergeBookmarkSources,
  parseBookmarkHtml,
  parseChromiumBookmarks,
  publicBookmarkSource,
  readBookmarkSource,
} = require('../src/main/browser-bookmark-import');
const {
  addBookmarkRecord,
  normalizeBookmarks,
} = require('../src/main/bookmarks');

const rendererRoot = path.join(__dirname, '..', 'src', 'renderer');

function source(id, label = id) {
  return { id, kind: 'manual', browser: 'manual', profileName: label, label };
}

function deterministicIds() {
  let sequence = 0;
  return (prefix) => `${prefix}-test-${++sequence}`;
}

test('parses Chromium JSON roots, nested folders, Chinese titles, and unsupported URLs', () => {
  const result = parseChromiumBookmarks({
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: '书签栏',
        children: [
          {
            type: 'folder',
            name: '工作 / 中文',
            children: [
              { type: 'url', name: '文档', url: 'https://example.com/docs?q=1#中文' },
              { type: 'url', name: '脚本', url: 'javascript:alert(1)' },
            ],
          },
        ],
      },
      other: {
        type: 'folder',
        name: '其他书签',
        children: [{ type: 'url', name: '其他', url: 'https://example.com/other' }],
      },
    },
  });

  assert.equal(result.format, 'json');
  assert.equal(result.entries.length, 2);
  assert.equal(result.invalidCount, 1);
  assert.deepEqual(result.entries[0].path, ['工作 / 中文']);
  assert.equal(result.entries[0].title, '文档');
  assert.equal(result.entries[0].url, 'https://example.com/docs?q=1#%E4%B8%AD%E6%96%87');
  assert.deepEqual(result.entries[1].path, ['其他书签']);
});

test('imports the bookmark bar to the root and keeps other bookmarks as a root folder like Chrome', () => {
  const chrome = parseChromiumBookmarks({
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: '书签栏',
        children: [
          { type: 'url', name: '栏上链接', url: 'https://bar.example/' },
          { type: 'folder', name: '工作', children: [{ type: 'url', name: 'Chrome 工作', url: 'https://work.example/chrome' }] },
        ],
      },
      other: { type: 'folder', name: '', children: [{ type: 'url', name: '其他', url: 'https://other.example/' }] },
    },
  });
  const edge = parseChromiumBookmarks({
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: '收藏夹栏',
        children: [{ type: 'folder', name: '工作', children: [{ type: 'url', name: 'Edge 工作', url: 'https://work.example/edge' }] }],
      },
    },
  });
  const result = mergeBookmarkSources([], [
    { source: source('chrome'), ...chrome },
    { source: source('edge'), ...edge },
  ], { makeId: deterministicIds() });
  const folders = result.bookmarks.filter((item) => item.type === 'folder');
  const byTitle = (title) => result.bookmarks.find((item) => item.title === title);

  assert.deepEqual(folders.map((item) => [item.title, item.parentId]), [['工作', ''], ['其他书签', '']]);
  assert.equal(byTitle('栏上链接').parentId, '');
  assert.equal(byTitle('Chrome 工作').parentId, byTitle('工作').id);
  assert.equal(byTitle('Edge 工作').parentId, byTitle('工作').id);
  assert.equal(byTitle('其他').parentId, byTitle('其他书签').id);
});

test('HTML export places toolbar contents at the root and loose items in other bookmarks', () => {
  const result = parseBookmarkHtml(`<DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
    <DL><p>
      <DT><A HREF="https://bar.example/">栏</A>
      <DT><H3>子文件夹</H3>
      <DL><p><DT><A HREF="https://bar.example/child">子</A></DL><p>
    </DL><p>
    <DT><A HREF="https://loose.example/">散落</A>
  </DL>`);
  assert.deepEqual(result.entries.map((entry) => entry.path), [[], ['子文件夹'], ['其他书签']]);
});

test('parses exported HTML bookmarks with entities and nested folder paths', () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
    <DL><p>
      <DT><H3 ADD_DATE="1">中文 &amp; 收藏</H3>
      <DL><p>
        <DT><A HREF="https://example.com/a?x=1#part" ADD_DATE="2">标题 &amp; A</A>
        <DT><H3>嵌套</H3>
        <DL><p><DT><A HREF="ftp://example.com/file">不支持</A></DL><p>
      </DL><p>
    </DL>`;
  const result = parseBookmarkHtml(html);

  assert.equal(result.format, 'html');
  assert.equal(result.entries.length, 1);
  assert.equal(result.invalidCount, 1);
  assert.deepEqual(result.entries[0].path, ['中文 & 收藏']);
  assert.equal(result.entries[0].title, '标题 & A');
  assert.equal(result.entries[0].url, 'https://example.com/a?x=1#part');
});

test('discovers standard Chrome and Edge profile bookmark files without exposing paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-discovery-'));
  const local = path.join(root, 'LocalAppData');
  const chrome = path.join(local, 'Google', 'Chrome', 'User Data', 'Default');
  const edge = path.join(local, 'Microsoft', 'Edge', 'User Data', 'Profile 1');
  fs.mkdirSync(chrome, { recursive: true });
  fs.mkdirSync(edge, { recursive: true });
  fs.writeFileSync(path.join(chrome, 'Bookmarks'), '{}', 'utf8');
  fs.writeFileSync(path.join(edge, 'Bookmarks'), '{}', 'utf8');

  const sources = discoverBookmarkSources({ USERPROFILE: root, LOCALAPPDATA: local });
  assert.deepEqual(sources.map((item) => item.label), ['Chrome · Default', 'Edge · Profile 1']);
  assert.ok(sources.every((item) => item.filePath.endsWith('Bookmarks')));
  assert.equal(publicBookmarkSource(sources[0]).filePath, undefined);
});

test('discovers Chrome AccountBookmarks files used by newer Chrome profiles', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-account-discovery-'));
  const local = path.join(root, 'LocalAppData');
  const chrome = path.join(local, 'Google', 'Chrome', 'User Data', 'Default');
  fs.mkdirSync(chrome, { recursive: true });
  fs.writeFileSync(path.join(chrome, 'AccountBookmarks'), '{"roots":{}}', 'utf8');

  const sources = discoverBookmarkSources({ USERPROFILE: root, LOCALAPPDATA: local });
  assert.equal(sources.length, 1);
  assert.match(sources[0].filePath, /AccountBookmarks$/);
});

test('merges multiple sources by complete normalized URL and preserves existing bookmark data', () => {
  const existing = [{
    id: 'existing-bookmark',
    type: 'bookmark',
    title: '已有标题',
    url: 'https://example.com/existing',
    favicon: 'https://cdn.example.com/existing.ico',
    parentId: '',
  }];
  const first = {
    source: source('chrome:default', 'Chrome · Default'),
    entries: [
      { path: ['工作'], title: '新链接', url: 'https://example.com/new' },
      { path: ['工作'], title: '已有链接', url: 'https://example.com/existing' },
      { path: ['工作'], title: '带查询', url: 'https://example.com/new?x=1' },
    ],
    invalidCount: 2,
  };
  const second = {
    source: source('edge:profile-1', 'Edge · Profile 1'),
    entries: [
      { path: ['重复'], title: '另一个标题', url: 'https://example.com/new/' },
      { path: ['独有'], title: 'Edge 独有', url: 'https://edge.example/only' },
    ],
    invalidCount: 0,
  };

  const result = mergeBookmarkSources(existing, [first, second], {
    makeId: deterministicIds(),
    now: () => '2026-09-28T00:00:00.000Z',
  });
  const links = result.bookmarks.filter((item) => item.type === 'bookmark');

  assert.equal(result.addedLinks, 4);
  assert.equal(result.addedFolders, 3);
  assert.equal(result.duplicates, 1);
  assert.equal(result.invalid, 2);
  assert.equal(links.length, 5);
  const preserved = links.find((item) => item.id === 'existing-bookmark');
  assert.equal(preserved.title, existing[0].title);
  assert.equal(preserved.url, existing[0].url);
  assert.equal(preserved.favicon, existing[0].favicon);
  assert.equal(preserved.parentId, existing[0].parentId);
  assert.ok(!result.bookmarks.some((item) => item.type === 'folder' && item.title === 'Chrome · Default'));
  assert.equal(result.bookmarks.find((item) => item.type === 'folder' && item.title === '工作').parentId, '');
  assert.ok(links.some((item) => item.url === 'https://example.com/new?x=1'));
  assert.ok(links.some((item) => item.url === 'https://edge.example/only'));
});

test('repeating an import adds no links or empty source folder', () => {
  const parsed = {
    source: source('chrome:default', 'Chrome · Default'),
    entries: [{ path: ['工作'], title: '链接', url: 'https://example.com/a' }],
    invalidCount: 0,
  };
  const options = { makeId: deterministicIds(), now: () => '2026-09-28T00:00:00.000Z' };
  const first = mergeBookmarkSources([], [parsed], options);
  const second = mergeBookmarkSources(first.bookmarks, [parsed], options);

  assert.equal(first.addedLinks, 1);
  assert.equal(second.addedLinks, 0);
  assert.equal(second.addedFolders, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(second.bookmarks.length, first.bookmarks.length);
});

test('continues valid sources when another source is damaged', () => {
  const result = mergeBookmarkSources([], [
    { source: source('broken', '损坏来源'), entries: [], error: 'JSON 无法解析' },
    { source: source('valid', '有效来源'), entries: [{ path: [], title: '有效', url: 'https://valid.example/' }] },
  ], { makeId: deterministicIds() });

  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].label, '损坏来源');
  assert.equal(result.addedLinks, 1);
  assert.ok(result.bookmarks.some((item) => item.type === 'bookmark' && item.url === 'https://valid.example/'));
});

test('keeps more than 200 valid bookmarks through normalization and editing', () => {
  const entries = Array.from({ length: 300 }, (_item, index) => ({
    path: ['批量'],
    title: `链接 ${index + 1}`,
    url: `https://bulk.example/item-${index + 1}`,
  }));
  const result = mergeBookmarkSources([], [{ source: source('bulk', '批量来源'), entries }], { makeId: deterministicIds() });
  const normalized = normalizeBookmarks(result.bookmarks);
  assert.equal(result.addedLinks, 300);
  assert.equal(normalized.filter((item) => item.type === 'bookmark').length, 300);

  const edited = addBookmarkRecord(normalized, {
    title: '最后一个',
    url: 'https://bulk.example/extra',
  }, { makeId: deterministicIds() });
  assert.equal(edited.bookmarks.filter((item) => item.type === 'bookmark').length, 301);
});

test('rejects oversized files, excessive nodes, and excessive nesting explicitly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-limits-'));
  const oversized = path.join(root, 'Bookmarks');
  fs.writeFileSync(oversized, Buffer.alloc(MAX_BOOKMARK_FILE_BYTES + 1));
  assert.throws(() => readBookmarkSource({ filePath: oversized }), /超过 20 MB/);

  const nodes = Array.from({ length: MAX_SOURCE_NODES + 1 }, (_item, index) => ({
    type: 'url', name: String(index), url: `https://nodes.example/${index}`,
  }));
  assert.throws(() => parseChromiumBookmarks({ type: 'folder', children: nodes }), /超过 50000 个节点/);

  let nested = { type: 'url', url: 'https://deep.example/' };
  for (let index = 0; index <= MAX_BOOKMARK_DEPTH; index += 1) {
    nested = { type: 'folder', name: `层级 ${index}`, children: [nested] };
  }
  assert.throws(() => parseChromiumBookmarks(nested), /层级超过 100 层/);
});

test('rejects empty manual source paths before touching the current directory', () => {
  assert.throws(() => createManualBookmarkSource(''), /来源文件无效/);
  assert.throws(() => readBookmarkSource({ filePath: '   ' }), /来源文件无效/);
});

test('settings page exposes target, multi-source selection, file chooser, and import result feedback', () => {
  const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(rendererRoot, 'renderer.js'), 'utf8');
  const styles = fs.readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');
  assert.match(html, /id="bookmark-import-profile"/);
  assert.match(html, /id="bookmark-import-sources"/);
  assert.match(html, /id="bookmark-import-files"/);
  assert.match(html, /id="bookmark-import-submit"/);
  assert.match(html, /id="bookmark-import-result"/);
  assert.match(renderer, /getBookmarkImportSources/);
  assert.match(renderer, /chooseBookmarkImportFiles/);
  assert.match(renderer, /importBrowserBookmarks/);
  assert.match(renderer, /data-bookmark-import-source/);
  assert.match(styles, /.bookmark-import-sources/);
  assert.match(styles, /.bookmark-import-result/);
});
