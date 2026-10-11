'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { browserShortcutCommand, browserShortcutCommandFromEvent } = require('../src/main/browser-shortcuts');

test('routes Chrome tab shortcuts without treating Ctrl+Shift+T as a new tab', () => {
  assert.equal(browserShortcutCommand({ key: 't', control: true, shift: true }), 'restore-closed-tab');
  assert.equal(browserShortcutCommand({ key: 't', control: true }), 'new-tab');
  assert.equal(browserShortcutCommand({ key: 'w', control: true }), 'close-tab');
  assert.equal(browserShortcutCommand({ key: 'tab', control: true, shift: true }), 'previous-tab');
  assert.equal(browserShortcutCommand({ key: '9', control: true }), 'activate-last-tab');
  assert.equal(browserShortcutCommand({ key: '3', meta: true }), 'activate-tab-3');
});

test('routes page tools and direction shortcuts only with the intended modifiers', () => {
  assert.equal(browserShortcutCommand({ key: 'f', control: true }), 'find');
  assert.equal(browserShortcutCommand({ key: 'F3' }), 'find-next');
  assert.equal(browserShortcutCommand({ key: 'F3', shift: true }), 'find-previous');
  assert.equal(browserShortcutCommand({ key: 'r', control: true, shift: true }), 'reload-ignoring-cache');
  assert.equal(browserShortcutCommand({ key: 'arrowleft', alt: true }), 'back');
  assert.equal(browserShortcutCommand({ key: 't', control: true, alt: true }), '');
  assert.equal(browserShortcutCommand({ key: 'F5' }), '');
});

test('maps DOM shortcut events with platform primary modifiers', () => {
  assert.equal(browserShortcutCommandFromEvent({ key: 'l', ctrlKey: true }), 'focus-address');
  assert.equal(browserShortcutCommandFromEvent({ key: 'Enter', altKey: true }), 'address-open-new-tab');
  assert.equal(browserShortcutCommandFromEvent({ key: 'Escape' }), 'escape');
});

test('leaves composition and unrelated modifier combinations with the input field', () => {
  assert.equal(browserShortcutCommandFromEvent({ key: 't', ctrlKey: true, isComposing: true }), '');
  assert.equal(browserShortcutCommand({ key: 'f', control: true, isComposing: true }), '');
  assert.equal(browserShortcutCommand({ key: 'w', control: true, shift: true }), '');
  assert.equal(browserShortcutCommand({ key: 't', control: true, alt: true, shift: true }), '');
});
