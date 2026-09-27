const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deletePasswordEntry,
  getPasswordEntry,
  publicPasswordEntry,
  requirePasswordProfile,
  savePasswordEntry,
} = require('../src/main/password-vault');

test('password entries persist encrypted secrets and expose metadata only', () => {
  const entries = savePasswordEntry([], {
    service: 'Example',
    account: 'user@example.com',
    website: 'https://example.com/login',
    notes: 'Primary account',
    password: 'secret-value',
  }, {
    profileId: 'profile-1',
    makeId: () => 'password-1',
    protectSecret: (value) => `enc:${Buffer.from(value).toString('base64')}`,
    now: () => '2026-09-25T00:00:00.000Z',
  });

  assert.equal(entries[0].password, 'enc:c2VjcmV0LXZhbHVl');
  assert.deepEqual(publicPasswordEntry(entries[0]), {
    id: 'password-1',
    profileId: 'profile-1',
    service: 'Example',
    account: 'user@example.com',
    website: 'https://example.com/login',
    notes: 'Primary account',
    updatedAt: '2026-09-25T00:00:00.000Z',
  });
  assert.equal(getPasswordEntry(entries, 'profile-1', 'password-1', (value) => Buffer.from(value.slice(4), 'base64').toString()), 'secret-value');
});

test('editing an entry with an empty password preserves the stored secret', () => {
  const original = {
    id: 'password-1',
    profileId: 'profile-1',
    service: 'Example',
    account: 'old-account',
    password: 'enc:existing',
    updatedAt: '2026-09-24T00:00:00.000Z',
  };
  const entries = savePasswordEntry([original], {
    id: 'password-1',
    service: 'Example Login',
    account: 'new-account',
    password: '',
  }, {
    profileId: 'profile-1',
    makeId: () => 'unused',
    protectSecret: () => assert.fail('empty password must not be re-encrypted'),
  });
  assert.equal(entries[0].password, 'enc:existing');
  assert.equal(entries[0].account, 'new-account');
});

test('password entry validation rejects missing credentials and unsafe URLs', () => {
  const options = { profileId: 'profile-1', makeId: () => 'password-1', protectSecret: (value) => value };
  assert.throws(() => savePasswordEntry([], { service: 'Example', account: 'user' }, options), /密码不能为空/);
  assert.throws(() => savePasswordEntry([], {
    service: 'Example', account: 'user', password: 'secret', website: 'javascript:alert(1)',
  }, options), /HTTP 或 HTTPS/);
});

test('password entry deletion removes the record', () => {
  assert.deepEqual(deletePasswordEntry([{ id: 'password-1', profileId: 'profile-1' }], 'profile-1', 'password-1'), []);
  assert.throws(() => deletePasswordEntry([], 'profile-1', 'missing'), /密码记录不存在/);
});

test('password entries cannot be read, edited, or deleted through another environment', () => {
  const entry = { id: 'password-1', profileId: 'profile-1', service: 'Example', account: 'user', password: 'enc:secret' };
  assert.throws(() => savePasswordEntry([entry], {
    id: 'password-1', service: 'Example', account: 'other', password: '',
  }, {
    profileId: 'profile-2', makeId: () => 'unused', protectSecret: (value) => value,
  }), /不属于所选浏览器环境/);
  assert.throws(() => getPasswordEntry([entry], 'profile-2', 'password-1', (value) => value), /密码记录不存在/);
  assert.throws(() => deletePasswordEntry([entry], 'profile-2', 'password-1'), /密码记录不存在/);
});

test('password operations require an existing browser environment', () => {
  assert.equal(requirePasswordProfile([{ id: 'profile-1' }], 'profile-1'), 'profile-1');
  assert.throws(() => requirePasswordProfile([{ id: 'profile-1' }], 'profile-2'), /浏览器环境不存在/);
  assert.throws(() => savePasswordEntry([], { service: 'Example', account: 'user', password: 'secret' }, {
    makeId: () => 'password-1', protectSecret: (value) => value,
  }), /环境编号不能为空/);
});
