'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createInterfaceZoom, nextInterfaceZoomPercentage } = require('../src/renderer/interface-zoom');
const { installGuestInterfaceZoom: installGuestPreloadZoom } = require('../src/main/browser-password-preload');

const root = path.join(__dirname, '..');

function createFakeWindow() {
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

test('left Ctrl plus wheel adjusts UI zoom in both directions; right Ctrl is ignored', () => {
  const targetWindow = createFakeWindow();
  const indicator = { hidden: true, textContent: '' };
  const applied = [];
  const zoom = createInterfaceZoom({ targetWindow, indicator, applyZoom: (factor) => applied.push(factor) });
  let prevented = 0;

  targetWindow.dispatch('keydown', { code: 'ControlLeft' });
  targetWindow.dispatch('wheel', { ctrlKey: true, deltaY: -100, preventDefault() { prevented += 1; } });
  assert.equal(zoom.getPercentage(), 110);
  assert.equal(indicator.textContent, '110%');
  targetWindow.dispatch('wheel', { ctrlKey: true, deltaY: 100, preventDefault() { prevented += 1; } });
  assert.equal(zoom.getPercentage(), 100);
  assert.equal(prevented, 2);

  targetWindow.dispatch('keyup', { code: 'ControlLeft' });
  targetWindow.dispatch('keydown', { code: 'ControlRight' });
  targetWindow.dispatch('wheel', { ctrlKey: true, deltaY: -100, preventDefault() { prevented += 1; } });
  assert.equal(zoom.getPercentage(), 100);
  assert.equal(prevented, 3);
  targetWindow.dispatch('keydown', { code: 'Digit0', ctrlKey: true, preventDefault() { prevented += 1; } });
  assert.equal(zoom.getPercentage(), 100);
  assert.equal(prevented, 4);
  assert.deepEqual(applied, [1.1, 1]);
});

test('guest Ctrl wheel blocks Chromium zoom but forwards only left Ctrl commands', () => {
  const targetWindow = createFakeWindow();
  const commands = [];
  let prevented = 0;
  installGuestPreloadZoom({ targetWindow, sendCommand: (command) => commands.push(command) });

  targetWindow.dispatch('keydown', { code: 'ControlLeft' });
  targetWindow.dispatch('wheel', { ctrlKey: true, deltaY: -120, preventDefault() { prevented += 1; } });
  targetWindow.dispatch('keyup', { code: 'ControlLeft' });
  targetWindow.dispatch('keydown', { code: 'ControlRight' });
  targetWindow.dispatch('wheel', { ctrlKey: true, deltaY: 120, preventDefault() { prevented += 1; } });
  targetWindow.dispatch('keydown', { code: 'Digit0', ctrlKey: true, preventDefault() { prevented += 1; } });

  assert.equal(prevented, 3);
  assert.deepEqual(commands, [
    { leftControlDown: true },
    { direction: 1 },
    { leftControlDown: false },
  ]);

  targetWindow.dispatch('keyup', { code: 'ControlRight' });
  targetWindow.dispatch('keydown', { code: 'ControlLeft' });
  targetWindow.dispatch('keydown', { code: 'Digit0', ctrlKey: true, preventDefault() { prevented += 1; } });
  assert.equal(prevented, 4);
  assert.deepEqual(commands.slice(-2), [{ leftControlDown: true }, { reset: true }]);
  targetWindow.dispatch('blur');
  assert.deepEqual(commands.at(-1), { leftControlDown: false });
});

test('interface zoom clamps to 50%-200%, Ctrl+0 resets, and the latest indicator expires after 2.5 seconds', () => {
  const targetWindow = createFakeWindow();
  const indicator = { hidden: true, textContent: '' };
  const zoom = createInterfaceZoom({ targetWindow, indicator });
  targetWindow.dispatch('keydown', { code: 'ControlLeft' });
  for (let index = 0; index < 11; index += 1) {
    zoom.step(1);
  }
  assert.equal(zoom.getPercentage(), 200);
  assert.equal(nextInterfaceZoomPercentage(200, 1), 200);
  assert.equal(nextInterfaceZoomPercentage(50, -1), 50);
  for (let index = 0; index < 20; index += 1) zoom.step(-1);
  assert.equal(zoom.getPercentage(), 50);

  targetWindow.dispatch('keydown', { code: 'Digit0', ctrlKey: true, preventDefault() {} });
  assert.equal(zoom.getPercentage(), 100);
  assert.equal(indicator.textContent, '100%');
  targetWindow.advance(2499);
  assert.equal(indicator.hidden, false);
  zoom.step(1);
  targetWindow.advance(2499);
  assert.equal(indicator.hidden, false);
  targetWindow.advance(1);
  assert.equal(indicator.hidden, true);
});

test('both app windows wire interface zoom and guest-page input reaches the browser shell', () => {
  const managerRenderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
  const managerHtml = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  const shellRenderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.js'), 'utf8');
  const shellHtml = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.html'), 'utf8');
  const shellCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.css'), 'utf8');
  const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');

  assert.match(managerHtml, /interface-zoom\.js/);
  assert.match(managerHtml, /id="zoom-indicator"[^>]+role="status"/);
  assert.match(managerRenderer, /applyZoom: \(factor\) => api\.setInterfaceZoom/);
  assert.match(shellHtml, /interface-zoom\.js/);
  assert.match(shellRenderer, /onInterfaceZoomCommand/);
  assert.match(mainSource, /guestContents\.on\('input-event', \(_event, input\) => handleGuestInput/);
  assert.match(fs.readFileSync(path.join(root, 'src', 'main', 'browser-password-preload.js'), 'utf8'), /installGuestInterfaceZoom/);
  assert.match(shellRenderer, /event\?\.channel === 'browser-shell:interface-zoom'/);
  assert.match(shellRenderer, /applyZoom: \(factor\) => \{/);
  assert.doesNotMatch(shellRenderer, /__cpb_zoom_indicator__/);
  assert.match(shellHtml, /class="shell-actions"[\s\S]*?<span class="zoom-indicator-slot"><span id="zoom-indicator"/);
  assert.match(shellCss, /\.zoom-indicator-slot\s*\{[^}]*flex:\s*0 0 68px/s);
  assert.doesNotMatch(shellCss, /\.zoom-indicator\s*\{[^}]*position:\s*fixed/s);
  assert.match(shellRenderer, /case 'zoom-out': if \(shellInterfaceZoom\) shellInterfaceZoom\.step\(-1\)/);
  assert.match(shellRenderer, /case 'zoom-in': if \(shellInterfaceZoom\) shellInterfaceZoom\.step\(1\)/);
  assert.match(shellRenderer, /syncGuestZoomFactor\(view\)/);
  assert.doesNotMatch(shellRenderer, /shellApi\?\.setInterfaceZoom/);
  assert.doesNotMatch(mainSource, /browser-shell:set-interface-zoom/);
  assert.doesNotMatch(mainSource, /hostWindow\.webContents\.setZoomFactor\(factor\)/);
});
