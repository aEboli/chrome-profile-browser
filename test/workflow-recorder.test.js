const test = require('node:test');
const assert = require('node:assert/strict');

const recorder = require('../src/renderer/workflow-recorder');

test('normalizes recorded click, input and select events into editable steps', () => {
  assert.deepEqual(recorder.createStepList([
    { kind: 'click', selector: '#search', text: '查询', url: 'https://example.test/orders' },
    { kind: 'input', selector: 'input[name=orderId]', value: 'A-001', url: 'https://example.test/orders' },
    { kind: 'select', selector: 'select[name=status]', value: 'paid', url: 'https://example.test/orders' },
  ]), [
    { kind: 'click', label: '点击“查询”', selector: '#search', text: '查询', url: 'https://example.test/orders' },
    { kind: 'input', label: '输入内容', selector: 'input[name=orderId]', text: '', url: 'https://example.test/orders', value: 'A-001' },
    { kind: 'select', label: '选择下拉选项', selector: 'select[name=status]', text: '', url: 'https://example.test/orders', value: 'paid' },
  ]);
});

test('ignores malformed events and bounds wait configuration', () => {
  assert.deepEqual(recorder.createStepList([
    null,
    { kind: 'click', selector: '' },
    { kind: 'wait', selector: '#orders', timeout: 999999 },
  ]), [{ kind: 'wait', label: '等待元素出现', selector: '#orders', text: '', url: '', timeout: 60000 }]);
});

test('builds a fixed listener script without accepting arbitrary page code', () => {
  const script = recorder.buildRecorderScript();
  assert.match(script, /addEventListener\('click'/);
  assert.match(script, /addEventListener\('change'/);
  assert.match(script, /data-testid/);
  assert.doesNotMatch(script, /executeJavaScript|eval\s*\(/);
});
