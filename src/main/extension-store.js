'use strict';

const crypto = require('node:crypto');
const { fetchExtensionStoreImage, hydrateExtensionStoreImages } = require('./extension-store-images');

const API_BASE_URL = 'https://api.crxsoso.com';
const SITE_BASE_URL = 'https://www.crxsoso.com';
const CRX_SOSO_DOWNLOAD_HOSTS = new Set(['c2.crxsoso.com', 'e2.crxsoso.com']);
const STORE_API_KEY = Buffer.from('lOrd6SqeZpDdGBoY', 'utf8');
const STORE_API_IV = Buffer.from('RxE86Of9vRkNvfZL', 'utf8');
const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const MAX_SEARCH_KEYWORD_LENGTH = 160;
const MAX_SEARCH_PAGE_SIZE = 48;
const MAX_SEARCH_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_DETAIL_RESPONSE_BYTES = 8 * 1024 * 1024;

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeExtensionId(value) {
  const candidate = text(value).toLowerCase();
  return CHROME_EXTENSION_ID_PATTERN.test(candidate) ? candidate : '';
}

function extensionDetailUrl(extensionId) {
  const id = normalizeExtensionId(extensionId);
  return id ? `${SITE_BASE_URL}/webstore/detail/${id}` : '';
}

function chromeWebStoreDetailUrl(extensionId) {
  const id = normalizeExtensionId(extensionId);
  return id ? `https://chromewebstore.google.com/detail/${id}` : '';
}

