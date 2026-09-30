const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const html = read('src', 'renderer', 'index.html');
const renderer = read('src', 'renderer', 'renderer.js');
const main = read('src', 'main', 'main.js');
const vault = read('src', 'main', 'password-vault.js');
const browserShell = read('src', 'renderer', 'browser-shell.js');
const shellStyles = read('src', 'renderer', 'browser-shell.css');
const passwordPreload = read('src', 'main', 'browser-password-preload.js');
const managerStyles = read('src', 'renderer', 'styles.css');
const { isPasswordBookField } = require('../src/main/browser-password-preload');

test('password suggestions only trigger for credential-like fields', () => {
  assert.equal(isPasswordBookField({ type: 'text', name: 'productName', placeholder: '商品名称' }), false);
  assert.equal(isPasswordBookField({ type: 'text', name: 'name', id: 'displayName' }), false);
  assert.equal(isPasswordBookField({ type: 'password', name: 'secret' }), true);
  assert.equal(isPasswordBookField({ type: 'text', autocomplete: 'username' }), true);
  assert.equal(isPasswordBookField({ type: 'text', name: 'loginName' }), true);
  assert.equal(isPasswordBookField({ type: 'text', placeholder: '请输入邮箱' }), true);
  assert.equal(isPasswordBookField({ type: 'email', name: 'contact' }), true);
});

test('password book view exposes entry editing and a masked password field', () => {
  assert.match(html, /data-view-target="passwords"/);
  assert.match(html, /data-view="passwords"/);
  assert.match(html, /id="password-environment"/);
  assert.match(html, /id="password-entry-form"/);
  assert.match(html, /id="password-entry-password"[^>]*type="password"[^>]*required/);
  assert.match(html, /data-action="new-password-entry"/);
  assert.match(renderer, /data-action="edit-password-entry"/);
  assert.match(renderer, /data-action="delete-password-entry"/);
  assert.match(renderer, /entry\.profileId === appState\.passwordProfileId/);
  assert.match(renderer, /type="password" readonly placeholder="••••••••"/);
});

