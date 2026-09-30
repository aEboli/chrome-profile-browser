'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');
const managerHtml = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const browserShellSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.js'), 'utf8');
const browserShellHtml = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.html'), 'utf8');
const browserShellStyles = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.css'), 'utf8');

test('subscription refresh keeps plaintext source and replaces edited node fields', () => {
  assert.match(mainSource, /record\.url = sourceUrl/);
  assert.match(mainSource, /next\.nodes = next\.nodes\.filter\(\(node\) => node\.sourceId !== sourceId\)/);
  assert.doesNotMatch(mainSource, /const oldById = new Map/);
  assert.match(mainSource, /async function updateImportedNode\(/);
});

test('node workbench exposes edit and detail actions', () => {
  assert.match(rendererSource, /data-action="edit-node"/);
  assert.match(rendererSource, /data-action="view-node"/);
  assert.match(rendererSource, /data-node-row/);
  assert.match(rendererSource, /document\.addEventListener\("dblclick"/);
  assert.match(rendererSource, /function renderNodeDetails\(/);
  assert.match(managerHtml, /id="node-details-modal"/);
  assert.match(managerHtml, /id="install-browser"/);
});

test('IP summaries keep natural address width and align metadata group gaps to it', () => {
  assert.match(rendererSource, /function ipSummaryMetadataParts\(details\)[\s\S]*return \[country, source, property\]/);
  assert.match(rendererSource, /function ipSummaryMetadata\(details\)[\s\S]*return ipSummaryMetadataParts\(details\)\.join\("·"\)/);
  assert.match(rendererSource, /function renderIpSummaryMetadata\([\s\S]*const tone = ipSummaryMetadataTone[\s\S]*ip-summary-part[\s\S]*ip-summary-separator/);
  assert.match(rendererSource, /function renderIpSummaryValue\(value, className\)[\s\S]*ip-summary-value/);
  assert.match(rendererSource, /function renderIpSummary\(details, value, metadataClass, valueClass\)[\s\S]*ip-summary-stack/);
  assert.match(rendererSource, /function ipSummaryMetadataTone\(details\)[\s\S]*source\.includes\("广播"\)[\s\S]*property\.includes\("住宅"\)[\s\S]*property\.includes\("机房"\)[\s\S]*source\.includes\("原生"\)/);
  assert.match(rendererSource, /if \(source\.includes\("广播"\)\) return "broadcast";/);
  assert.match(rendererSource, /if \(property\.includes\("住宅"\)\) return "residential";/);
  assert.match(rendererSource, /if \(property\.includes\("机房"\)\) return "datacenter";/);
  assert.match(rendererSource, /if \(source\.includes\("原生"\)\) return "native";/);
  assert.match(rendererSource, /function hasIpSummaryData\(details\)/);
  assert.match(rendererSource, /if \(!node && !hasIpSummaryData\(details\)\) return "系统直连"/);
  assert.match(rendererSource, /function renderProfileIpSummary\([\s\S]*?profile-ip-metadata[\s\S]*?profile-ip-address/);
  assert.match(rendererSource, /const optionCopy = hasDetails[\s\S]*?renderIpSummary\(details, ipAddress, "connection-picker-option-meta", "connection-picker-option-name"\)/);
  assert.match(rendererSource, /table-cell--ip"[\s\S]*?table-cell-ip-meta[\s\S]*?table-cell-ip-value/);
  assert.match(rendererSource, /normalized\.replace\(\/IP\$\/i, ""\)/);
  assert.match(stylesSource, /\.table-cell-ip-meta, \.table-cell-ip-value \{[^}]*text-overflow: ellipsis; white-space: nowrap;/);
  assert.match(stylesSource, /\.ip-summary-stack \{[^}]*width: fit-content;[^}]*max-width: 100%;[^}]*margin-inline: auto;/);
  assert.match(stylesSource, /\.ip-summary-metadata \{[^}]*display: flex;[^}]*justify-content: space-between;[^}]*column-gap: \.3em;/);
  assert.match(stylesSource, /\.ip-summary-value \{[^}]*font-variant-numeric: tabular-nums; text-align: center;/);
  assert.doesNotMatch(stylesSource, /text-align-last: justify|text-justify: inter-character/);
  assert.match(stylesSource, /\.profile-ip-summary \{[^}]*text-align: center;/);
  assert.match(stylesSource, /\.ip-summary-metadata--broadcast \{ color: var\(--red\); \}/);
  assert.match(stylesSource, /\.ip-summary-metadata--datacenter \{ color: var\(--orange\); \}/);
  assert.match(stylesSource, /\.ip-summary-metadata--residential \{ color: var\(--green\); \}/);
  assert.match(stylesSource, /\.profile-ip-metadata \{[^}]*font-size: 10px;/);
  assert.match(stylesSource, /\.connection-picker-option-copy \{[^}]*flex: 1 1 auto;/);
});

test('subscription rows expose edit and persistent ordering controls', () => {
  assert.match(rendererSource, /data-action="edit-subscription"/);
  assert.match(rendererSource, /data-action="move-subscription"/);
  assert.match(rendererSource, /data-subscription-row/);
  assert.match(rendererSource, /reorderSubscriptions/);
  assert.match(mainSource, /handle\('subscription:reorder'/);
  assert.match(mainSource, /parseSubscriptionSortOrder/);
  assert.match(managerHtml, /id="subscription-sort-order"/);
  assert.match(fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8'), /getSubscriptionEdit/);
});

test('unsupported nodes stay in subscription groups while remaining excluded from default selection', () => {
  assert.match(mainSource, /function isUnsupportedNode\(/);
  assert.match(mainSource, /\.filter\(\(node\) => !isUnsupportedNode\(node\)\)/);
  assert.match(mainSource, /availableNodeCount/);
  assert.match(mainSource, /unsupportedNodeCount/);
  assert.match(rendererSource, /function isVisibleNode\(/);
  assert.match(rendererSource, /node\.sourceId === subscriptionId/);
  assert.match(rendererSource, /subscription-unsupported-count/);
  assert.doesNotMatch(rendererSource, /class="subscription-order"/);
});

test('node form keeps its reference across async saves', () => {
  assert.match(rendererSource, /async function saveNode\(event\) \{[\s\S]*const form = event\.currentTarget;[\s\S]*const data = new FormData\(form\)/);
  assert.match(rendererSource, /form\.reset\(\);/);
  assert.doesNotMatch(rendererSource, /event\.currentTarget\.reset\(\)/);
});

test('profile editor locks stop-required fields at runtime and preserves their values', () => {
  for (const id of ['profile-node', 'profile-test-origins', 'profile-notes']) {
    assert.match(managerHtml, new RegExp(`<div class="profile-config-field" data-profile-lock-field>[\\s\\S]{0,400}id="${id}"[\\s\\S]{0,400}data-action="profile-config-locked"`));
  }
  assert.match(rendererSource, /const PROFILE_CONFIG_LOCKED_STATUSES = new Set\([\s\S]*"starting", "stopping", "switching", "saving"/);
  assert.match(rendererSource, /function syncProfileConfigLock\(\)[\s\S]*field\.disabled = locked[\s\S]*trigger\.hidden = !locked/);
  assert.match(rendererSource, /const nodeId = \$\("#profile-node"\)\.value/);
  assert.match(rendererSource, /const testIdentityOrigins = \$\("#profile-test-origins"\)\.value/);
  assert.match(rendererSource, /case "profile-config-locked":[\s\S]*showToast\("请先停止环境，再修改此项", "warn"\)/);
  assert.match(stylesSource, /\.profile-config-field\.is-locked/);
  assert.match(managerHtml, /id="profile-name" name="name"/);
  assert.match(managerHtml, /id="profile-homepage" name="homepage"/);
});

test('node editor exposes stored proxy credentials for correction', () => {
  assert.match(mainSource, /username: username \|\| ''/);
  assert.match(mainSource, /password: password \|\| ''/);
  assert.match(rendererSource, /node-username"\)\.value = node\?\.username \|\| ""/);
  assert.match(rendererSource, /node-password"\)\.value = node\?\.password \|\| ""/);
  assert.match(managerHtml, /id="node-password"[^>]+type="text"/);
});

test('environment rows expose a check for the currently selected connection', () => {
  assert.match(rendererSource, /data-action="check-profile-connection"/);
  assert.match(rendererSource, /测试当前节点/);
  assert.match(rendererSource, /checkProfileConnection/);
  assert.match(rendererSource, /data-action="check-profile-connection"[\s\S]*?\$\{icon\("zap"\)\}/);
  assert.match(mainSource, /handle\('profile:check-connection'/);
  assert.match(mainSource, /async function checkProfileConnection\(/);
  assert.match(fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8'), /checkProfileConnection/);
});

test('test actions use the lightning icon', () => {
  assert.match(rendererSource, /data-action="check-node"[\s\S]*?\$\{icon\("zap"\)\}/);
  assert.match(managerHtml, /id="batch-check-nodes"[\s\S]*?#icon-zap/);
  assert.match(managerHtml, /id="icon-zap"/);
});

test('action icons match their visible descriptions', () => {
  assert.match(managerHtml, /data-action="import-subscription"[\s\S]*?#icon-cloud/);
  assert.match(managerHtml, /id="theme-upload-button"[\s\S]*?#icon-upload/);
  assert.match(managerHtml, /id="choose-extension"[\s\S]*?#icon-folder/);
  assert.match(managerHtml, /id="icon-settings"[^>]*>[\s\S]*?circle cx="12" cy="12" r="3"/);
  const browserShell = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.html'), 'utf8');
  assert.match(browserShell, /id="agent-toggle"[\s\S]*?#shell-icon-ai/);
  assert.doesNotMatch(browserShell, /data-agent-action="page"/);
});

test('agent configuration has its own compact page and model connectivity actions', () => {
  assert.match(managerHtml, /data-view="agent"/);
  assert.match(managerHtml, /class="panel agent-environment-panel"/);
  assert.match(managerHtml, /id="agent-environment-list"/);
  assert.match(managerHtml, /id="test-agent-connection"[^>]+aria-label="测试连通性"/);
  assert.match(managerHtml, /id="manager-agent-model-options"/);
  assert.match(managerHtml, /id="manager-jev-enabled"[^>]+type="checkbox"/);
  assert.doesNotMatch(managerHtml, /id="agent-management-heading"/);
  assert.match(rendererSource, /function renderAgentEnvironmentManagement\(/);
  assert.match(rendererSource, /agent-environment-target/);
  assert.match(rendererSource, /fetchAgentModels\(/);
  assert.match(rendererSource, /testAgentConnection\(/);
  assert.match(rendererSource, /jevAutoJudgeEnabled: elements\.jevAutoJudgeEnabled\?\.checked === true/);
  assert.match(mainSource, /handle\('agent:fetch-models'/);
  assert.match(mainSource, /handle\('agent:test-connection'/);
  assert.match(fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8'), /fetchAgentModels/);
});

test('browser Agent inherits the active profile and exposes model and reasoning pickers', () => {
  assert.match(browserShellHtml, /id="agent-setting-model-refresh"/);
  assert.match(browserShellHtml, /id="agent-setting-model-options"/);
  assert.match(browserShellHtml, /id="agent-reasoning-options"/);
  assert.match(browserShellHtml, /agent-model-picker-columns/);
  assert.match(browserShellSource, /function renderAgentReasoningOptions\(/);
  assert.match(browserShellSource, /function selectAgentReasoning\(/);
  assert.match(browserShellSource, /saveSettings\(\{ agentOnly: true, agentReasoningEffort: effort \}\)/);
  assert.match(browserShellSource, /agentSettingModelRefresh\?\.addEventListener\('click'/);
  assert.match(browserShellSource, /agentModelInput\?\.addEventListener\('focus'/);
  assert.match(browserShellSource, /setAgentSettingModelStatus\(/);
  assert.match(browserShellSource, /function setAgentOpen\(open\) \{[\s\S]*void refreshBrowserSettings\(\)/);
  assert.match(browserShellSource, /exposeBrowserAgent\(\);\s*void refreshBrowserSettings\(\);/);
  assert.match(browserShellStyles, /\.agent-model-picker-columns \{[\s\S]*grid-template-columns/);
});

test('profile launcher is the default entry and keeps direct launch/configuration actions', () => {
  assert.match(rendererSource, /activeView: "launchpad"/);
  assert.match(rendererSource, /function renderLaunchpad\(/);
  assert.match(rendererSource, /async function launchProfileDirect\(/);
  assert.match(rendererSource, /case "launch-profile":\s+void launchProfileDirect\(id\)/);
  assert.match(rendererSource, /data-action="launch-profile"/);
  assert.match(rendererSource, /data-action="new-profile"/);
  assert.match(rendererSource, /data-view-target="settings"/);
  assert.match(managerHtml, /data-view="launchpad"/);
  assert.match(managerHtml, /id="launchpad-profiles"/);
  assert.match(managerHtml, /id="launchpad-summary"/);
});

test('profile launcher exposes the existing connection picker and latency without nesting buttons', () => {
  assert.match(rendererSource, /<article class="launch-card launch-card--profile">[\s\S]*?<button class="launch-card-open"[^>]+data-action="launch-profile"/);
  assert.match(rendererSource, /launch-card-connection">\$\{renderProfileConnectionPicker\(profile, "launchpad"\)\}/);
  assert.match(rendererSource, /connection-options-\$\{view\}-\$\{profile\.id\}/);
  assert.match(rendererSource, /\[data-view="\$\{appState\.activeView\}"\] \[data-connection-picker\]/);
  assert.match(rendererSource, /profile-connection-health-row">\$\{renderConnectionHealth\(health\)\}/);
  assert.match(rendererSource, /await invokeApi\("switchProfileNode", \{ profileId, nodeId \}\)/);
});

test('open connection picker keeps launcher cards in the viewport coordinate system', () => {
  assert.match(stylesSource, /\.launch-card:has\(\.profile-connection-picker\.is-open\), \.launch-card:has\(\.profile-connection-picker\.is-open\):hover \{ transform: none; \}/);
  assert.match(rendererSource, /const viewportPadding = 12;/);
  assert.match(rendererSource, /const triggerGap = 6;/);
});

test('proxy browser contents apply the WebRTC IP policy to every webview guest', () => {
  assert.match(mainSource, /contents\.setWebRTCIPHandlingPolicy\(hasProxy \? 'disable_non_proxied_udp' : 'default'\)/);
  assert.match(mainSource, /setWebRtcIpHandlingPolicy\(guestContents, Boolean\(node\)\)/);
  assert.doesNotMatch(mainSource, /ses\.setWebRTCIPHandlingPolicy/);
  assert.match(fs.readFileSync(path.join(root, 'src', 'main', 'engine-runtime.js'), 'utf8'), /force-webrtc-ip-handling-policy=disable_non_proxied_udp/);
});
