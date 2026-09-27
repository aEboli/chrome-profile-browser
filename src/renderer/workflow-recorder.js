'use strict';

const MAX_TEXT_LENGTH = 160;

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

function cssEscape(value) {
  return String(value || '').replace(/([\\"'#.:,[\]()>+~*= ])/g, '\\$1');
}

function selectorForElement(element) {
  if (!element || element.nodeType !== 1) return '';
  if (element.id) return `#${cssEscape(element.id)}`;
  const testId = element.getAttribute?.('data-testid');
  if (testId) return `[data-testid="${String(testId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
  const name = element.getAttribute?.('name');
  if (name) return `${String(element.localName || 'element')}[name="${String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
  const tag = String(element.localName || 'element').toLowerCase();
  const siblings = element.parentElement ? [...element.parentElement.children].filter((item) => item.localName === element.localName) : [];
  const index = siblings.indexOf(element) + 1;
  return index > 0 ? `${tag}:nth-of-type(${index})` : tag;
}

function normalizeRecordedEvent(event) {
  if (!event || !event.kind || !event.selector) return null;
  const base = {
    selector: String(event.selector).slice(0, 500),
    text: compactText(event.text),
    url: String(event.url || '').slice(0, 2000),
  };
  if (event.kind === 'click') return { kind: 'click', label: base.text ? `点击“${base.text}”` : '点击元素', ...base };
  if (event.kind === 'input') return { kind: 'input', label: '输入内容', ...base, value: String(event.value || '').slice(0, 4000) };
  if (event.kind === 'select') return { kind: 'select', label: '选择下拉选项', ...base, value: String(event.value || '').slice(0, 500) };
  if (event.kind === 'wait') return { kind: 'wait', label: '等待元素出现', ...base, timeout: Math.max(1000, Math.min(60000, Number(event.timeout) || 10000)) };
  return null;
}

function createStepList(events) {
  return (Array.isArray(events) ? events : []).map(normalizeRecordedEvent).filter(Boolean);
}

function buildRecorderScript() {
  return `(() => {
    const key = '__cpbWorkflowRecorder';
    const text = (value) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, ${MAX_TEXT_LENGTH});
    const selector = (element) => {
      if (!element || element.nodeType !== 1) return '';
      if (element.id) return '#' + CSS.escape(element.id);
      const testId = element.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"') + '"]';
      const name = element.getAttribute('name');
      if (name) return element.localName + '[name="' + name.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"') + '"]';
      const siblings = element.parentElement ? Array.from(element.parentElement.children).filter((item) => item.localName === element.localName) : [];
      return element.localName + ':nth-of-type(' + (siblings.indexOf(element) + 1) + ')';
    };
    const emit = (kind, element, value) => {
      if (!element || !selector(element)) return;
      window[key].events.push({ kind, selector: selector(element), text: text(element.innerText || element.getAttribute('aria-label') || element.value), value: value == null ? '' : String(value), url: location.href });
    };
    if (window[key]) return window[key].events;
    window[key] = { events: [] };
    document.addEventListener('click', (event) => emit('click', event.target), true);
    document.addEventListener('change', (event) => {
      const element = event.target;
      if (element && element.tagName === 'SELECT') emit('select', element, element.value);
      else if (element && /^(INPUT|TEXTAREA)$/.test(element.tagName)) emit('input', element, element.value);
    }, true);
    return window[key].events;
  })()`;
}

module.exports = { buildRecorderScript, compactText, createStepList, normalizeRecordedEvent, selectorForElement };
