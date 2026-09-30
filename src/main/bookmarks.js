const { randomUUID } = require('node:crypto');

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function normalizeBookmarkUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) return '';
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeFavicon(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2 * 1024 * 1024) return '';
  const favicon = value.trim();
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(favicon)) return favicon;
  try {
    const url = new URL(favicon);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeImportMetadata(value, maxLength = 2048) {
  if (typeof value !== 'string' || !value.trim()) return '';
  return value.trim().slice(0, maxLength);
}

function nextId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function unusedId(prefix, records, makeId) {
  const ids = new Set(records.map((item) => item.id));
  let recordId = makeId(prefix);
  while (!ID_PATTERN.test(recordId) || ids.has(recordId)) recordId = makeId(prefix);
  return recordId;
}

function normalizeBookmarks(value, { makeId = nextId, now = () => new Date().toISOString() } = {}) {
  const records = Array.isArray(value) ? value : [];
  const result = [];
  const ids = new Set();
  const urls = new Set();

  for (const source of records) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const type = source.type === 'folder' ? 'folder' : 'bookmark';
    let recordId = typeof source.id === 'string' && ID_PATTERN.test(source.id)
      ? source.id
      : makeId(type);
    while (!ID_PATTERN.test(recordId) || ids.has(recordId)) recordId = makeId(type);
    ids.add(recordId);

    const title = (typeof source.title === 'string' ? source.title.trim() : '').slice(0, 160);
    const parentId = typeof source.parentId === 'string' && ID_PATTERN.test(source.parentId)
      ? source.parentId
      : '';
    const createdAt = typeof source.createdAt === 'string' && source.createdAt.trim()
      ? source.createdAt.trim().slice(0, 64)
      : now();
    const importSource = normalizeImportMetadata(source.importSource, 256);
    const importPath = normalizeImportMetadata(source.importPath, 2048);

    if (type === 'folder') {
      result.push({
        id: recordId,
        type,
        title: title || '新建文件夹',
        parentId,
        ...(importSource ? { importSource } : {}),
        ...(importPath ? { importPath } : {}),
        createdAt,
      });
      continue;
    }

    const url = normalizeBookmarkUrl(source.url);
    if (!url || urls.has(url)) continue;
    urls.add(url);
    result.push({
      id: recordId,
      type,
      title: title || new URL(url).hostname || url,
      url,
      favicon: normalizeFavicon(source.favicon),
      parentId,
      ...(importSource ? { importSource } : {}),
      ...(importPath ? { importPath } : {}),
      createdAt,
    });
  }

  const folders = new Map(result.filter((item) => item.type === 'folder').map((item) => [item.id, item]));
  for (const item of result) {
    if (!item.parentId) continue;
    let parent = folders.get(item.parentId);
    const visited = new Set([item.id]);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      parent = parent.parentId ? folders.get(parent.parentId) : null;
    }
    if (!folders.has(item.parentId) || visited.has(parent?.id)) item.parentId = '';
  }
  return result;
}

function requireParentFolder(records, parentId) {
  if (!parentId) return '';
  const folder = records.find((item) => item.id === parentId && item.type === 'folder');
  if (!folder) throw new Error('收藏文件夹不存在');
  return folder.id;
}

function addBookmarkRecord(records, input, options = {}) {
  const current = normalizeBookmarks(records, options);
  const url = normalizeBookmarkUrl(input?.url);
  if (!url) throw new Error('收藏地址必须是有效的 HTTP(S) URL');
  const title = (typeof input?.title === 'string' ? input.title.trim() : '').slice(0, 160) || new URL(url).hostname;
  const requestedParentId = typeof input?.parentId === 'string' ? input.parentId : '';
  const parentId = requireParentFolder(current, requestedParentId);
  const existingIndex = current.findIndex((item) => item.type === 'bookmark' && item.url === url);

  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    const favicon = input?.favicon === undefined ? existing.favicon : normalizeFavicon(input.favicon);
    const bookmark = { ...existing, title, favicon, parentId };
    current[existingIndex] = bookmark;
    return { bookmark, bookmarks: current };
  }
  const makeId = options.makeId || nextId;
  const bookmark = {
    id: unusedId('bookmark', current, makeId),
    type: 'bookmark',
    title,
    url,
    favicon: normalizeFavicon(input?.favicon),
    parentId,
    createdAt: (options.now || (() => new Date().toISOString()))(),
  };
  return { bookmark, bookmarks: [bookmark, ...current] };
}

function createBookmarkFolder(records, input, options = {}) {
  const current = normalizeBookmarks(records, options);
  const title = (typeof input?.title === 'string' ? input.title.trim() : '').slice(0, 160);
  if (!title) throw new Error('文件夹名称不能为空');
  const parentId = requireParentFolder(current, typeof input?.parentId === 'string' ? input.parentId : '');
  const folder = {
    id: unusedId('folder', current, options.makeId || nextId),
    type: 'folder',
    title,
    parentId,
    createdAt: (options.now || (() => new Date().toISOString()))(),
  };
  return { folder, bookmarks: [folder, ...current] };
}

function updateBookmarkRecord(records, input, options = {}) {
  const current = normalizeBookmarks(records, options);
  const index = current.findIndex((item) => item.id === input?.id);
  if (index < 0) throw new Error('收藏内容不存在');
  const existing = current[index];
  const title = (typeof input?.title === 'string' ? input.title.trim() : existing.title).slice(0, 160);
  if (!title) throw new Error(existing.type === 'folder' ? '文件夹名称不能为空' : '收藏名称不能为空');

  if (existing.type === 'folder') {
    current[index] = { ...existing, title };
    return { bookmark: current[index], bookmarks: current };
  }

  const url = input?.url === undefined ? existing.url : normalizeBookmarkUrl(input.url);
  if (!url) throw new Error('收藏地址必须是有效的 HTTP(S) URL');
  if (current.some((item) => item.type === 'bookmark' && item.id !== existing.id && item.url === url)) {
    throw new Error('该地址已在收藏栏中');
  }
  const changedOrigin = new URL(url).origin !== new URL(existing.url).origin;
  const favicon = input?.favicon === undefined
    ? (changedOrigin ? '' : existing.favicon)
    : normalizeFavicon(input.favicon);
  current[index] = { ...existing, title, url, favicon };
  return { bookmark: current[index], bookmarks: current };
}

function deleteBookmarkRecord(records, input, options = {}) {
  const current = normalizeBookmarks(records, options);
  const targetId = typeof input === 'string' ? input : input?.id;
  const targetUrl = typeof input?.url === 'string' ? normalizeBookmarkUrl(input.url) : '';
  const target = current.find((item) => item.id === targetId)
    || current.find((item) => item.type === 'bookmark' && item.url === targetUrl);
  if (!target) return current;

  const removedIds = new Set([target.id]);
  if (target.type === 'folder') {
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of current) {
        if (item.parentId && removedIds.has(item.parentId) && !removedIds.has(item.id)) {
          removedIds.add(item.id);
          changed = true;
        }
      }
    }
  }
  return current.filter((item) => !removedIds.has(item.id));
}

module.exports = {
  addBookmarkRecord,
  createBookmarkFolder,
  deleteBookmarkRecord,
  normalizeFavicon,
  normalizeBookmarkUrl,
  normalizeBookmarks,
  updateBookmarkRecord,
};
