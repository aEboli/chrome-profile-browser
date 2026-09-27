const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEST_IDENTITY_HEADER,
  MAX_TEST_IDENTITY_ORIGINS,
  addTestIdentityHeader,
  createTestIdentityId,
  createTestIdentityRequestHandler,
  ensureTestIdentity,
  normalizeTestIdentityOrigin,
  normalizeTestIdentityOrigins,
} = require('../src/main/profile-identity');

test('creates UUID identities and normalizes exact origins', () => {
  const identity = createTestIdentityId();
  assert.match(identity, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(normalizeTestIdentityOrigin('https://example.test:443/'), 'https://example.test');
  assert.deepEqual(
    normalizeTestIdentityOrigins(['https://example.test', 'https://example.test/', 'http://localhost:3000']),
    ['https://example.test', 'http://localhost:3000'],
  );
});

test('backfills legacy profiles without replacing an existing identity', () => {
  const existing = '550e8400-e29b-41d4-a716-446655440000';
  const preserved = ensureTestIdentity({ testIdentityId: existing, testIdentityOrigins: 'https://example.test' });
  assert.equal(preserved.testIdentityId, existing);
  assert.deepEqual(preserved.testIdentityOrigins, ['https://example.test']);

  const migrated = ensureTestIdentity({ name: '旧环境' });
  assert.match(migrated.testIdentityId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(migrated.testIdentityOrigins, []);
});

test('rejects non-origin allowlist entries', () => {
  assert.throws(() => normalizeTestIdentityOrigin('https://example.test/path'), /完整的 HTTP\(S\) 来源/);
  assert.throws(() => normalizeTestIdentityOrigin('*.example.test'), /测试站点来源无效/);
  assert.throws(() => normalizeTestIdentityOrigins(['https://ok.test', 'https://bad.test/path'], { strict: true }), /完整的 HTTP\(S\) 来源/);
  assert.throws(() => normalizeTestIdentityOrigins(Array.from({ length: MAX_TEST_IDENTITY_ORIGINS + 1 }, (_, index) => `https://test-${index}.example`), { strict: true }), /最多支持/);
});

test('adds identity only for an exact allowed origin', () => {
  const identity = '550e8400-e29b-41d4-a716-446655440000';
  const origins = ['https://example.test'];
  const allowed = addTestIdentityHeader({ Accept: 'text/html' }, 'https://example.test/page', identity, origins);
  assert.equal(allowed[TEST_IDENTITY_HEADER], identity);

  const disallowed = addTestIdentityHeader({ Accept: 'text/html', [TEST_IDENTITY_HEADER]: 'old' }, 'https://sub.example.test/page', identity, origins);
  assert.equal(disallowed[TEST_IDENTITY_HEADER], undefined);

  const overwritten = addTestIdentityHeader({ 'x-cpb-test-identity': 'old' }, 'https://example.test', identity, origins);
  assert.deepEqual(Object.keys(overwritten), [TEST_IDENTITY_HEADER]);
  assert.equal(overwritten[TEST_IDENTITY_HEADER], identity);
});

test('does not add identity to preflight requests', () => {
  const identity = '550e8400-e29b-41d4-a716-446655440000';
  const handler = createTestIdentityRequestHandler({
    identityId: identity,
    origins: ['https://example.test'],
  });
  handler({
    method: 'OPTIONS',
    url: 'https://example.test/api',
    requestHeaders: { Origin: 'https://example.test' },
  }, (result) => {
    assert.equal(result.requestHeaders[TEST_IDENTITY_HEADER], undefined);
  });
});
