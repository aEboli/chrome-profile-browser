const test = require('node:test');
const assert = require('node:assert/strict');
const packageMetadata = require('../package.json');

const {
  APP_VERSION,
  bumpVersion,
  formatVersion,
  toNpmVersion,
} = require('../src/main/version');

test('formats the product version with a three-digit update number', () => {
  assert.equal(APP_VERSION, packageMetadata.appVersion);
  assert.match(APP_VERSION, /^\d+\.\d+\.\d{3}$/);
  assert.equal(formatVersion('0.1.10'), '0.1.010');
  assert.equal(toNpmVersion('0.1.010'), '0.1.10');
});

test('bumps only the requested version level and resets lower levels', () => {
  assert.equal(bumpVersion('0.1.000', 'patch'), '0.1.001');
  assert.equal(bumpVersion('0.1.000', 'feature'), '0.1.010');
  assert.equal(bumpVersion('0.0.230', 'feature'), '0.0.240');
  assert.equal(bumpVersion('0.6.116', 'minor'), '0.7.000');
  assert.equal(bumpVersion('0.6.116', 'major'), '1.0.000');
});

test('rejects invalid or exhausted update numbers', () => {
  assert.throws(() => bumpVersion('0.1.000', 'unknown'), /未知版本更新类型/);
  assert.throws(() => bumpVersion('0.1.995', 'feature'), /达到 999/);
  assert.throws(() => formatVersion('0.1.1000'), /000-999/);
});
