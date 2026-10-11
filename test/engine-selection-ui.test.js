'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');

test('engine settings expose an accessible built-in and external mode switch', () => {
  assert.match(html, /role="group" aria-label="新环境默认浏览器引擎"/);
  assert.match(html, /data-engine-mode="electron" aria-pressed="true">内置 Chromium/);
  assert.match(html, /data-engine-mode="external" aria-pressed="false">外部 Chromium/);
  assert.match(styles, /\.engine-mode-option\[aria-pressed="true"\]/);
});

test('mode switching preserves the external path and saves both settings', () => {
  assert.match(renderer, /let enginePathDraft = null/);
  assert.match(renderer, /enginePathDraft = path;[\s\S]*engineModeDraft = "external"/);
  assert.match(renderer, /function setEngineModeDraft\(mode\)/);
  assert.match(renderer, /const engineMode = engineModeDraft \|\|/);
  assert.match(renderer, /invokeApi\("saveSettings", \{ engineMode, enginePath,/);
  assert.match(renderer, /const external = appState\.engine\.mode === "external"/);
  assert.doesNotMatch(renderer, /appState\.engine\.mode === "external" \|\| Boolean\(enginePath\)/);
});

test('profiles choose and display their own engine mode', () => {
  assert.match(html, /id="profile-engine-mode" role="group" aria-label="此环境的启动引擎"/);
  assert.match(html, /data-profile-engine-mode="electron" aria-pressed="true">内置 Chromium/);
  assert.match(html, /data-profile-engine-mode="external" aria-pressed="false">外部 Chromium/);
  assert.match(html, /新环境默认引擎/);
  assert.match(html, /id="engine-discovery-status" role="status" hidden/);
  assert.match(renderer, /profile\?\.engineMode[\s\S]*appState\.engine\.mode/);
  assert.match(renderer, /autoDiscoveredPath: String\(valueOf\(source\.engine, \["autoDiscoveredPath"\]/);
  assert.match(renderer, /自动发现 Google Chrome：\$\{autoPath\}/);
  assert.match(renderer, /未发现 Google Chrome/);
  assert.match(renderer, /external && !pathValue && !appState\.engine\.autoDiscoveredPath/);
  assert.match(renderer, /if \(pathValue\) \{\s*discoveryStatus\.hidden = true/);
  assert.match(renderer, /engineMode,\s*connectionMode/);
  assert.match(renderer, /launch-card-engine launch-card-engine--\$\{engineMode\}/);
  assert.match(renderer, /<button class="launch-card-engine launch-card-engine--\$\{engineMode\}" type="button" data-action="toggle-profile-engine"/);
  assert.match(renderer, /engineSwitchLocked \|\| engineSwitchPending \? " disabled" : ""/);
  assert.match(renderer, /aria-label="当前为\$\{engineLabel\}，\$\{engineSwitchTitle\}"/);
  const toggleBody = renderer.slice(
    renderer.indexOf("async function toggleProfileEngine("),
    renderer.indexOf("async function launchProfileDirect(", renderer.indexOf("async function toggleProfileEngine(")),
  );
  assert.match(toggleBody, /invokeApi\("setProfileEngineMode", \{ profileId, engineMode \}\)/);
  assert.match(toggleBody, /下次启动将使用\$\{engineLabel\}/);
  assert.doesNotMatch(toggleBody, /launchProfileDirect|toggleProfile\(/);
  assert.match(renderer, /case "toggle-profile-engine":\s+void toggleProfileEngine\(id\)/);
  assert.match(renderer, /"profile-engine-mode"\)\s*\{/);
  assert.match(styles, /\.launch-card-engine:focus-visible/);
  assert.match(styles, /\.launch-card-engine:disabled/);
  assert.match(styles, /\.launch-card-engine--electron/);
  assert.match(styles, /\.launch-card-engine--external/);
});
