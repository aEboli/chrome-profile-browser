const MAX_SEARCH_HISTORY_ENTRIES = 10;
const MAX_SEARCH_QUERY_LENGTH = 500;

function looksLikeAddress(value) {
  if (/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:[/?#]|$)/i.test(value)) return true;
  if (/^\[[0-9a-f:]+\](?::\d+)?(?:[/?#]|$)/i.test(value)) return true;
  return /^[^\s/?#]+\.[^\s/?#]+(?::\d+)?(?:[/?#].*)?$/i.test(value);
}

function isSearchQuery(value) {
  const query = typeof value === 'string' ? value.trim() : '';
  if (!query || query.length > MAX_SEARCH_QUERY_LENGTH) return false;
  if (/^(?:https?:|about:)/i.test(query) || looksLikeAddress(query)) return false;
  return true;
}

function normalizeSearchHistory(value) {
  const records = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    if (!isSearchQuery(item)) continue;
    const query = item.trim();
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(query);
    if (records.length >= MAX_SEARCH_HISTORY_ENTRIES) break;
  }
  return records;
}

function recordSearchQuery(value, input) {
  const history = normalizeSearchHistory(value);
  if (!isSearchQuery(input)) return history;
  const query = input.trim();
  const key = query.toLowerCase();
  return [query, ...history.filter((item) => item.toLowerCase() !== key)]
    .slice(0, MAX_SEARCH_HISTORY_ENTRIES);
}

module.exports = {
  MAX_SEARCH_HISTORY_ENTRIES,
  MAX_SEARCH_QUERY_LENGTH,
  isSearchQuery,
  normalizeSearchHistory,
  recordSearchQuery,
};
