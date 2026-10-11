'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');

test('subscription import disables entry points and ignores repeated submits while pending', async () => {
  let rejectImport;
  let importCalls = 0;
  const submit = { disabled: false, textContent: '开始导入' };
  const importButtons = [{ disabled: false }, { disabled: false }];
  const form = {
    dataset: { subscriptionId: '', originalUrl: '' },
    values: { name: '', url: 'https://example.com/subscription', text: '', sortOrder: '0' },
    querySelector: (selector) => selector === 'button[type="submit"]' ? submit : null,
  };
  const elements = {
    '#import-form': form,
    '#subscription-id': { value: '' },
    '#import-modal-title': { textContent: '' },
    '#subscription-name': { value: '' },
    '#subscription-sort-order': { value: '' },
    '#subscription-url': { value: '' },
    '#subscription-text': { value: '', disabled: false, setAttribute() {} },
  };
  const document = {
    querySelector: (selector) => elements[selector] || null,
    querySelectorAll: (selector) => selector === '[data-action="import-subscription"]' ? importButtons : [],
  };
  class TestFormData {
    constructor(target) { this.values = target.values; }
    get(key) { return this.values[key] ?? null; }
  }
  const context = {
    document,
    FormData: TestFormData,
    window: {
      api: {
        importSubscription: () => {
          importCalls += 1;
          return new Promise((_resolve, reject) => { rejectImport = reject; });
        },
      },
    },
  };
  const source = rendererSource.replace('if (typeof document !== "undefined") void init();', `
    setSyncState = () => {};
    showToast = () => {};
    closeModal = () => {};
    refreshState = async () => {};
    globalThis.renderer = { appState, importSubscription };
  `);
  vm.runInNewContext(source, context, { filename: 'renderer.js' });

  const event = { currentTarget: form, preventDefault() {} };
  const firstSubmission = context.renderer.importSubscription(event);
  assert.equal(context.renderer.appState.subscriptionImportBusy, true);
  assert.equal(submit.disabled, true);
  assert.equal(submit.textContent, '导入中...');
  assert.ok(importButtons.every((button) => button.disabled));

  await context.renderer.importSubscription(event);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(importCalls, 1);

  rejectImport(new Error('导入失败'));
  await firstSubmission;
  assert.equal(context.renderer.appState.subscriptionImportBusy, false);
  assert.equal(submit.disabled, false);
  assert.equal(submit.textContent, '开始导入');
  assert.ok(importButtons.every((button) => !button.disabled));
});
