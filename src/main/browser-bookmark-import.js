const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  normalizeBookmarkUrl,
  normalizeBookmarks,
  normalizeFavicon,
} = require('./bookmarks');

const MAX_BOOKMARK_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_NODES = 50_000;
const MAX_BOOKMARK_DEPTH = 100;
const MAX_TARGET_BOOKMARK_RECORDS = 100_000;
const SOURCE_KEY_PATTERN = /^[A-Za-z0-9:_./-]{1,256}$/;

function sourceHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 20);
}

function sourceIdForPath(filePath, kind = 'file') {
  const normalized = path.resolve(String(filePath || '')).toLowerCase();
  return `${kind}:${sourceHash(normalized)}`;
}

function safeSourceKey(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return SOURCE_KEY_PATTERN.test(candidate) ? candidate : '';
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  };
  return String(value || '').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : match;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : match;
    }
    return match;
  });
}

function visibleHtmlText(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function htmlAttribute(tag, name) {
  const expression = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = expression.exec(String(tag || ''));
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function assertSourceNodeBudget(state, depth) {
  if (depth > MAX_BOOKMARK_DEPTH) throw new Error(`书签层级超过 ${MAX_BOOKMARK_DEPTH} 层限制`);
  state.nodeCount += 1;
  if (state.nodeCount > MAX_SOURCE_NODES) throw new Error(`单个来源超过 ${MAX_SOURCE_NODES} 个节点限制`);
}

// 与 Chrome 一致：书签栏文件夹的内容直接进入收藏栏根目录；
// 导出文件存在书签栏时，书签栏之外的顶层链接归入“其他书签”。
const TOOLBAR_FOLDER_PATTERN = /PERSONAL_TOOLBAR_FOLDER\s*=\s*["']?true/i;
const OTHER_BOOKMARKS_TITLE = '其他书签';
const CHROMIUM_ROOT_TITLES = { other: OTHER_BOOKMARKS_TITLE, synced: '移动设备书签', mobile: '移动设备书签' };

function htmlEntryPath(stack, hasToolbarFolder) {
  const toolbarIndex = stack.findIndex((folder) => folder.toolbar);
  if (toolbarIndex >= 0) return stack.slice(toolbarIndex + 1).map((folder) => folder.title).filter(Boolean);
  const titles = stack.map((folder) => folder.title).filter(Boolean);
  if (!hasToolbarFolder || stack.some((folder) => folder.unfiled) || titles[0] === OTHER_BOOKMARKS_TITLE) return titles;
  return [OTHER_BOOKMARKS_TITLE, ...titles];
}

function parseBookmarkHtml(text) {
  const entries = [];
  const state = { nodeCount: 0, invalidCount: 0 };
  const stack = [];
  const hasToolbarFolder = TOOLBAR_FOLDER_PATTERN.test(String(text || ''));
  let pendingFolder = null;
  const tokenPattern = /<\/DL\s*>|<DL\b[^>]*>|<H3\b[^>]*>[\s\S]*?<\/H3\s*>|<A\b[^>]*>[\s\S]*?<\/A\s*>/gi;

  for (const match of String(text || '').matchAll(tokenPattern)) {
    const token = match[0];
    if (/^<\/DL/i.test(token)) {
      stack.pop();
      continue;
    }
    if (/^<DL/i.test(token)) {
      stack.push(pendingFolder || { title: '' });
      pendingFolder = null;
      continue;
    }
    if (/^<H3/i.test(token)) {
      const tag = /^<H3\b[^>]*>/i.exec(token)?.[0] || '';
      pendingFolder = {
        title: visibleHtmlText(token.replace(/^<H3\b[^>]*>/i, '').replace(/<\/H3\s*>$/i, '')),
        toolbar: /^true$/i.test(htmlAttribute(tag, 'PERSONAL_TOOLBAR_FOLDER')),
        unfiled: /^true$/i.test(htmlAttribute(tag, 'UNFILED_BOOKMARKS_FOLDER')),
      };
      continue;
    }

    assertSourceNodeBudget(state, stack.length);
    const href = htmlAttribute(token, 'HREF');
    const title = visibleHtmlText(token.replace(/^<A\b[^>]*>/i, '').replace(/<\/A\s*>$/i, ''));
    const favicon = htmlAttribute(token, 'ICON');
    const url = normalizeBookmarkUrl(href);
    if (!url) {
      state.invalidCount += 1;
      continue;
    }
    entries.push({
      path: htmlEntryPath(stack, hasToolbarFolder).slice(0, MAX_BOOKMARK_DEPTH),
      title,
      url,
      favicon: normalizeFavicon(favicon),
    });
  }
  return { format: 'html', entries, invalidCount: state.invalidCount, nodeCount: state.nodeCount };
}

function parseChromiumBookmarks(value) {
  const root = value && typeof value === 'object' ? value : null;
  if (!root) throw new Error('书签 JSON 必须是对象');
  const entries = [];
  const state = { nodeCount: 0, invalidCount: 0 };

  function walk(node, parentPath, depth) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    assertSourceNodeBudget(state, depth);
    const type = String(node.type || '').toLowerCase();
    const title = typeof node.name === 'string' ? node.name.trim() : typeof node.title === 'string' ? node.title.trim() : '';
    if (type === 'url' || node.url !== undefined) {
      const url = normalizeBookmarkUrl(node.url);
      if (!url) {
        state.invalidCount += 1;
        return;
      }
      entries.push({
        path: parentPath.slice(0, MAX_BOOKMARK_DEPTH),
        title,
        url,
        favicon: normalizeFavicon(node.icon || node.favicon),
      });
      return;
    }

    const nextPath = type === 'folder' && title ? [...parentPath, title] : parentPath;
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length > MAX_SOURCE_NODES) throw new Error(`单个来源超过 ${MAX_SOURCE_NODES} 个节点限制`);
    for (const child of children) walk(child, nextPath, depth + 1);
  }

  if (root.roots && typeof root.roots === 'object') {
    const preferredRoots = ['bookmark_bar', 'other', 'synced', 'mobile'];
    const rootKeys = [...preferredRoots, ...Object.keys(root.roots).filter((key) => !preferredRoots.includes(key))];
    for (const key of rootKeys) {
      const node = root.roots[key];
      if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
      if (key === 'bookmark_bar') {
        // 书签栏根节点本身不生成文件夹，其子项直接显示在收藏栏上。
        assertSourceNodeBudget(state, 0);
        const children = Array.isArray(node.children) ? node.children : [];
        if (children.length > MAX_SOURCE_NODES) throw new Error(`单个来源超过 ${MAX_SOURCE_NODES} 个节点限制`);
        for (const child of children) walk(child, [], 1);
        continue;
      }
      const name = typeof node.name === 'string' && node.name.trim() ? node.name.trim() : CHROMIUM_ROOT_TITLES[key] || key;
      walk({ ...node, type: 'folder', name }, [], 0);
    }
  } else if (Array.isArray(root)) {
    for (const node of root) walk(node, [], 0);
  } else {
    walk(root, [], 0);
  }
  return { format: 'json', entries, invalidCount: state.invalidCount, nodeCount: state.nodeCount };
}

function parseBookmarkContent(text, filePath = '') {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const extension = path.extname(String(filePath || '')).toLowerCase();
  const looksJson = extension === '.json' || /^[\s\[{]/.test(raw);
  if (looksJson) {
    try {
      return parseChromiumBookmarks(JSON.parse(raw));
    } catch (error) {
      if (extension === '.json' || /^[\s\[{]/.test(raw)) throw new Error(`书签 JSON 无法解析：${error.message}`);
    }
  }
  return parseBookmarkHtml(raw);
}

function readBookmarkSource(source) {
  const rawPath = typeof source?.filePath === 'string' ? source.filePath.trim() : '';
  if (!rawPath) throw new Error('书签来源文件无效');
  const filePath = path.resolve(rawPath);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('书签来源不是文件');
  if (stat.size > MAX_BOOKMARK_FILE_BYTES) throw new Error(`书签文件超过 ${MAX_BOOKMARK_FILE_BYTES / 1024 / 1024} MB 限制`);
  const content = fs.readFileSync(filePath, 'utf8');
  return { source, ...parseBookmarkContent(content, filePath) };
}

function sourceDescriptor(filePath, details = {}) {
  const resolved = path.resolve(String(filePath || ''));
  const browser = String(details.browser || details.kind || 'manual');
  const kind = details.kind || (browser === 'manual' ? 'manual' : 'browser');
  const profileName = String(details.profileName || path.basename(path.dirname(resolved)) || '默认配置');
  const label = String(details.label || `${browser === 'manual' ? '手动文件' : browser} · ${profileName}`);
  return {
    id: sourceIdForPath(resolved, kind),
    kind,
    browser,
    profileName,
    label,
    filePath: resolved,
  };
}

function candidateBrowserRoots(env = process.env) {
  const home = env.USERPROFILE || env.HOME || os.homedir();
  const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return [
    { browser: 'Chrome', root: path.join(local, 'Google', 'Chrome', 'User Data') },
    { browser: 'Edge', root: path.join(local, 'Microsoft', 'Edge', 'User Data') },
    { browser: 'Chromium', root: path.join(local, 'Chromium', 'User Data') },
  ];
}

function discoverBookmarkSources(env = process.env) {
  const sources = [];
  const seen = new Set();
  for (const candidate of candidateBrowserRoots(env)) {
    let profiles;
    try {
      profiles = fs.readdirSync(candidate.root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of profiles) {
      if (!entry.isDirectory()) continue;
      const profileRoot = path.join(candidate.root, entry.name);
      const fileNames = ['Bookmarks', 'AccountBookmarks'];
      let filePath = '';
      for (const fileName of fileNames) {
        const candidatePath = path.join(profileRoot, fileName);
        if (seen.has(path.resolve(candidatePath).toLowerCase())) continue;
        try {
          if (fs.statSync(candidatePath).isFile()) {
            filePath = candidatePath;
            break;
          }
        } catch {
          // Try the next compatible Chromium bookmark filename.
        }
      }
      if (!filePath || seen.has(path.resolve(filePath).toLowerCase())) continue;
      seen.add(path.resolve(filePath).toLowerCase());
      sources.push(sourceDescriptor(filePath, {
        browser: candidate.browser,
        kind: 'browser',
        profileName: entry.name,
        label: `${candidate.browser} · ${entry.name}`,
      }));
    }
  }
  return sources;
}

function createManualBookmarkSource(filePath) {
  const rawPath = typeof filePath === 'string' ? filePath.trim() : '';
  if (!rawPath) throw new Error('书签来源文件无效');
  const resolved = path.resolve(rawPath);
  return sourceDescriptor(resolved, {
    browser: 'manual',
    kind: 'manual',
    profileName: path.basename(resolved),
    label: `手动文件 · ${path.basename(resolved)}`,
  });
}

function importPathKey(pathParts) {
  return pathParts.map((item) => String(item || '').trim()).filter(Boolean).join('\u001f');
}

function mergeBookmarkSources(existing, parsedSources, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const makeId = options.makeId || ((prefix) => `${prefix}-${crypto.randomUUID()}`);
  const current = normalizeBookmarks(existing);
  const records = current.map((item) => ({ ...item }));
  const ids = new Set(records.map((item) => item.id));
  const urls = new Set(records.filter((item) => item.type === 'bookmark').map((item) => normalizeBookmarkUrl(item.url)).filter(Boolean));
  // 同一父级下的同名文件夹直接复用（含用户已有文件夹），多来源导入时像 Chrome 一样合并层级。
  const foldersByPath = new Map();
  const folderKey = (parentId, title) => `${parentId || ''}${title}`;
  for (const item of records) {
    if (item.type !== 'folder') continue;
    const key = folderKey(item.parentId, item.title);
    if (!foldersByPath.has(key)) foldersByPath.set(key, item);
  }
  const result = {
    bookmarks: records,
    added: 0,
    addedLinks: 0,
    addedFolders: 0,
    duplicates: 0,
    invalid: 0,
    failures: [],
    sources: [],
  };

  function nextId(prefix) {
    let value = makeId(prefix);
    while (!/^[A-Za-z0-9_-]{1,128}$/.test(value) || ids.has(value)) value = makeId(prefix);
    ids.add(value);
    return value;
  }

  for (const parsed of Array.isArray(parsedSources) ? parsedSources : []) {
    const source = parsed?.source || {};
    const sourceKey = safeSourceKey(source.id) || sourceIdForPath(source.filePath, source.kind || 'file');
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const invalidEntries = entries.filter((entry) => !normalizeBookmarkUrl(entry?.url)).length;
    const report = {
      id: sourceKey,
      label: source.label || sourceKey,
      added: 0,
      duplicates: 0,
      invalid: (Number(parsed?.invalidCount) || 0) + invalidEntries,
      error: String(parsed?.error || ''),
    };
    result.invalid += report.invalid;
    if (report.error) {
      result.failures.push({ id: sourceKey, label: report.label, error: report.error });
      result.sources.push(report);
      continue;
    }

    function ensureFolder(title, parentId, importPath) {
      const key = folderKey(parentId, title);
      const existingFolder = foldersByPath.get(key);
      if (existingFolder) return existingFolder;
      const folder = {
        id: nextId('folder'),
        type: 'folder',
        title,
        parentId: parentId || '',
        importSource: sourceKey,
        importPath,
        createdAt: now(),
      };
      records.push(folder);
      foldersByPath.set(key, folder);
      result.addedFolders += 1;
      result.added += 1;
      return folder;
    }

    for (const entry of entries) {
      const url = normalizeBookmarkUrl(entry?.url);
      if (!url) {
        continue;
      }
      if (urls.has(url)) {
        result.duplicates += 1;
        report.duplicates += 1;
        continue;
      }
      const pathParts = Array.isArray(entry.path) ? entry.path.slice(0, MAX_BOOKMARK_DEPTH) : [];
      let parentId = '';
      const folderPath = [];
      for (const part of pathParts) {
        const title = String(part || '').trim().slice(0, 160);
        if (!title) continue;
        folderPath.push(title);
        parentId = ensureFolder(title, parentId, importPathKey(folderPath)).id;
      }
      const bookmark = {
        id: nextId('bookmark'),
        type: 'bookmark',
        title: String(entry.title || '').trim().slice(0, 160) || new URL(url).hostname,
        url,
        favicon: normalizeFavicon(entry.favicon),
        parentId,
        importSource: sourceKey,
        importPath: importPathKey(folderPath),
        createdAt: now(),
      };
      records.push(bookmark);
      urls.add(url);
      result.added += 1;
      result.addedLinks += 1;
      report.added += 1;
    }
    result.sources.push(report);
  }

  if (records.length > MAX_TARGET_BOOKMARK_RECORDS) {
    throw new Error(`目标环境收藏超过 ${MAX_TARGET_BOOKMARK_RECORDS} 项限制`);
  }
  result.bookmarks = normalizeBookmarks(records);
  return result;
}

function publicBookmarkSource(source) {
  return {
    id: source.id,
    kind: source.kind,
    browser: source.browser,
    profileName: source.profileName,
    label: source.label,
  };
}

module.exports = {
  MAX_BOOKMARK_DEPTH,
  MAX_BOOKMARK_FILE_BYTES,
  MAX_SOURCE_NODES,
  MAX_TARGET_BOOKMARK_RECORDS,
  createManualBookmarkSource,
  discoverBookmarkSources,
  mergeBookmarkSources,
  parseBookmarkContent,
  parseBookmarkHtml,
  parseChromiumBookmarks,
  publicBookmarkSource,
  readBookmarkSource,
  sourceDescriptor,
  sourceIdForPath,
};
