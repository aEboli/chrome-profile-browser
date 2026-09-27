const test = require('node:test');
const assert = require('node:assert/strict');
const {
  endpointForIp,
  isPublicIp,
  lookupIpCountry,
  normalizeIp,
} = require('../src/main/ip-geo');

test('normalizes common socket IP forms and builds a safe lookup endpoint', () => {
  assert.equal(normalizeIp('[2001:db8::1%eth0]'), '2001:db8::1');
  assert.equal(normalizeIp('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(normalizeIp('1.2.3.4:443'), '1.2.3.4');
  assert.equal(endpointForIp('1.2.3.4'), 'https://ipwho.is/1.2.3.4');
});

test('only public IP addresses are eligible for country lookup', () => {
  assert.equal(isPublicIp('10.0.0.1'), false);
  assert.equal(isPublicIp('192.168.1.1'), false);
  assert.equal(isPublicIp('127.0.0.1'), false);
  assert.equal(isPublicIp('1.1.1.1'), true);
});

test('parses an ipwho.is country response without exposing the response object', async () => {
  let requestedUrl = '';
  const result = await lookupIpCountry('1.1.1.1', {
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.headers.accept, 'application/json');
      return {
        ok: true,
        text: async () => JSON.stringify({ success: true, country: 'Australia', country_code: 'AU', ip: '1.1.1.1' }),
      };
    },
  });
  assert.equal(requestedUrl, 'https://ipwho.is/1.1.1.1');
  assert.deepEqual(result, { ip: '1.1.1.1', country: 'Australia', countryCode: 'AU' });
});

test('skips private addresses and returns null on timeout', async () => {
  let calls = 0;
  assert.equal(await lookupIpCountry('192.168.0.2', { fetchImpl: async () => { calls += 1; } }), null);
  assert.equal(calls, 0);
  const result = await lookupIpCountry('1.1.1.1', {
    timeoutMs: 10,
    fetchImpl: () => new Promise(() => {}),
  });
  assert.equal(result, null);
});
