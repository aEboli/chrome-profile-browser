'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const path = require('node:path');

const {
  BRAND_NAME,
  BRAND_DESCRIPTION,
  BRAND_ICON_PATH,
  BRAND_NATIVE_ICON_PATH,
  generateBrandDescription,
} = require('../src/main/brand');

test('uses the requested visible product name', () => {
  assert.equal(BRAND_NAME, '简约指纹');
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(indexHtml, /<title>简约指纹<\/title>/);
  assert.match(indexHtml, /id="brand-name">简约指纹<\/strong>/);
});

test('brand description is generated and limited to 30 Unicode characters', () => {
  assert.ok(BRAND_DESCRIPTION.length > 0);
  assert.ok(Array.from(BRAND_DESCRIPTION).length <= 30);
  assert.equal(generateBrandDescription('Chromium profile 与代理节点工作台'), '浏览器环境与连接节点管理');
  assert.ok(Array.from(generateBrandDescription('x'.repeat(80))).length <= 30);
});

test('shared brand icon is an SVG containing the fingerprint motif and celestial marks', () => {
  assert.equal(path.extname(BRAND_ICON_PATH), '.svg');
  assert.ok(fs.existsSync(BRAND_NATIVE_ICON_PATH));
  assert.ok(['.ico', '.png'].includes(path.extname(BRAND_NATIVE_ICON_PATH)));
  const svg = fs.readFileSync(BRAND_ICON_PATH, 'utf8');
  assert.match(svg, /<svg\b/);
  assert.match(svg, /fingerprint-stroke/);
  assert.match(svg, /id="fingerprint"/);
  assert.match(svg, /id="star"/);
  assert.match(svg, /id="moon"/);
  assert.match(svg, /id="sun"/);
  assert.match(svg, /ffd66e|ffc95f/);
  assert.match(svg, /d9e7ff/);
});

test('renderer pages resolve the shared SVG from the renderer directory', () => {
  const rendererRoot = path.resolve(__dirname, '..', 'src', 'renderer');
  const assetPath = path.resolve(rendererRoot, '..', 'assets', 'brand-icon.svg');
  assert.ok(fs.existsSync(assetPath));
  for (const file of ['index.html', 'browser-shell.html']) {
    const html = fs.readFileSync(path.join(rendererRoot, file), 'utf8');
    assert.match(html, /\.\.\/assets\/brand-icon\.svg/);
  }
});

test('manager theme background layers remain parseable by Chromium', () => {
  const styles = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  assert.match(styles, /body::before\s*\{[^}]*background-image:\s*var\(--theme-background-image\)/s);
  assert.match(styles, /body::after\s*\{[^}]*background-image:\s*radial-gradient/s);
  assert.doesNotMatch(styles, /body::before\s*\{[^}]*calc\(1\s*-\s*var\(--theme-image-opacity\)\)/s);
});
