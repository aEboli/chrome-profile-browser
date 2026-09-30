'use strict';

const MAX_EXTENSION_STORE_IMAGE_BYTES = 512 * 1024;
const MAX_EXTENSION_STORE_IMAGE_REDIRECTS = 3;
const IMAGE_REQUEST_TIMEOUT_MS = 8000;

function imageUrl(value, allowedHosts) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
  const host = url.hostname.toLowerCase();
  const allowed = (Array.isArray(allowedHosts) ? allowedHosts : []).some((pattern) => {
    const candidate = String(pattern || '').toLowerCase();
    return candidate.startsWith('.') ? host.endsWith(candidate) : host === candidate;
  });
  return allowed ? url.toString() : '';
}

async function readImageResponse(response) {
  const mimeType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType)) return '';
  const contentLength = Number(response.headers?.get?.('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_EXTENSION_STORE_IMAGE_BYTES) return '';
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length || body.length > MAX_EXTENSION_STORE_IMAGE_BYTES) return '';
  return `data:${mimeType};base64,${body.toString('base64')}`;
}

async function fetchExtensionStoreImage(value, requestFetch = fetch, allowedHosts = []) {
  let current = imageUrl(value, allowedHosts);
  if (!current) return '';
  try {
    for (let redirects = 0; redirects <= MAX_EXTENSION_STORE_IMAGE_REDIRECTS; redirects += 1) {
      const response = await requestFetch(current, {
        redirect: 'manual',
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'user-agent': 'ChromeProfileBrowser-extension-store',
        },
        signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
      });
      const location = response.headers?.get?.('location');
      if (response.status >= 300 && response.status < 400 && location) {
        if (redirects === MAX_EXTENSION_STORE_IMAGE_REDIRECTS) return '';
        current = imageUrl(new URL(location, current).toString(), allowedHosts);
        if (!current) return '';
        continue;
      }
      if (!response.ok) return '';
      return await readImageResponse(response);
    }
  } catch {
    return '';
  }
  return '';
}

async function hydrateExtensionStoreImages(records, requestFetch, allowedHosts) {
  const source = Array.isArray(records) ? records : [];
  const hydrated = source.map((record) => ({ ...record }));
  const cache = new Map();
  const load = (value) => {
    const key = String(value || '');
    if (!key) return Promise.resolve('');
    if (!cache.has(key)) cache.set(key, fetchExtensionStoreImage(key, requestFetch, allowedHosts));
    return cache.get(key);
  };
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < hydrated.length) {
      const index = nextIndex++;
      const record = hydrated[index];
      const candidates = [record.imageAddon, record.image].filter(Boolean);
      let image = '';
      for (const candidate of candidates) {
        image = await load(candidate);
        if (image) break;
      }
      hydrated[index].image = image;
      if (Object.prototype.hasOwnProperty.call(hydrated[index], 'imageAddon')) hydrated[index].imageAddon = '';
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, hydrated.length) }, () => worker()));
  return hydrated;
}

module.exports = {
  fetchExtensionStoreImage,
  hydrateExtensionStoreImages,
};
