const { fetchExtensionStoreImage, hydrateExtensionStoreImages } = require('./extension-store-images');

const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const OFFICIAL_STORE_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
]);
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_SEARCH_KEYWORD_LENGTH = 160;
const MAX_SEARCH_RESULTS = 48;

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeExtensionId(value) {
  const candidate = text(value).toLowerCase();
  return CHROME_EXTENSION_ID_PATTERN.test(candidate) ? candidate : '';
}

function isOfficialStoreUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && OFFICIAL_STORE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function officialExtensionDetailUrl(extensionId) {
  const id = normalizeExtensionId(extensionId);
  return id ? `https://chromewebstore.google.com/detail/${id}` : '';
}

function officialExtensionSearchUrl(keyword) {
  const value = text(keyword).slice(0, MAX_SEARCH_KEYWORD_LENGTH);
  return value ? `https://chromewebstore.google.com/search/${encodeURIComponent(value)}` : '';
}

function normalizeOfficialExtensionId(source) {
  const raw = text(source).toLowerCase();
  if (normalizeExtensionId(raw)) return normalizeExtensionId(raw);
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (!isOfficialStoreUrl(url.toString())) return '';
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0]?.toLowerCase() === 'webstore') segments.shift();
  if (segments[0]?.toLowerCase() !== 'detail') return '';
  return segments.map(normalizeExtensionId).find(Boolean) || '';
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x2F;|&#47;/gi, '/');
}

function decodeEscaped(value) {
  const source = decodeHtml(String(value || ''))
    .replace(/\\u002F/gi, '/')
    .replace(/\\u003A/gi, ':')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
  return source;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function htmlMeta(html, property) {
  const wanted = String(property || '').toLowerCase();
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gi)) {
      attributes[match[1].toLowerCase()] = match[3];
    }
    if ((attributes.property || attributes.name || '').toLowerCase() !== wanted) continue;
    return decodeEscaped(attributes.content || '');
  }
  return '';
}

