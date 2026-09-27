const { isIP } = require('node:net');

const MAX_SITE_RECORDS = 100;
const MAX_RECOMMENDED_SITES = 6;
const MIN_SITE_VISITS = 2;
const SITE_RECORD_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_VISIT_COUNT = 1_000_000;
const LOCAL_HOST_SUFFIXES = ['.localhost', '.local', '.test', '.invalid', '.example', '.internal', '.lan', '.home'];

function canonicalizeSite(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;

  const hostname = parsed.hostname.toLowerCase();
  const host = hostname.replace(/^www\./, '');
  if (!host || !host.includes('.') || isIP(hostname)
    || LOCAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return null;

  const authority = `${host}${parsed.port ? `:${parsed.port}` : ''}`;
  return { host, origin: `${parsed.protocol}//${authority}` };
}

function compareSiteVisits(left, right) {
  return right.visits - left.visits
    || right.lastVisited - left.lastVisited
    || left.host.localeCompare(right.host);
}

function normalizeSiteVisits(value, now = Date.now()) {
  const cutoff = now - SITE_RECORD_TTL_MS;
  const records = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || typeof item !== 'object') continue;
    const site = canonicalizeSite(item.origin);
    const visits = Number(item.visits);
    const lastVisited = Number(item.lastVisited);
    if (!site || site.host !== item.host || !Number.isSafeInteger(visits) || visits < 1
      || !Number.isFinite(lastVisited) || lastVisited < cutoff || lastVisited > now) continue;
    const previous = records.get(site.host);
    records.set(site.host, {
      host: site.host,
      origin: site.origin,
      visits: Math.min(MAX_VISIT_COUNT, visits + (previous?.visits || 0)),
      lastVisited: Math.max(lastVisited, previous?.lastVisited || 0),
    });
  }
  return [...records.values()].sort(compareSiteVisits).slice(0, MAX_SITE_RECORDS);
}

function recordSiteVisit(value, url, now = Date.now()) {
  const records = normalizeSiteVisits(value, now);
  const site = canonicalizeSite(url);
  if (!site) return records;
  const previous = records.find((item) => item.host === site.host);
  const next = records.filter((item) => item.host !== site.host);
  next.push({
    host: site.host,
    origin: site.origin,
    visits: Math.min(MAX_VISIT_COUNT, (previous?.visits || 0) + 1),
    lastVisited: now,
  });
  return next.sort(compareSiteVisits).slice(0, MAX_SITE_RECORDS);
}

function recommendedSites(value, configuredSites = [], now = Date.now()) {
  const configuredHosts = new Set((Array.isArray(configuredSites) ? configuredSites : [])
    .map((item) => canonicalizeSite(item?.url)?.host)
    .filter(Boolean));
  return normalizeSiteVisits(value, now)
    .filter((item) => item.visits >= MIN_SITE_VISITS && !configuredHosts.has(item.host))
    .slice(0, MAX_RECOMMENDED_SITES)
    .map((item, index) => ({
      id: `recognized-${index + 1}`,
      name: item.host,
      url: `${item.origin}/`,
      icon: item.host.split('.')[0].slice(0, 2).toUpperCase() || '↗',
    }));
}

module.exports = {
  MAX_RECOMMENDED_SITES,
  SITE_RECORD_TTL_MS,
  canonicalizeSite,
  normalizeSiteVisits,
  recordSiteVisit,
  recommendedSites,
};
