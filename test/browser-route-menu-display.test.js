'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
const shellSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.js'), 'utf8');
const shellStyles = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.css'), 'utf8');

test('manual route node rows show exit IP, metadata and latency while retaining route identity', () => {
  assert.match(mainSource, /ipAddress: nodeIp\(node\)/);
  assert.match(mainSource, /country: countryName\(node\.countryCode \|\| node\.country \|\| node\.countryName\)[\s\S]*?'未查询'/);
  assert.match(mainSource, /ipSource: safeText\(node\.ipSource \|\| node\.ipSourceLabel\)/);
  assert.match(mainSource, /ipProperty: safeText\(node\.ipProperty \|\| node\.ipPropertyLabel\)/);
  assert.match(mainSource, /latency: latency === '未测' \? statusLabel : latency/);
  assert.match(shellSource, /function compactRouteMetadata\(value\)[\s\S]*?replace\(\/IP\$\/i, ''\)/);
  assert.match(shellSource, /const metadataValues = \[option\.country \|\| '未查询', compactRouteMetadata\(option\.ipSource\), compactRouteMetadata\(option\.ipProperty\)\]/);
  assert.match(shellSource, /metadataTone = option\.ipSource\?\.includes\('广播'\)[\s\S]*?option\.ipProperty\?\.includes\('住宅'\)[\s\S]*?option\.ipProperty\?\.includes\('机房'\)/);
  assert.match(shellSource, /const latencyLabel = \/ms\$\/i\.test\(latencyText\) \? latencyText : `延迟：\$\{latencyText\}`/);
  assert.match(shellSource, /connection-route-option-name[^`]*\$\{escapeHtml\(ipAddressText\)\}[^`]*connection-route-option-meta[^`]*metadataValues[^`]*connection-route-option-latency[^`]*\$\{escapeHtml\(latencyLabel\)\}/);
  assert.match(shellSource, /aria-label="\$\{accessibleLabel\}"[^>]*title="\$\{escapeHtml\(\[labelText, metaText\]/);
  assert.match(shellSource, /data-node-id="\$\{nodeId\}"/);
  assert.match(shellStyles, /\.connection-route-menu \{[^}]*border-radius: 10px/);
  assert.match(shellStyles, /\.connection-route-menu-heading \{[^}]*position: sticky/);
  assert.match(shellStyles, /\.connection-route-group-label \{[^}]*letter-spacing: \.025em/);
  assert.match(shellStyles, /\.connection-route-option--node \{[^}]*min-height: 79px;/);
  assert.match(shellStyles, /\.connection-route-option-meta--broadcast \{[^}]*color:/);
  assert.match(shellStyles, /\.connection-route-option-meta--datacenter \{[^}]*color:/);
  assert.match(shellStyles, /\.connection-route-option-meta--residential \{[^}]*color:/);
  assert.match(shellStyles, /\.connection-route-option-meta--native \{[^}]*color:/);
  assert.match(shellStyles, /\.connection-route-option-latency \{/);
});