test('password display reveals on hover or focus and clears when neither applies', () => {
  assert.match(renderer, /document\.addEventListener\("pointerover"/);
  assert.match(renderer, /document\.addEventListener\("pointerout"/);
  assert.match(renderer, /document\.addEventListener\("focusin"/);
  assert.match(renderer, /invokeApi\("revealPasswordEntry", \{[\s\S]*?profileId: field\.dataset\.passwordProfileId,[\s\S]*?entryId: field\.dataset\.passwordEntryId/);
  assert.match(renderer, /field\.type = "text";\s+field\.value = result\.password;/);
  assert.match(renderer, /field\.textContent = result\.password;\s+field\.dataset\.passwordVisible = "true";/);
  assert.match(renderer, /field\.matches\(":hover"\) && document\.activeElement !== field/);
  assert.match(renderer, /document\.addEventListener\("focusout"/);
  assert.match(renderer, /document\.activeElement !== field\) concealPasswordField\(field\)/);
  assert.match(renderer, /field\.type = "password";\s+field\.value = "";/);
  assert.match(renderer, /field\.textContent = "••••••••";\s+delete field\.dataset\.passwordVisible;/);
  const listRenderer = renderer.slice(renderer.indexOf('function renderPasswordEntries()'), renderer.indexOf('function agentProtocolOptions()'));
  assert.doesNotMatch(listRenderer, /entry\.password/);
  assert.match(listRenderer, /type="password" readonly placeholder="••••••••"/);
  assert.match(listRenderer, /title="悬停或聚焦查看密码"/);
});

test('password records are grouped by website and expand to the existing account controls', () => {
  const listRenderer = renderer.slice(renderer.indexOf('function renderPasswordEntries()'), renderer.indexOf('function agentProtocolOptions()'));
  assert.match(html, /toolbar-actions password-toolbar-actions/);
  assert.match(listRenderer, /new URL\(String\(entry\.website \|\| ""\)\)/);
  assert.match(listRenderer, /url\.origin/);
  assert.match(listRenderer, /<details class="password-site-group"/);
  assert.match(listRenderer, /<summary class="password-site-summary">/);
  assert.match(listRenderer, /group\.entries\.map\(renderEntry\)/);
  assert.match(managerStyles, /\.password-toolbar-actions \{ display: grid;[\s\S]*grid-template-columns: minmax\(126px, 190px\)/);
  assert.match(managerStyles, /@media \(max-width: 440px\)[\s\S]*password-toolbar-actions/);
});

test('collapsed website rows preview the first account, masked password, and account count', () => {
  const listRenderer = renderer.slice(renderer.indexOf('function renderPasswordEntries()'), renderer.indexOf('function agentProtocolOptions()'));
  assert.match(listRenderer, /const preview = group\.entries\[0\]/);
  assert.match(listRenderer, /password-site-field password-site-account[\s\S]*preview\.account/);
  assert.match(listRenderer, /class="password-site-secret password-secret-field" role="textbox" aria-readonly="true" tabindex="0"/);
  assert.match(listRenderer, /title="悬停或聚焦查看密码" aria-label="\$\{escapeHtml\(preview\.service\)\} 密码，悬停或聚焦查看">••••••••<\/span>/);
  assert.match(listRenderer, /data-password-entry-id="\$\{escapeHtml\(preview\.id\)\}"/);
  assert.match(listRenderer, /password-site-count-value[\s\S]*\$\{group\.entries\.length\} 个账号/);
  assert.match(renderer, /document\.addEventListener\("click", \(event\) => \{\s+if \(event\.target\.closest\?\.\("\.password-site-secret"\)\) event\.preventDefault\(\);/);
  assert.match(managerStyles, /\.password-site-summary \{[^\n]*grid-template-columns: 28px minmax\(220px, 1\.2fr\)/);
  assert.match(managerStyles, /@media \(max-width: 640px\)[\s\S]*password-site-secret/);
});

test('duplicate website accounts prompt to update and use the existing record', () => {
  const saveBrowserPassword = main.slice(main.indexOf('function saveBrowserPassword'), main.indexOf('function publicResult'));
  assert.match(browserShell, /async function showPasswordSavePrompt/);
  assert.match(browserShell, /getPasswordSuggestions\?\.\(\{ url: website \}\)/);
  assert.match(browserShell, /prompt\.isUpdate = result\?\.ok === true[\s\S]*entry\?\.account === account/);
  assert.match(browserShell, /heading\.textContent = prompt\.isUpdate \? '更新已保存的密码？'/);
  assert.match(browserShell, /yes\.textContent = prompt\.isUpdate \? '更新' : '保存'/);
  assert.match(browserShell, /setAttribute\('aria-label', prompt\.isUpdate \? '更新密码' : '保存登录信息'\)/);
  assert.match(browserShell, /setShellStatus\(created \? '密码已保存' : '密码已更新'/);
  assert.match(saveBrowserPassword, /entry\?\.profileId === profileKey[\s\S]*entry\?\.account === account[\s\S]*passwordWebsiteOrigin\(entry\.website\) === origin/);
  assert.match(saveBrowserPassword, /id: existing\?\.id \|\| ''/);
  assert.match(shellStyles, /\.password-vault-prompt \{[^\n]*var\(--shell-primary/);
  assert.match(passwordPreload, /background: #142337/);
  assert.match(passwordPreload, /popup\.style\.width = `\$\{width\}px`/);
});

test('public password records omit secrets and reveal through a separate IPC', () => {
  assert.match(main, /passwordEntries: state\.passwordEntries[\s\S]*?\.map\(publicPasswordEntry\)/);
  assert.match(main, /\.filter\(\(entry\) => passwordProfileIds\.has\(entry\?\.profileId\)\)/);
  assert.match(main, /handle\('password:reveal'/);
  assert.match(main, /requirePasswordProfile\(store\.get\(\)\.profiles, entryId\?\.profileId\)/);
  assert.match(main, /next\.passwordEntries = next\.passwordEntries\.filter\(\(entry\) => entry\.profileId !== idValue\)/);
  assert.match(vault, /function publicPasswordEntry\(entry\)/);
  const publicRecord = vault.slice(vault.indexOf('function publicPasswordEntry'), vault.indexOf('function savePasswordEntry'));
  assert.doesNotMatch(publicRecord, /password:/);
});
