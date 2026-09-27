'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  bumpVersion,
  formatVersion,
  toNpmVersion,
} = require('../src/main/version');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const readmePath = path.join(root, 'README.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readmeWithVersion(readme, version) {
  const marker = /当前版本为 `[^`]+`/;
  if (!marker.test(readme)) throw new Error('README.md 中未找到当前版本标记');
  return readme.replace(marker, `当前版本为 \`${version}\``);
}

function currentVersion(packageJson) {
  return formatVersion(packageJson.appVersion || packageJson.version);
}

function checkVersions(packageJson, lockJson) {
  const displayVersion = currentVersion(packageJson);
  const npmVersion = toNpmVersion(displayVersion);
  if (packageJson.appVersion !== displayVersion || packageJson.version !== npmVersion) {
    throw new Error(`package.json 版本字段不一致，应为 appVersion=${displayVersion}、version=${npmVersion}`);
  }
  if (lockJson.version !== npmVersion || lockJson.packages?.['']?.version !== npmVersion) {
    throw new Error(`package-lock.json 版本不一致，应为 ${npmVersion}`);
  }
  const readme = fs.readFileSync(readmePath, 'utf8');
  const readmeVersion = readme.match(/当前版本为 `([^`]+)`/)?.[1];
  if (readmeVersion !== displayVersion) throw new Error(`README.md 版本不一致，应为 ${displayVersion}`);
  return displayVersion;
}

function main() {
  const packageJson = readJson(packagePath);
  const lockJson = readJson(lockPath);
  const type = process.argv[2] || '--check';
  if (type === '--check') {
    console.log(`版本校验通过：${checkVersions(packageJson, lockJson)}`);
    return;
  }
  const current = currentVersion(packageJson);
  const next = bumpVersion(current, type);
  const nextReadme = readmeWithVersion(fs.readFileSync(readmePath, 'utf8'), next);
  packageJson.version = toNpmVersion(next);
  packageJson.appVersion = next;
  lockJson.version = packageJson.version;
  if (lockJson.packages?.['']) lockJson.packages[''].version = packageJson.version;
  writeJson(packagePath, packageJson);
  writeJson(lockPath, lockJson);
  fs.writeFileSync(readmePath, nextReadme, 'utf8');
  console.log(`版本已更新：${current} -> ${next}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
