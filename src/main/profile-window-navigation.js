const AUTH_WINDOW_NAME_TOKENS = new Set(['oauth', 'oauth2', 'authorize', 'authorization', 'auth', 'login', 'signin', 'sso']);
const AUTH_WINDOW_NAME_PAIRS = new Set(['log in', 'sign in']);
const AUTH_PATH_SEGMENTS = new Set(['oauth', 'oauth2', 'authorize', 'authorization', 'auth', 'login', 'log-in', 'signin', 'sign-in', 'sso', 'saml']);
const AUTH_HOSTS = new Set(['accounts.google.com', 'login.microsoftonline.com', 'login.live.com']);

function isBlankWindowUrl(value) {
  const url = String(value || '').trim().toLowerCase();
  return !url || url === 'about:blank';
}

function isAuthorizationWindowName(value) {
  const tokens = String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
  return tokens.some((token, index) => AUTH_WINDOW_NAME_TOKENS.has(token)
    || AUTH_WINDOW_NAME_PAIRS.has(`${token} ${tokens[index + 1] || ''}`));
}

function isAuthorizationPopupRequest(details = {}) {
  if (isAuthorizationWindowName(details.frameName)) return true;
  try {
    const url = new URL(String(details.url || ''));
    const hostname = url.hostname.toLowerCase();
    if (AUTH_HOSTS.has(hostname)) return true;
    return url.pathname.split('/').filter(Boolean).some((segment) => {
      let normalized;
      try { normalized = decodeURIComponent(segment).toLowerCase(); } catch { normalized = segment.toLowerCase(); }
      return AUTH_PATH_SEGMENTS.has(normalized);
    });
  } catch {
    return false;
  }
}

function classifyProfileWindowOpen(details = {}) {
  const disposition = String(details.disposition || 'default').toLowerCase();
  if (disposition === 'foreground-tab') return { kind: 'tab', focus: true };
  if (disposition === 'background-tab') return { kind: 'tab', focus: false };
  if (isAuthorizationPopupRequest(details)) return { kind: 'popup', focus: true };
  if (isBlankWindowUrl(details.url)) return { kind: 'preflight', focus: false };
  return { kind: 'tab', focus: true };
}

function classifyProfilePreflightNavigation(details = {}, targetUrl, isAllowed = () => true) {
  if (isBlankWindowUrl(targetUrl)) return 'ignore';
  let protocol;
  try { protocol = new URL(String(targetUrl || '')).protocol.toLowerCase(); } catch { return 'deny'; }
  if (protocol !== 'http:' && protocol !== 'https:') return 'deny';
  if (!isAllowed(targetUrl)) return 'deny';
  return isAuthorizationPopupRequest({ ...details, url: targetUrl }) ? 'popup' : 'tab';
}

module.exports = { classifyProfileWindowOpen, classifyProfilePreflightNavigation, isAuthorizationPopupRequest, isBlankWindowUrl };
