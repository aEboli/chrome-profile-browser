(function exposeBrowserShortcuts(root, factory) {
  const shortcuts = factory();
  if (root) root.browserShortcuts = shortcuts;
  if (typeof module === 'object' && module.exports) module.exports = shortcuts;
})(typeof window !== 'undefined' ? window : null, () => {
'use strict';

function shortcutCommand(key, modifiers = {}) {
  const value = String(key || '').trim().toLowerCase();
  const primary = modifiers.control === true || modifiers.meta === true;
  const shift = modifiers.shift === true;
  const alt = modifiers.alt === true;
  if (primary && alt && !shift && value === 'd') return 'toggle-bookmark-bar';
  if (primary && !alt && shift) {
    if (value === 't') return 'restore-closed-tab';
    if (value === 'a') return 'toggle-tab-switcher';
    if (value === 'g') return 'find-previous';
    if (value === 'b') return 'toggle-bookmark-bar';
    if (value === 'r') return 'reload-ignoring-cache';
    if (value === 'delete') return 'clear-data';
  }
  if (primary && !alt && !shift) {
    if (value === 't') return 'new-tab';
    if (value === 'w') return 'close-tab';
    if (value === 'l') return 'focus-address';
    if (value === 'f') return 'find';
    if (value === 'g') return 'find-next';
    if (value === 'h') return 'history';
    if (value === 'j') return 'downloads';
    if (value === 'r') return 'reload';
    if (value === 'd') return 'bookmark';
    if (value === 'p') return 'print';
    if (value === '0') return 'zoom-reset';
    if (value === '-' || value === 'subtract') return 'zoom-out';
    if (value === '=' || value === 'add') return 'zoom-in';
    if (/^[1-8]$/.test(value)) return `activate-tab-${value}`;
    if (value === '9') return 'activate-last-tab';
    if (value === 'pagedown') return 'next-tab';
    if (value === 'pageup') return 'previous-tab';
  }
  if (primary && !alt && shift && value === '+') return 'zoom-in';
  if (primary && !alt && value === 'tab') return shift ? 'previous-tab' : 'next-tab';
  if (!primary && !alt && value === 'f3') return shift ? 'find-previous' : 'find-next';
  if (!primary && !alt && !shift && value === 'escape') return 'escape';
  if (!primary && !alt && !shift && value === 'f11') return 'fullscreen';
  if (!primary && !alt && !shift && value === 'f6') return 'focus-address';
  if (!primary && !alt && shift && value === 'f5') return 'reload-ignoring-cache';
  if (primary && !alt && !shift && value === 'f5') return 'reload-ignoring-cache';
  if (alt && !primary && !shift && value === 'd') return 'focus-address';
  if (alt && !primary && !shift && value === 'arrowleft') return 'back';
  if (alt && !primary && !shift && value === 'arrowright') return 'forward';
  return '';
}

function browserShortcutCommand(input = {}) {
  if (input.isComposing || input.keyCode === 229) return '';
  return shortcutCommand(input.key || input.code || input.keyCode, {
    control: input.control === true,
    meta: input.meta === true,
    shift: input.shift === true,
    alt: input.alt === true,
  });
}

function browserShortcutCommandFromEvent(event = {}) {
  if (event.isComposing || event.keyCode === 229) return '';
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'Enter') return 'address-open-new-tab';
  return shortcutCommand(event.key || event.code, {
    control: event.ctrlKey === true,
    meta: event.metaKey === true,
    shift: event.shiftKey === true,
    alt: event.altKey === true,
  });
}

return Object.freeze({ browserShortcutCommand, browserShortcutCommandFromEvent });
});
