'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeCore, platformDirectory } = require('../src/main/core-registry');

test('normalizes bundled core names and platform directories', () => {
  assert.equal(normalizeCore('sing-box'), 'singbox');
  assert.equal(normalizeCore('singbox'), 'singbox');
  assert.equal(platformDirectory('win32', 'x64'), 'win32-x64');
  assert.equal(platformDirectory('darwin', 'arm64'), 'darwin-arm64');
});
