'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { browserPlatform, checkLatestBrowser, findChromeDownload, trustedUrl } = require('../src/main/browser-updater');

test('maps supported browser platforms to Chrome for Testing names', () => {
  assert.equal(browserPlatform('win32', 'x64'), 'win64');
  assert.equal(browserPlatform('win32', 'arm64'), 'win-arm64');
  assert.equal(browserPlatform('darwin', 'arm64'), 'mac-arm64');
  assert.equal(browserPlatform('linux', 'x64'), 'linux64');
});

test('selects an official stable Chromium download and rejects untrusted URLs', () => {
  const metadata = {
    channels: {
      Stable: {
        version: '140.0.7339.1',
        downloads: {
          chrome: [{ platform: 'win64', url: 'https://storage.googleapis.com/chrome-for-testing-public/140/win64/chrome-win64.zip' }],
        },
      },
    },
  };
  assert.deepEqual(findChromeDownload(metadata, 'win32', 'x64'), {
    version: '140.0.7339.1',
    platform: 'win64',
    url: 'https://storage.googleapis.com/chrome-for-testing-public/140/win64/chrome-win64.zip',
  });
  assert.throws(() => trustedUrl('http://storage.googleapis.com/chrome.zip'), /受信任/);
  assert.throws(() => findChromeDownload({ channels: { Stable: { downloads: { chrome: [] } } } }, 'win32', 'x64'), /未提供/);
});

test('detects a newer stable Chromium release without downloading it', async () => {
  const response = {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => Buffer.from(JSON.stringify({
      channels: {
        Stable: {
          version: '140.0.7339.2',
          downloads: {
            chrome: [{ platform: 'win64', url: 'https://storage.googleapis.com/chrome-for-testing-public/140/win64/chrome-win64.zip' }],
          },
        },
      },
    })),
  };
  const result = await checkLatestBrowser({
    currentVersion: '140.0.7339.1',
    platform: 'win32',
    arch: 'x64',
    fetchImpl: async () => response,
  });
  assert.equal(result.updateAvailable, true);
  assert.equal(result.latestVersion, '140.0.7339.2');
});
