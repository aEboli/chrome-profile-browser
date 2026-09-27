'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  isOfficialStoreUrl,
  normalizeOfficialExtensionId,
  officialExtensionDetailUrl,
  officialExtensionSearchUrl,
  getOfficialExtensionStoreDetail,
  parseOfficialStoreDetailHtml,
  parseOfficialStoreSearchHtml,
  searchOfficialExtensionStore,
} = require('../src/main/official-extension-store');

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const SECOND_EXTENSION_ID = 'bbbbbbbbbbbbbbbbcccccccccccccccc';

test('accepts only official HTTPS Chrome Web Store hosts', () => {
  assert.equal(isOfficialStoreUrl('https://chromewebstore.google.com/search/adblock'), true);
  assert.equal(isOfficialStoreUrl('https://chrome.google.com/webstore/detail/example'), true);
  assert.equal(isOfficialStoreUrl('http://chromewebstore.google.com/search/adblock'), false);
  assert.equal(isOfficialStoreUrl('https://not-chromewebstore.google.com/search/adblock'), false);
  assert.equal(isOfficialStoreUrl('https://chromewebstore.google.com.evil.test/search/adblock'), false);
  assert.equal(isOfficialStoreUrl('https://user:pass@chromewebstore.google.com/search/adblock'), false);
});

test('normalizes current and legacy Chrome Web Store detail URLs', () => {
  assert.equal(normalizeOfficialExtensionId(EXTENSION_ID.toUpperCase()), EXTENSION_ID);
  assert.equal(
    normalizeOfficialExtensionId(`https://chromewebstore.google.com/detail/demo-extension/${EXTENSION_ID}?hl=en`),
    EXTENSION_ID,
  );
  assert.equal(
    normalizeOfficialExtensionId(`https://chrome.google.com/webstore/detail/demo-extension/${EXTENSION_ID}`),
    EXTENSION_ID,
  );
  assert.equal(normalizeOfficialExtensionId('https://chromewebstore.google.com/search/' + EXTENSION_ID), '');
  assert.equal(normalizeOfficialExtensionId('https://example.test/detail/' + EXTENSION_ID), '');
  assert.equal(normalizeOfficialExtensionId('not-an-extension-id'), '');
});

test('builds bounded official search and detail URLs', () => {
  assert.equal(
    officialExtensionDetailUrl(EXTENSION_ID.toUpperCase()),
    `https://chromewebstore.google.com/detail/${EXTENSION_ID}`,
  );
  assert.equal(officialExtensionDetailUrl('invalid'), '');
  assert.equal(officialExtensionSearchUrl(' ad blocker '), 'https://chromewebstore.google.com/search/ad%20blocker');
  assert.equal(officialExtensionSearchUrl(''), '');
  assert.equal(officialExtensionSearchUrl('x'.repeat(200)).length <= 220, true);
});

test('extracts official search results from explicit detail links and IDs', () => {
  const html = `
    <a href="https://chromewebstore.google.com/detail/demo-extension/${EXTENSION_ID}">Demo Extension</a>
    <a href="/webstore/detail/another-extension/${SECOND_EXTENSION_ID}">Another Extension</a>
    <script>({ id: "${EXTENSION_ID}", name: "Demo Extension", shortDescription: "Blocks ads" })</script>
    <p>unrelated text ${'ccccccccccccccccdddddddddddddddd'}</p>
  `;
  const results = parseOfficialStoreSearchHtml(html, 'demo');
  assert.deepEqual(results.map((item) => item.id), [EXTENSION_ID, SECOND_EXTENSION_ID]);
  assert.equal(results[0].sourceType, 'chrome-web-store');
  assert.equal(results[0].sourceUrl, officialExtensionDetailUrl(EXTENSION_ID));
  assert.equal(results[0].name, 'Demo Extension');
  assert.equal(results[0].description, 'Blocks ads');
  assert.deepEqual(parseOfficialStoreSearchHtml('<html><body>no store results</body></html>'), []);
});

test('extracts detail metadata without confusing minimum Chrome version for extension version', () => {
  const html = `
    <html>
      <head>
        <meta property="og:title" content="Demo Extension - Chrome Web Store">
        <meta property="og:description" content="Blocks ads &amp; trackers">
        <meta property="og:image" content="https://lh3.googleusercontent.com/demo.png">
      </head>
      <body>
        <script type="application/ld+json">
          {"name":"Demo Extension","description":"Blocks ads and trackers"}
        </script>
        <script>({ id: "${EXTENSION_ID}", name: "Demo Extension", version: "3.4.5", minimum_chrome_version: "127.0", manifestVersion: 3 })</script>
      </body>
    </html>
  `;
  const detail = parseOfficialStoreDetailHtml(html, `https://chromewebstore.google.com/detail/demo/${EXTENSION_ID}`);
  assert.equal(detail.id, EXTENSION_ID);
  assert.equal(detail.name, 'Demo Extension');
  assert.equal(detail.description, 'Blocks ads & trackers');
  assert.equal(detail.version, '3.4.5');
  assert.equal(detail.manifestVersion, 3);
  assert.equal(detail.image, 'https://lh3.googleusercontent.com/demo.png');
  assert.equal(detail.officialUrl, officialExtensionDetailUrl(EXTENSION_ID));
});

test('rejects a detail page that does not contain the requested extension', () => {
  assert.throws(
    () => parseOfficialStoreDetailHtml('<html><title>Not a store page</title></html>', EXTENSION_ID),
    /未返回匹配的插件详情/,
  );
});

test('uses the injected request transport for official search and detail requests', async () => {
  const requests = [];
  const html = `<a href="https://chromewebstore.google.com/detail/demo/${EXTENSION_ID}">Demo</a><script>({id:"${EXTENSION_ID}",name:"Demo",version:"1.0"})</script>`;
  const requestFetch = async (url) => {
    requests.push(String(url));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => Buffer.from(html),
    };
  };

  const search = await searchOfficialExtensionStore({ keyword: 'demo' }, requestFetch);
  const detail = await getOfficialExtensionStoreDetail(EXTENSION_ID, requestFetch);
  assert.equal(search.extensions[0].id, EXTENSION_ID);
  assert.equal(detail.name, 'Demo');
  assert.match(requests[0], /chromewebstore\.google\.com\/search\/demo/);
  assert.match(requests[1], new RegExp(`/detail/${EXTENSION_ID}`));
});
