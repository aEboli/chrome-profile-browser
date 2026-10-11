const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyProfileWindowOpen, classifyProfilePreflightNavigation, isAuthorizationPopupRequest, isBlankWindowUrl } = require('../src/main/profile-window-navigation');

test('explicit Chromium tab dispositions always stay in the profile tab strip', () => {
  assert.deepEqual(classifyProfileWindowOpen({ url: 'https://id.example.com/oauth/authorize', disposition: 'foreground-tab' }), { kind: 'tab', focus: true });
  assert.deepEqual(classifyProfileWindowOpen({ url: 'https://example.com/page', disposition: 'background-tab', features: 'width=700,height=500' }), { kind: 'tab', focus: false });
});

test('normal target blank and sized window.open requests are tabs', () => {
  assert.deepEqual(classifyProfileWindowOpen({ url: 'https://example.com/articles', frameName: '_blank', disposition: 'new-window', features: 'width=780,height=620,noopener,noreferrer' }), { kind: 'tab', focus: true });
  assert.deepEqual(classifyProfileWindowOpen({ url: 'https://example.com/redirect', frameName: 'contentWindow', features: 'width=500,height=700' }), { kind: 'tab', focus: true });
  assert.deepEqual(classifyProfileWindowOpen({ url: 'https://example.com/redirect', features: 'noopener,noreferrer' }), { kind: 'tab', focus: true });
  assert.deepEqual(classifyProfileWindowOpen({ url: 'https://example.com/redirect', frameName: 'popup', features: 'width=500,height=700' }), { kind: 'tab', focus: true });
});

test('extension pages opened by an extension popup are routed into the profile tab strip', () => {
  assert.deepEqual(classifyProfileWindowOpen({
    url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html',
    frameName: '_blank',
    disposition: 'new-window',
  }), { kind: 'tab', focus: true });
});

test('recognizable OAuth and login endpoints remain popup requests', () => {
  assert.equal(classifyProfileWindowOpen({ url: 'https://id.example.com/oauth2/authorize?client_id=demo', disposition: 'new-window' }).kind, 'popup');
  assert.equal(classifyProfileWindowOpen({ url: 'https://accounts.google.com/ServiceLogin', disposition: 'new-window' }).kind, 'popup');
  assert.equal(classifyProfileWindowOpen({ url: 'https://id.example.com/start', frameName: 'oauth_login_popup' }).kind, 'popup');
  assert.equal(classifyProfileWindowOpen({ url: 'https://id.example.com/start', frameName: 'loginPopup' }).kind, 'popup');
  assert.equal(classifyProfileWindowOpen({ url: 'https://example.com/article', frameName: 'authorWindow' }).kind, 'tab');
  assert.equal(classifyProfileWindowOpen({ url: 'https://accounts.google.example.com/article' }).kind, 'tab');
  assert.equal(isAuthorizationPopupRequest({ url: 'about:blank', frameName: 'login-popup' }), true);
});

test('generic blank preflight remains hidden until it can be routed', () => {
  assert.equal(isBlankWindowUrl('about:blank'), true);
  assert.deepEqual(classifyProfileWindowOpen({ url: 'about:blank', frameName: '_blank', features: 'width=800,height=600' }), { kind: 'preflight', focus: false });
  const openDetails = { url: 'about:blank', frameName: '_blank', features: 'width=800,height=600' };
  assert.equal(classifyProfilePreflightNavigation(openDetails, 'about:blank', () => true), 'ignore');
  assert.equal(classifyProfilePreflightNavigation(openDetails, 'https://example.com/redirect', (url) => url.startsWith('https://')), 'tab');
  assert.equal(classifyProfilePreflightNavigation(openDetails, 'https://id.example.com/oauth/authorize', (url) => url.startsWith('https://')), 'popup');
  assert.equal(classifyProfilePreflightNavigation(openDetails, 'data:text/html,hello', () => true), 'deny');
  assert.equal(classifyProfilePreflightNavigation(openDetails, 'file:///C:/temp/page.html', () => true), 'deny');
  assert.equal(classifyProfilePreflightNavigation(openDetails, 'javascript:alert(1)', () => false), 'deny');
});
