const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_RECOMMENDED_SITES,
  SITE_RECORD_TTL_MS,
  canonicalizeSite,
  normalizeSiteVisits,
  recordSiteVisit,
  recommendedSites,
} = require('../src/main/new-tab-sites');

test('canonicalizes public HTTP(S) sites to roots and ignores unsafe or local addresses', () => {
  assert.deepEqual(canonicalizeSite('https://www.Example.com/account?token=private#settings'), {
    host: 'example.com',
    origin: 'https://example.com',
  });
  for (const url of [
    'file:///C:/secret.txt',
    'https://user:pass@example.com/',
    'http://localhost:3000/',
    'http://app.local/',
    'https://192.0.2.10/',
  ]) assert.equal(canonicalizeSite(url), null, url);
});

test('records host-level visits without retaining page paths or query strings', () => {
  const now = 1_800_000_000_000;
  const first = recordSiteVisit([], 'https://www.example.com/account?id=42', now);
  const second = recordSiteVisit(first, 'https://example.com/settings?token=private', now + 1000);
  assert.deepEqual(second, [{ host: 'example.com', origin: 'https://example.com', visits: 2, lastVisited: now + 1000 }]);
});

test('shows only repeated recent visits and ranks by frequency then recency', () => {
  const now = 1_800_000_000_000;
  const records = [
    { host: 'frequent.example.com', origin: 'https://frequent.example.com', visits: 4, lastVisited: now - 2000 },
    { host: 'recent.example.com', origin: 'https://recent.example.com', visits: 2, lastVisited: now - 1000 },
    { host: 'once.example.com', origin: 'https://once.example.com', visits: 1, lastVisited: now },
    { host: 'old.example.com', origin: 'https://old.example.com', visits: 12, lastVisited: now - SITE_RECORD_TTL_MS - 1 },
  ];
  assert.deepEqual(recommendedSites(records, [], now).map((site) => site.name), ['frequent.example.com', 'recent.example.com']);
});

test('starts a new count after a site has been inactive for 90 days', () => {
  const now = 1_800_000_000_000;
  const previous = recordSiteVisit([], 'https://example.com/', now);
  const next = recordSiteVisit(previous, 'https://example.com/', now + SITE_RECORD_TTL_MS + 1);
  assert.equal(next[0].visits, 1);
  assert.deepEqual(recommendedSites(next, [], now + SITE_RECORD_TTL_MS + 1), []);
});

test('keeps automatic suggestions bounded and defers to a manually configured host', () => {
  const now = 1_800_000_000_000;
  const records = Array.from({ length: MAX_RECOMMENDED_SITES + 2 }, (_, index) => ({
    host: `site-${index}.example.com`,
    origin: `https://site-${index}.example.com`,
    visits: MAX_RECOMMENDED_SITES + 2 - index,
    lastVisited: now - index,
  }));
  const sites = recommendedSites(records, [{ url: 'https://www.site-0.example.com/' }], now);
  assert.equal(sites.length, MAX_RECOMMENDED_SITES);
  assert.ok(!sites.some((site) => site.name === 'site-0.example.com'));
  assert.equal(sites[0].url, 'https://site-1.example.com/');
});

test('expires old records, rejects malformed values, and caps persisted host records', () => {
  const now = 1_800_000_000_000;
  const records = Array.from({ length: 120 }, (_, index) => ({
    host: `site-${index}.example.com`,
    origin: `https://site-${index}.example.com`,
    visits: index + 1,
    lastVisited: now - index,
  }));
  records.push({ host: 'old.example.com', origin: 'https://old.example.com', visits: 99, lastVisited: now - SITE_RECORD_TTL_MS - 1 });
  records.push({ host: 'malformed.example.com', origin: 'javascript:alert(1)', visits: 2, lastVisited: now });
  const normalized = normalizeSiteVisits(records, now);
  assert.equal(normalized.length, 100);
  assert.equal(normalized[0].host, 'site-119.example.com');
  assert.ok(!normalized.some((site) => site.host === 'old.example.com' || site.host === 'malformed.example.com'));
});
