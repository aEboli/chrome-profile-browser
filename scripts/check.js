'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sourceDirectories = [path.join(root, 'src'), path.join(root, 'scripts')];

function collectJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectJavaScriptFiles(target));
    else if (entry.isFile() && target.endsWith('.js')) files.push(target);
  }
  return files;
}

const files = sourceDirectories.flatMap(collectJavaScriptFiles).sort();
for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

execFileSync(process.execPath, [path.join(__dirname, 'bump-version.js'), '--check'], { stdio: 'inherit' });
console.log(`语法检查通过：${files.length} 个 JavaScript 文件`);
