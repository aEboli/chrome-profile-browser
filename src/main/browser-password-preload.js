function installGuestInterfaceZoom({ targetWindow, sendCommand }) {
  let leftControlDown = false;

  targetWindow.addEventListener('keydown', (event) => {
    if (event.code === 'ControlLeft') {
      leftControlDown = true;
      sendCommand({ leftControlDown: true });
      return;
    }
    if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
    if (event.code !== 'Digit0' && event.code !== 'Numpad0') return;
    event.preventDefault();
    if (leftControlDown) sendCommand({ reset: true });
  }, true);

  targetWindow.addEventListener('keyup', (event) => {
    if (event.code !== 'ControlLeft') return;
    leftControlDown = false;
    sendCommand({ leftControlDown: false });
  }, true);

  targetWindow.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    if (!leftControlDown || event.shiftKey || event.altKey || event.metaKey) return;
    sendCommand({ direction: event.deltaY < 0 ? 1 : -1 });
  }, { capture: true, passive: false });

  targetWindow.addEventListener('blur', () => {
    if (!leftControlDown) return;
    leftControlDown = false;
    sendCommand({ leftControlDown: false });
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { installGuestInterfaceZoom };

if (typeof window !== 'undefined') {
const { ipcRenderer } = require('electron');

(() => {
  'use strict';

  // The preload runs before the page DOM exists. All UI is created lazily so
  // ordinary pages pay no visible cost until a credential field is focused.
  const STYLE_ID = '__cpb_password_vault_style__';
  const POPUP_TIMEOUT_MS = 12000;
  const MAX_TEXT_LENGTH = 2048;
  let popup = null;
  let activeField = null;
  let suggestionRequest = null;
  let secretRequest = null;
  let popupTimer = 0;
  let lastSubmitted = null;

  function text(value, limit = MAX_TEXT_LENGTH) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
  }

  function pageUrl() {
    if (!['http:', 'https:'].includes(location.protocol)) return '';
    return text(location.href, MAX_TEXT_LENGTH).split('#')[0];
  }

  function serviceName() {
    try {
      return text(location.hostname, 253) || text(document.title, 120) || '网页登录';
    } catch {
      return '网页登录';
    }
  }

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.disabled || element.type === 'hidden') return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function inputCandidates(root) {
    if (root?.querySelectorAll) return [...root.querySelectorAll('input')].filter(visible);
    return [...document.querySelectorAll('input')].filter(visible);
  }

  function passwordFieldFor(root) {
    return inputCandidates(root).find((field) => field.type === 'password')
      || inputCandidates(document).find((field) => field.type === 'password')
      || null;
  }

  function usernameFieldFor(root, passwordField = null) {
    const fields = inputCandidates(root || document).filter((field) => field !== passwordField);
    const ranked = fields.find((field) => /^(username|email|tel)$/i.test(field.autocomplete))
      || fields.find((field) => /(?:user|login|email|account|phone|mobile|name)/i.test(`${field.name} ${field.id} ${field.placeholder}`))
      || fields.find((field) => ['text', 'email', 'tel'].includes(field.type));
    return ranked || null;
  }

  function formFor(field) {
    if (field?.form) return field.form;
    return field?.closest?.('form') || document.querySelector('form');
  }

  function credentialFields(root) {
    const passwordField = passwordFieldFor(root);
    const usernameField = usernameFieldFor(root, passwordField);
    return { usernameField, passwordField };
  }

  function credentialValues(root) {
    const fields = credentialFields(root);
    const account = text(fields.usernameField?.value, 256);
    const password = typeof fields.passwordField?.value === 'string' ? fields.passwordField.value : '';
    if (!account || !password) return null;
    return {
      ...fields,
      account,
      password: password.slice(0, 4096),
      website: pageUrl(),
      service: serviceName(),
    };
  }

  function post(channel, payload) {
    try {
      ipcRenderer.sendToHost(channel, payload);
    } catch {
      // The webview may be closing while the page is still dispatching events.
    }
  }

  installGuestInterfaceZoom({
    targetWindow: window,
    sendCommand: (command) => post('browser-shell:interface-zoom', command),
  });

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .cpb-password-popup {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        box-sizing: border-box;
        width: min(360px, calc(100vw - 16px));
        max-height: min(400px, calc(100vh - 16px));
        overflow: auto;
        padding: 8px;
        color: #eef3f7;
        background: #142337;
        border: 1px solid #3d5b78;
        border-radius: 9px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, .46);
        font: 13px/1.4 "Segoe UI", Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .cpb-password-popup::before {
        position: absolute;
        top: -7px;
        left: 27px;
        width: 12px;
        height: 12px;
        background: #142337;
        border-top: 1px solid #3d5b78;
        border-left: 1px solid #3d5b78;
        content: "";
        transform: rotate(45deg);
      }
      .cpb-password-popup.cpb-password-popup--above::before {
        top: auto;
        bottom: -7px;
        border-top: 0;
        border-left: 0;
        border-right: 1px solid #3d5b78;
        border-bottom: 1px solid #3d5b78;
      }
      .cpb-password-popup > * { box-sizing: border-box; }
      .cpb-password-popup__heading {
        display: flex;
        align-items: center;
        min-height: 34px;
        padding: 4px 9px 8px;
        color: #f1f0ed;
        font-size: 12px;
        font-weight: 650;
        border-bottom: 1px solid rgba(225, 237, 247, .12);
      }
      .cpb-password-popup__hint {
        display: block;
        padding: 10px 9px 8px;
        color: #a7bacb;
        font-size: 11px;
      }
      .cpb-password-row {
        all: unset;
        display: grid;
        box-sizing: border-box;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 10px;
        width: 100%;
        min-height: 62px;
        padding: 9px 8px;
        color: #eaf1f7;
        border-radius: 6px;
        cursor: pointer;
        font: 13px/1.4 "Segoe UI", Arial, sans-serif;
      }
      .cpb-password-row:hover, .cpb-password-row:focus-visible {
        background: #20344b;
        outline: 0;
      }
      .cpb-password-row__icon {
        position: relative;
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        margin-top: 4px;
        color: #74d3d7;
        background: rgba(36, 116, 181, .2);
        border: 1px solid rgba(116, 211, 215, .3);
        border-radius: 7px;
        font-size: 0;
      }
      .cpb-password-row__icon::before {
        width: 7px;
        height: 7px;
        border: 1.5px solid currentColor;
        border-radius: 50%;
        content: "";
        transform: translate(-2px, -2px);
      }
      .cpb-password-row__icon::after {
        position: absolute;
        width: 9px;
        height: 1.5px;
        background: currentColor;
        content: "";
        transform: translate(3px, 3px) rotate(-45deg);
      }
      .cpb-password-row__copy { min-width: 0; }
      .cpb-password-row__account, .cpb-password-row__secret {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cpb-password-row__account { color: #f1f0ed; font-size: 13px; font-weight: 600; }
      .cpb-password-row__secret { margin-top: 4px; color: #8ebbe3; letter-spacing: 1px; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function clearPopupTimer() {
    if (popupTimer) window.clearTimeout(popupTimer);
    popupTimer = 0;
  }

  function schedulePopupClose() {
    clearPopupTimer();
    popupTimer = window.setTimeout(() => hidePopup(), POPUP_TIMEOUT_MS);
  }

  function positionPopup(anchor) {
    if (!popup || !anchor?.getBoundingClientRect) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(360, Math.max(Math.min(260, window.innerWidth - margin * 2), Math.round(rect.width || 280)));
    popup.style.width = `${width}px`;
    let left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left));
    const popupHeight = Math.min(popup.scrollHeight || 180, window.innerHeight - margin * 2);
    let above = false;
    let top = rect.bottom + 6;
    if (top + popupHeight > window.innerHeight - margin && rect.top > popupHeight + margin) {
      top = rect.top - popupHeight - 6;
      above = true;
    }
    if (top < margin) top = margin;
    if (left < margin) left = margin;
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
    popup.classList.toggle('cpb-password-popup--above', above);
  }

  function createPopup(anchor, kind) {
    ensureStyles();
    clearPopupTimer();
    popup?.remove();
    popup = document.createElement('div');
    popup.className = `cpb-password-popup cpb-password-popup--${kind}`;
    popup.setAttribute('role', 'dialog');
    popup.addEventListener('pointerdown', (event) => event.stopPropagation());
    popup.addEventListener('click', (event) => event.stopPropagation());
    (document.body || document.documentElement).appendChild(popup);
    positionPopup(anchor);
    schedulePopupClose();
    return popup;
  }

  function hidePopup() {
    clearPopupTimer();
    popup?.remove();
    popup = null;
    suggestionRequest = null;
    secretRequest = null;
    activeField = null;
  }

  function setNativeValue(field, value) {
    if (!field) return;
    const prototype = Object.getPrototypeOf(field);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) descriptor.set.call(field, value);
    else field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function fillCredentials(account, password, field) {
    if (!field?.isConnected) return;
    const form = formFor(field);
    const fields = credentialFields(form || document);
    setNativeValue(fields.usernameField, account);
    setNativeValue(fields.passwordField, password);
    fields.usernameField?.focus?.();
  }

  function requestSuggestions(field) {
    if (!field || !pageUrl()) return;
    activeField = field;
    secretRequest = null;
    const requestId = `suggestion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    suggestionRequest = requestId;
    const target = createPopup(field, 'suggestions');
    const heading = document.createElement('span');
    heading.className = 'cpb-password-popup__heading';
    heading.textContent = '密码簿';
    target.appendChild(heading);
    const hint = document.createElement('span');
    hint.className = 'cpb-password-popup__hint';
    hint.textContent = '正在查找已保存的账号';
    target.appendChild(hint);
    positionPopup(field);
    post('password-vault:query', { requestId, url: pageUrl() });
  }

  function renderSuggestions(payload) {
    if (!payload || payload.requestId !== suggestionRequest || !activeField) return;
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    if (!suggestions.length) {
      hidePopup();
      return;
    }
    if (!popup) return;
    popup.innerHTML = '';
    const heading = document.createElement('span');
    heading.className = 'cpb-password-popup__heading';
    heading.textContent = '密码簿';
    popup.appendChild(heading);
    for (const item of suggestions.slice(0, 8)) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cpb-password-row';
      row.dataset.entryId = text(item?.id, 128);
      row.addEventListener('pointerdown', (event) => event.preventDefault());
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const entryId = row.dataset.entryId;
        if (!entryId || !activeField) return;
        const requestId = `secret-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        secretRequest = { requestId, entryId, account: text(item?.account, 256), field: activeField };
        suggestionRequest = null;
        popup.innerHTML = '';
        const hint = document.createElement('span');
        hint.className = 'cpb-password-popup__hint';
        hint.textContent = '正在填充账号';
        popup.appendChild(hint);
        positionPopup(activeField);
        post('password-vault:reveal', { requestId, entryId });
      });
      const icon = document.createElement('span');
      icon.className = 'cpb-password-row__icon';
      icon.setAttribute('aria-hidden', 'true');
      row.appendChild(icon);
      const copy = document.createElement('span');
      copy.className = 'cpb-password-row__copy';
      const account = document.createElement('span');
      account.className = 'cpb-password-row__account';
      account.textContent = text(item?.account, 256) || '未命名账号';
      const secret = document.createElement('span');
      secret.className = 'cpb-password-row__secret';
      secret.textContent = '••••••••';
      copy.append(account, secret);
      row.appendChild(copy);
      popup.appendChild(row);
    }
    positionPopup(activeField);
    schedulePopupClose();
  }

  function fieldRect(field) {
    if (!field?.getBoundingClientRect) return null;
    const rect = field.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function notifyLogin(details) {
    if (!details?.account || !details?.password || !details?.website) return;
    const signature = `${details.website}\n${details.account}`;
    const now = Date.now();
    if (lastSubmitted && lastSubmitted.signature === signature && now - lastSubmitted.at < 1500) return;
    lastSubmitted = { signature, at: now };
    hidePopup();
    post('password-vault:login', {
      requestId: `login-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      service: details.service,
      account: details.account,
      password: details.password,
      website: details.website,
      rect: fieldRect(details.passwordField || details.usernameField),
    });
  }

  function handleSubmit(root) {
    const details = credentialValues(root);
    if (details) notifyLogin(details);
  }

  document.addEventListener('focusin', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !visible(field)) return;
    const form = formFor(field);
    const looksLikeAccount = field.type === 'password'
      || /^(username|email|tel)$/i.test(field.autocomplete)
      || (['text', 'email', 'tel'].includes(field.type) && Boolean(passwordFieldFor(form)));
    if (looksLikeAccount) requestSuggestions(field);
  }, true);

  document.addEventListener('input', (event) => {
    const field = event.target;
    if (field === activeField && field instanceof HTMLInputElement) requestSuggestions(field);
  }, true);

  document.addEventListener('submit', (event) => {
    handleSubmit(event.target);
  }, true);

  document.addEventListener('click', (event) => {
    const submitter = event.target?.closest?.('button[type="submit"], input[type="submit"], button:not([type])');
    if (!submitter) return;
    const form = submitter.form || submitter.closest?.('form');
    window.setTimeout(() => handleSubmit(form || document), 0);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    const form = formFor(field);
    const fields = credentialFields(form || document);
    if (field !== fields.usernameField && field !== fields.passwordField) return;
    window.setTimeout(() => handleSubmit(form || document), 0);
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (popup && !popup.contains(event.target) && event.target !== activeField) hidePopup();
    post('password-vault:dismiss', {});
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && popup) hidePopup();
  }, true);

  document.addEventListener('scroll', () => {
    if (popup && activeField) positionPopup(activeField);
  }, true);
  window.addEventListener('resize', () => {
    if (popup && activeField) positionPopup(activeField);
  });

  ipcRenderer.on('password-vault:suggestions', (_event, payload) => renderSuggestions(payload));
  ipcRenderer.on('password-vault:secret', (_event, payload) => {
    if (!secretRequest || payload?.requestId !== secretRequest.requestId) return;
    const request = secretRequest;
    if (payload?.ok !== true || typeof payload.password !== 'string') {
      hidePopup();
      return;
    }
    fillCredentials(request.account, payload.password, request.field);
    hidePopup();
  });
})();
}