function chromeStoreDownloadUrl(extensionId) {
  const id = normalizeExtensionId(extensionId);
  if (!id) return '';
  return `https://clients2.google.com/service/update2/crx?response=redirect&os=win&arch=x86-64&os_arch=x86-64&nacl_arch=x86-64&prod=chromecrx&prodchannel=unknown&prodversion=9999.0.9999.0&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;
}

function encryptPayload(value) {
  const source = Buffer.from(JSON.stringify(value), 'utf8');
  const padding = 16 - (source.length % 16);
  const padded = Buffer.concat([source, Buffer.alloc(padding, padding)]);
  const cipher = crypto.createCipheriv('aes-128-ctr', STORE_API_KEY, STORE_API_IV);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('hex');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function htmlAttribute(html, attribute, value) {
  const pattern = new RegExp(`<meta[^>]+(?:${attribute}=["']${value}["'][^>]*|${value}=["'][^"']+["'][^>]*)>`, 'i');
  const match = String(html || '').match(pattern);
  if (!match) return '';
  const content = match[0].match(/content=["']([^"']*)["']/i);
  return decodeHtml(content?.[1] || '');
}

function htmlMeta(html, property) {
  return htmlAttribute(html, 'property', property) || htmlAttribute(html, 'name', property);
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

function nuxtField(html, field, type = 'string') {
  const source = String(html || '');
  const expression = type === 'number'
    ? new RegExp(`${field}:(\\d+(?:\\.\\d+)?)`)
    : new RegExp(String.raw`${field}:"([^"\\]*(?:\\.[^"\\]*)*)"`);
  const match = source.match(expression);
  if (!match) return type === 'number' ? null : '';
  if (type === 'number') return Number(match[1]);
  return match[1].replace(/\\u002F/g, '/').replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

function parseDetailHtml(html, extensionId) {
  const id = normalizeExtensionId(extensionId);
  if (!id || !String(html || '').includes(`crxId:"${id}"`)) throw new Error('CRX Soso 未返回匹配的插件详情');
  const structured = jsonLd(html);
  const title = htmlMeta(html, 'og:title') || nuxtField(html, 'name') || `插件 ${id.slice(0, 6)}`;
  const description = htmlMeta(html, 'og:description') || nuxtField(html, 'shortDescription');
  const officialUrl = chromeWebStoreDetailUrl(id);
  const categoryMatch = String(html || '').match(/href=["']\/webstore\/category\/[^"']+["'][^>]*>([^<]+)</i);
  const category = text(decodeHtml(categoryMatch?.[1] || nuxtField(html, 'categoryName')));
  const version = nuxtField(html, 'version');
  const manifestVersion = nuxtField(html, 'manifestVersion', 'number');
  const activeInstallCount = nuxtField(html, 'activeInstallCount', 'number');
  const ratingCount = Number(structured?.aggregateRating?.ratingCount) || nuxtField(html, 'ratingCount', 'number');
  const averageRating = text(structured?.aggregateRating?.ratingValue, nuxtField(html, 'averageRating'));
  const minKernelVersion = nuxtField(html, 'minKernelVersion');
  const size = nuxtField(html, 'size');
  const developer = nuxtField(html, 'developerName') || nuxtField(html, 'developer');
  const image = htmlMeta(html, 'og:image') || nuxtField(html, 'thumbnail');
  return {
    id,
    extensionId: id,
    sourceType: 'crxsoso-chrome',
    sourceUrl: extensionDetailUrl(id),
    officialUrl,
    name: decodeHtml(title.replace(/\s+\|\s+Chrome扩展\s+-\s+Crx搜搜$/i, '')),
    description,
    shortDescription: description,
    image,
    version,
    manifestVersion: Number.isFinite(manifestVersion) ? manifestVersion : null,
    activeInstallCount: Number.isFinite(activeInstallCount) ? activeInstallCount : null,
    ratingCount: Number.isFinite(Number(ratingCount)) ? Number(ratingCount) : null,
    averageRating,
    category,
    minKernelVersion,
    size,
    developer,
  };
}

async function readResponse(response, maxBytes) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('商店响应超过大小限制');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error('商店响应超过大小限制');
  return buffer;
}

async function postJson(pathname, payload, requestFetch = fetch) {
  const response = await requestFetch(`${API_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json; charset=UTF-8',
      origin: SITE_BASE_URL,
      referer: `${SITE_BASE_URL}/`,
      'user-agent': 'ChromeProfileBrowser-extension-store',
    },
    body: JSON.stringify({ data: encryptPayload(payload) }),
  });
  if (!response.ok) throw new Error(`CRX Soso 请求失败：HTTP ${response.status}`);
  const buffer = await readResponse(response, MAX_SEARCH_RESPONSE_BYTES);
  let result;
  try {
    result = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('CRX Soso 返回了无效 JSON');
  }
  if (result?.code !== 200) throw new Error(text(result?.message, 'CRX Soso 请求失败'));
  return result;
}

async function searchCrxSosoExtensions(input = {}, requestFetch = fetch) {
  const keyword = text(input.keyword).slice(0, MAX_SEARCH_KEYWORD_LENGTH);
  if (!keyword) throw new Error('请输入插件搜索关键词');
  const page = Number.isSafeInteger(Number(input.page)) && Number(input.page) > 0 ? Number(input.page) : 1;
  const size = Math.min(MAX_SEARCH_PAGE_SIZE, Math.max(1, Number(input.size) || 18));
  const token = text(input.token).slice(0, 512);
  const result = await postJson('/search/result?type=chrome', { keyword, page, size, token }, requestFetch);
  const data = result.data && typeof result.data === 'object' ? result.data : {};
  const extensions = (Array.isArray(data.extensionList) ? data.extensionList : [])
    .map((item) => {
      const id = normalizeExtensionId(item?.crxId);
      if (!id) return null;
      return {
        id,
        extensionId: id,
        sourceType: 'crxsoso-chrome',
        sourceUrl: extensionDetailUrl(id),
        officialUrl: chromeWebStoreDetailUrl(id),
        name: text(item?.name, `插件 ${id.slice(0, 6)}`),
        description: text(item?.shortDescription),
        image: text(item?.thumbnail),
        imageAddon: text(item?.thumbnailAddon),
        category: text(item?.categoryName),
        version: '',
        averageRating: text(item?.averageRating),
        ratingCount: Number.isFinite(Number(item?.ratingCount)) ? Number(item.ratingCount) : null,
        activeInstallCount: Number.isFinite(Number(item?.activeInstallCount)) ? Number(item.activeInstallCount) : null,
        canInstall: true,
      };
    })
    .filter(Boolean);
  const hydratedExtensions = await hydrateExtensionStoreImages(extensions, requestFetch, ['.crxsoso.com']);
  return {
    keyword,
    page,
    extensions: hydratedExtensions,
    nextToken: text(data.nextToken),
    nextPageNo: Number.isSafeInteger(Number(data.nextPageNo)) ? Number(data.nextPageNo) : page + 1,
    hasMorePages: Boolean(data.hasMorePages),
  };
}

async function getCrxSosoExtensionDetails(extensionId, requestFetch = fetch) {
  const id = normalizeExtensionId(extensionId);
  if (!id) throw new Error('插件标识无效');
  const response = await requestFetch(extensionDetailUrl(id), {
    headers: { 'user-agent': 'ChromeProfileBrowser-extension-store' },
  });
  if (!response.ok) throw new Error(`CRX Soso 详情请求失败：HTTP ${response.status}`);
  const html = (await readResponse(response, MAX_DETAIL_RESPONSE_BYTES)).toString('utf8');
  const detail = parseDetailHtml(html, id);
  return {
    ...detail,
    image: await fetchExtensionStoreImage(detail.image, requestFetch, ['.crxsoso.com']),
  };
}

function validateDownloadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.username || url.password || !CRX_SOSO_DOWNLOAD_HOSTS.has(url.hostname.toLowerCase())) return '';
  return url.toString();
}

async function resolveCrxSosoDownload(extensionId, details = {}, requestFetch = fetch) {
  const id = normalizeExtensionId(extensionId);
  if (!id) throw new Error('插件标识无效');
  const name = text(details.name, `插件 ${id.slice(0, 6)}`);
  const version = text(details.version, '');
  const size = text(details.size, '');
  const result = await postJson('/chrome/dlink', {
    storeUrl: `https://chrome.google.com/webstore/detail/${id}`,
    addonId: id,
    storeType: 'chrome',
    downloadUrl: chromeStoreDownloadUrl(id),
    name,
    version,
    size,
  }, requestFetch);
  const url = validateDownloadUrl(result?.dlink)
    || validateDownloadUrl(result?.dlinkOffline?.find((item) => item?.format === '.crx')?.dlink);
  if (!url) throw new Error('CRX Soso 未返回可验证的 CRX 下载地址');
  return url;
}

module.exports = {
  getCrxSosoExtensionDetails,
  normalizeExtensionId,
  resolveCrxSosoDownload,
  searchCrxSosoExtensions,
};
