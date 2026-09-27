const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  addTraffic,
  headerBytes,
  normalizeTraffic,
  uploadBytes,
} = require('../src/main/traffic-meter');

test('traffic meter normalizes counters and derives total bytes', () => {
  assert.deepEqual(normalizeTraffic({ uploadedBytes: '12', downloadedBytes: 30 }), {
    uploadedBytes: 12,
    downloadedBytes: 30,
    totalBytes: 42,
    requestCount: 0,
    lastUpdatedAt: '',
  });
  assert.equal(normalizeTraffic({ uploadedBytes: -1, downloadedBytes: 'invalid' }).totalBytes, 0);
});

test('traffic meter counts request bodies and response content length', () => {
  assert.equal(uploadBytes([{ bytes: Buffer.from('hello') }, { bytes: '世界' }]), 11);
  assert.equal(headerBytes({ 'Content-Length': ['2048'] }), 2048);
  assert.equal(headerBytes({ 'x-content-length': ['2048'] }), 0);
  const next = addTraffic({ uploadedBytes: 2, downloadedBytes: 3 }, 5, 7);
  assert.deepEqual({ ...next, lastUpdatedAt: '' }, {
    uploadedBytes: 7,
    downloadedBytes: 10,
    totalBytes: 17,
    requestCount: 1,
    lastUpdatedAt: '',
  });
  assert.ok(next.lastUpdatedAt);
});
