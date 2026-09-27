'use strict';

const packageMetadata = require('../../package.json');
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const BUMP_TYPES = new Set(['major', 'minor', 'feature', 'patch']);
const FEATURE_INCREMENT = 10;

function parseVersion(value) {
  const match = String(value ?? '').trim().match(VERSION_PATTERN);
  if (!match) throw new Error('版本号必须是 大版本.小版本.更新号');
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger) || patch > 999) {
    throw new Error('版本号必须使用非负整数，更新号范围为 000-999');
  }
  return { major, minor, patch };
}

function formatVersion(value) {
  const { major, minor, patch } = typeof value === 'object' && value !== null
    ? value
    : parseVersion(value);
  if (![major, minor, patch].every(Number.isSafeInteger) || major < 0 || minor < 0 || patch < 0 || patch > 999) {
    throw new Error('版本号必须使用非负整数，更新号范围为 000-999');
  }
  return `${major}.${minor}.${String(patch).padStart(3, '0')}`;
}

function toNpmVersion(value) {
  const { major, minor, patch } = parseVersion(value);
  return `${major}.${minor}.${patch}`;
}

function bumpVersion(value, type) {
  if (!BUMP_TYPES.has(type)) throw new Error(`未知版本更新类型：${type}`);
  const current = parseVersion(value);
  if (type === 'major') return formatVersion({ major: current.major + 1, minor: 0, patch: 0 });
  if (type === 'minor') return formatVersion({ major: current.major, minor: current.minor + 1, patch: 0 });
  const increment = type === 'feature' ? FEATURE_INCREMENT : 1;
  const patch = current.patch + increment;
  if (patch > 999) throw new Error('更新号已达到 999，请提升小版本或大版本');
  return formatVersion({ major: current.major, minor: current.minor, patch });
}

module.exports = {
  APP_VERSION: formatVersion(packageMetadata.appVersion || packageMetadata.version),
  BUMP_TYPES,
  bumpVersion,
  formatVersion,
  parseVersion,
  toNpmVersion,
};