function jsonLd(html) {
  const match = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return {};
  try {
    const value = JSON.parse(match[1]);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function nearbyField(source, offset, names, limit = 1200) {
  const start = Math.max(0, offset - limit);
  const end = Math.min(source.length, offset + limit);
  const context = source.slice(start, end);
  const fieldPattern = names.map(escapeRegExp).join('|');
  const keyPrefix = `(?:^|[^A-Za-z0-9_$])(?:["']?(?:${fieldPattern})["']?)`;
  const patterns = [
    new RegExp(`${keyPrefix}\\s*[:=]\\s*["']([^"'\\\\]{1,240})["']`, 'i'),
    new RegExp(`${keyPrefix}\\s*[:=]\\s*\\\\?["']([^"'\\\\]{1,240})\\\\?["']`, 'i'),
    new RegExp(`${keyPrefix}\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match?.[1]) return decodeEscaped(match[1]).replace(/\s+/g, ' ').trim();
  }
  return '';
}

function nearbyExtensionName(source, offset, limit = 1200) {
  const start = Math.max(0, offset - limit);
  const end = Math.min(source.length, offset + limit);
  const context = source.slice(start, end);
  const pattern = /(?:^|[^A-Za-z0-9_$])(?:["']?(?:name|title|shortName|short_name)["']?)\s*[:=]\s*["']([^"'\\]{1,240})["']/gi;
  const candidates = [];
  let match;
  while ((match = pattern.exec(context))) {
    if (!match[1]) continue;
    candidates.push({
      value: decodeEscaped(match[1]).replace(/\s+/g, ' ').trim(),
      distance: Math.abs(start + match.index - offset),
    });
  }
  candidates.sort((left, right) => left.distance - right.distance);
  return candidates[0]?.value || '';
}

function nearbyImage(source, offset, limit = 1400) {
  const start = Math.max(0, offset - limit);
  const end = Math.min(source.length, offset + limit);
  const context = decodeEscaped(source.slice(start, end));
  const matches = context.match(/https:\/\/[^"'\\\s]+/gi) || [];
  return matches.find((value) => /googleusercontent\.com|gstatic\.com/i.test(value)) || '';
}

function detailPathSlug(source, offset) {
  const context = source.slice(Math.max(0, offset - 240), offset + 260);
  const match = context.match(/(?:\.\/)?\/?detail\/([^/"'\\\s]+)(?:\/|[?#])/i);
  if (!match) return '';
  try {
    return decodeURIComponent(decodeEscaped(match[1]).replace(/[-_]+/g, ' '));
  } catch {
    return decodeEscaped(match[1]).replace(/[-_]+/g, ' ');
  }
}

function firstHtmlTagText(source, tagName) {
  const pattern = new RegExp('<' + tagName + '\\b[^>]*>([\\s\\S]*?)</' + tagName + '>', 'i');
  const match = String(source || '').match(pattern);
  return visibleHtmlText(match?.[1] || '').slice(0, 500);
}

function searchCardRecord(id, source, start, end, fallbackName = '') {
  const card = source.slice(start, end);
  const base = extensionRecord(id, source, start, fallbackName);
  const name = firstHtmlTagText(card, 'h2')
    || firstHtmlTagText(card, 'h3')
    || base.name;
  const summary = card.match(/<p\b[^>]*\bclass=["'][^"']*\bg3IrHd\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  const description = visibleHtmlText(summary?.[1]) || firstHtmlTagText(card, 'p') || base.description;
  const image = nearbyImage(card, 0, card.length) || base.image;
  return {
    ...base,
    name: name.slice(0, 200),
    description: description.slice(0, 500),
    image,
  };
}

function visibleHtmlText(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function nearbyDetailLinkName(source, offset, extensionId) {
  const lowerSource = source.toLowerCase();
  let openOffset = lowerSource.lastIndexOf('<a', offset);
  while (openOffset >= 0 && /[a-z0-9]/i.test(source[openOffset + 2] || '')) {
    openOffset = lowerSource.lastIndexOf('<a', openOffset - 1);
  }
  if (openOffset < 0) return '';
  const openingEnd = source.indexOf('>', openOffset);
  if (openingEnd < 0 || openingEnd < offset || offset - openOffset > 2400) return '';
  const closeOffset = source.indexOf('</a>', openingEnd);
  if (closeOffset < 0 || closeOffset - openOffset > 4000) return '';
  const anchor = source.slice(openOffset, closeOffset + 4);
  const idPattern = new RegExp('(?:^|[^a-z0-9])' + escapeRegExp(extensionId) + '(?=$|[^a-z0-9])', 'i');
  if (!idPattern.test(anchor)) return '';
  const attributes = [...anchor.matchAll(/\b(?:aria-label|data-name|data-title|title)\s*=\s*(["'])(.*?)\1/gi)];
  for (const match of attributes) {
    const value = visibleHtmlText(match[2]);
    if (value) return value.slice(0, 200);
  }
  const inner = anchor.replace(/^<a\b[^>]*>/i, '').replace(/<\/a>$/i, '');
  const heading = inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const headingText = visibleHtmlText(heading?.[1]);
  if (headingText) return headingText.slice(0, 200);
  const firstTextNode = [...inner.matchAll(/>([^<>]{1,240})</g)]
    .map((match) => visibleHtmlText(match[1]))
    .find(Boolean);
  if (firstTextNode) return firstTextNode.slice(0, 200);
  const text = visibleHtmlText(inner);
  return text ? text.slice(0, 200) : '';
}

function extensionRecord(id, source, offset, fallbackName = '') {
  const name = nearbyDetailLinkName(source, offset, id)
    || detailPathSlug(source, offset)
    || nearbyExtensionName(source, offset)
    || fallbackName
    || `插件 ${id.slice(0, 6)}`;
  const description = nearbyField(source, offset, ['description', 'shortDescription', 'short_description']);
  const version = nearbyField(source, offset, ['version']);
  const image = nearbyImage(source, offset);
  return {
    id,
    extensionId: id,
    sourceType: 'chrome-web-store',
    sourceUrl: officialExtensionDetailUrl(id),
    officialUrl: officialExtensionDetailUrl(id),
    name: decodeHtml(name).slice(0, 200),
    description: decodeHtml(description).slice(0, 500),
    image,
    version: decodeHtml(version).slice(0, 80),
    canInstall: true,
  };
}

function parseOfficialStoreSearchHtml(html, keyword = '') {
  const source = decodeEscaped(String(html || ''));
  const records = [];
  const seen = new Set();
  const addRecord = (record) => {
    if (!record?.id || seen.has(record.id) || records.length >= MAX_SEARCH_RESULTS) return;
    seen.add(record.id);
    records.push(record);
  };
  const cards = [...source.matchAll(/\bdata-item-id\s*=\s*["']([a-p]{32})["']/gi)];
  cards.forEach((match, index) => {
    const id = normalizeExtensionId(match[1]);
    if (!id) return;
    const start = match.index;
    const nextStart = cards[index + 1]?.index;
    const end = Math.min(nextStart ?? source.length, start + 16000);
    addRecord(searchCardRecord(id, source, start, end, text(keyword)));
  });
  const patterns = [
    /https?:\/\/(?:chromewebstore\.google\.com|chrome\.google\.com)\/(?:webstore\/)?detail\/(?:[^"'\/\s]+\/)?([a-p]{32})(?=[/?#"'\s]|$)/gi,
    /(?:^|["'(])(?:\.\/)?\/(?:webstore\/)?detail\/(?:[^"'\/\s]+\/)?([a-p]{32})(?=[/?#"'\s]|$)/gi,
    /(?:^|[^A-Za-z0-9_$])(?:["']?(?:crxId|extensionId|extension_id|itemId|item_id|appId|app_id|id)["']?)\s*[:=]\s*["']([a-p]{32})["']/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) && records.length < MAX_SEARCH_RESULTS) {
      const id = normalizeExtensionId(match[1]);
      if (!id || seen.has(id)) continue;
      const idOffset = match.index + match[0].toLowerCase().lastIndexOf(id);
      addRecord(extensionRecord(id, source, idOffset, text(keyword)));
    }
  }
  return records;
}

function parseOfficialStoreDetailHtml(html, extensionId) {
  const id = normalizeOfficialExtensionId(extensionId) || normalizeExtensionId(extensionId);
  if (!id) throw new Error('Chrome Web Store 插件标识无效');
  const source = decodeEscaped(String(html || ''));
  if (!new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(id)}(?=$|[^a-z0-9])`, 'i').test(source)) {
    throw new Error('Chrome Web Store 未返回匹配的插件详情');
  }
  const structured = jsonLd(source);
  const offset = Math.max(0, source.toLowerCase().indexOf(id));
  const record = extensionRecord(id, source, offset, htmlMeta(source, 'og:title'));
  const title = htmlMeta(source, 'og:title') || structured.name || record.name;
  const description = htmlMeta(source, 'og:description') || structured.description || record.description;
  const image = htmlMeta(source, 'og:image') || structured.image || record.image;
  const structuredVersion = text(structured.softwareVersion || structured.version);
  return {
    ...record,
    name: decodeHtml(String(title).replace(/\s+[-|]\s+Chrome Web Store.*$/i, '')).slice(0, 200),
    description: decodeHtml(description).slice(0, 2000),
    image: text(image),
    version: record.version || structuredVersion || nearbyField(source, offset, ['version']),
    manifestVersion: Number(nearbyField(source, offset, ['manifestVersion', 'manifest_version'])) || null,
  };
}

async function readResponse(response, maxBytes = MAX_RESPONSE_BYTES) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('Chrome Web Store 响应超过大小限制');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error('Chrome Web Store 响应超过大小限制');
  return buffer.toString('utf8');
}

async function fetchOfficialPage(url, requestFetch = fetch) {
  if (!isOfficialStoreUrl(url)) throw new Error('Chrome Web Store 地址必须使用官方 HTTPS 主机');
  let current = new URL(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await requestFetch(current, {
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'ChromeProfileBrowser-official-store',
      },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (redirects === 3) throw new Error('Chrome Web Store 重定向次数过多');
      const next = new URL(location, current);
      if (!isOfficialStoreUrl(next.toString())) throw new Error('Chrome Web Store 重定向到未允许的主机');
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`Chrome Web Store 请求失败：HTTP ${response.status}`);
    return { html: await readResponse(response), url: current.toString() };
  }
  throw new Error('Chrome Web Store 请求失败');
}

async function searchOfficialExtensionStore(input = {}, requestFetch = fetch) {
  const keyword = text(input.keyword).slice(0, MAX_SEARCH_KEYWORD_LENGTH);
  if (!keyword) throw new Error('请输入插件搜索关键词');
  const target = officialExtensionSearchUrl(keyword);
  const page = await fetchOfficialPage(target, requestFetch);
  const extensions = await hydrateExtensionStoreImages(
    parseOfficialStoreSearchHtml(page.html, keyword),
    requestFetch,
    ['.googleusercontent.com', '.gstatic.com'],
  );
  return {
    keyword,
    page: 1,
    extensions,
    nextToken: '',
    hasMorePages: false,
    sourceType: 'chrome-web-store',
    sourceUrl: page.url,
  };
}

async function getOfficialExtensionStoreDetail(extensionId, requestFetch = fetch) {
  const id = normalizeOfficialExtensionId(extensionId) || normalizeExtensionId(extensionId);
  if (!id) throw new Error('Chrome Web Store 插件标识无效');
  const page = await fetchOfficialPage(officialExtensionDetailUrl(id), requestFetch);
  const detail = parseOfficialStoreDetailHtml(page.html, id);
  return {
    ...detail,
    image: await fetchExtensionStoreImage(detail.image, requestFetch, ['.googleusercontent.com', '.gstatic.com']),
  };
}

module.exports = {
  getOfficialExtensionStoreDetail,
  isOfficialStoreUrl,
  normalizeOfficialExtensionId,
  officialExtensionDetailUrl,
  officialExtensionSearchUrl,
  parseOfficialStoreDetailHtml,
  parseOfficialStoreSearchHtml,
  searchOfficialExtensionStore,
};
