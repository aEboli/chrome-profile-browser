'use strict';

const MAX_BROWSING_HISTORY_ENTRIES = 1000;
const MAX_BROWSING_HISTORY_URL_LENGTH = 2048;
const MAX_BROWSING_HISTORY_TITLE_LENGTH = 512;

function normalizeBrowsingHistory(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const records = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const url = String(item.url || '').trim().slice(0, MAX_BROWSING_HISTORY_URL_LENGTH);
    const title = String(item.title || '').trim().slice(0, MAX_BROWSING_HISTORY_TITLE_LENGTH);
    const visitedAt = String(item.visitedAt || '').trim();
    if (!url || !visitedAt || seen.has(url)) continue;
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    if (!['http:', 'https:'].includes(parsed.protocol)) continue;
    parsed.username = '';
    parsed.password = '';
    const normalizedUrl = parsed.toString().slice(0, MAX_BROWSING_HISTORY_URL_LENGTH);
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    records.push({ url: normalizedUrl, title, visitedAt });
    if (records.length >= MAX_BROWSING_HISTORY_ENTRIES) break;
  }
  return records;
}

function recordBrowsingHistory(value, input = {}, now = new Date().toISOString()) {
  const history = normalizeBrowsingHistory(value);
  const source = input && typeof input === 'object' ? input : {};
  let url = String(source.url || '').trim().slice(0, MAX_BROWSING_HISTORY_URL_LENGTH);
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return history;
    parsed.username = '';
    parsed.password = '';
    url = parsed.toString().slice(0, MAX_BROWSING_HISTORY_URL_LENGTH);
  } catch {
    return history;
  }
  const title = String(source.title || '').trim().slice(0, MAX_BROWSING_HISTORY_TITLE_LENGTH);
  return [{ url, title, visitedAt: now }, ...history.filter((record) => record.url !== url)]
    .slice(0, MAX_BROWSING_HISTORY_ENTRIES);
}

function deleteBrowsingHistoryEntry(value, url) {
  const target = String(url || '').trim();
  return normalizeBrowsingHistory(value).filter((record) => record.url !== target);
}

module.exports = {
  deleteBrowsingHistoryEntry,
  MAX_BROWSING_HISTORY_ENTRIES,
  normalizeBrowsingHistory,
  recordBrowsingHistory,
};
