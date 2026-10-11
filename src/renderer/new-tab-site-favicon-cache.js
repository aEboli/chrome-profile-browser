(function attachNewTabSiteFaviconCache(root, createApi) {
  const api = createApi();
  if (root) root.NewTabSiteFaviconCache = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? null : window, () => {
  const MAX_CACHE_ENTRIES = 32;
  const MAX_FAVICON_DATA_URL_LENGTH = 128 * 1024;

  function normalizeHttpUrl(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    if (!normalized || normalized.length > 4096) return '';
    try {
      return ['http:', 'https:'].includes(new URL(normalized).protocol) ? normalized : '';
    } catch {
      return '';
    }
  }

  function isFaviconDataUrl(value) {
    return typeof value === 'string'
      && value.length <= MAX_FAVICON_DATA_URL_LENGTH
      && /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(value);
  }

  function create(storageProvider, key) {
    const entries = new Map();
    const getStorage = () => {
      try {
        return typeof storageProvider === 'function' ? storageProvider() : storageProvider;
      } catch {
        return null;
      }
    };

    const storage = getStorage();
    try {
      const parsed = JSON.parse(storage?.getItem(key) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [url, favicon] of Object.entries(parsed).slice(-MAX_CACHE_ENTRIES)) {
          const normalizedUrl = normalizeHttpUrl(url);
          if (normalizedUrl && isFaviconDataUrl(favicon)) entries.set(normalizedUrl, favicon);
        }
      }
    } catch {
      // Invalid or unavailable storage falls back to an empty in-memory cache.
    }

    function persist() {
      try {
        const target = getStorage();
        if (!target) return;
        if (entries.size) target.setItem(key, JSON.stringify(Object.fromEntries(entries)));
        else target.removeItem(key);
      } catch {
        // Storage quota or access failures do not block shortcut rendering.
      }
    }

    return {
      get(url) {
        return entries.get(normalizeHttpUrl(url)) || '';
      },
      has(url) {
        return entries.has(normalizeHttpUrl(url));
      },
      set(url, favicon) {
        const normalizedUrl = normalizeHttpUrl(url);
        if (!normalizedUrl || !isFaviconDataUrl(favicon)) return false;
        entries.delete(normalizedUrl);
        entries.set(normalizedUrl, favicon);
        while (entries.size > MAX_CACHE_ENTRIES) entries.delete(entries.keys().next().value);
        persist();
        return true;
      },
      delete(url) {
        if (!entries.delete(normalizeHttpUrl(url))) return false;
        persist();
        return true;
      },
      retain(urls) {
        const retained = new Set(urls.map(normalizeHttpUrl).filter(Boolean));
        let changed = false;
        for (const url of entries.keys()) {
          if (retained.has(url)) continue;
          entries.delete(url);
          changed = true;
        }
        if (changed) persist();
      },
    };
  }

  return { create, isFaviconDataUrl };
});
