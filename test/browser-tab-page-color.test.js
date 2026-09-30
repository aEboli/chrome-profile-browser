const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/browser-shell.js'), 'utf8');
const functions = source.slice(source.indexOf('function fallbackTabAccent('), source.indexOf('function tabIconSource('));
const nativeImage = { toDataURL: () => 'data:image/png;base64,test' };

function harness(pixels = [255, 255, 255, 255]) {
  const state = { renders: 0, timers: [], tabItems: [] };
  const context = vm.createContext({
    tabItems: state.tabItems,
    renderTabs: () => { state.renders += 1; },
    window: { setTimeout: (callback) => state.timers.push(callback) },
    Image: class {
      set src(value) { queueMicrotask(() => this.onload?.()); }
    },
    document: { createElement: () => ({ getContext: () => ({
      drawImage() {},
      getImageData: () => ({ data: pixels }),
    }) }) },
  });
  vm.runInContext(functions, context);
  const item = {
    url: 'https://example.com/', domReady: true, pageColorGeneration: 0,
    pageColor: '', accent: 'fallback',
    view: { hidden: false, isLoading: () => false, capturePage: async () => nativeImage },
  };
  state.tabItems.push(item);
  return { ...state, state, context, item, flush: () => state.timers.splice(0).forEach((callback) => callback()) };
}

test('dominant color uses the largest region, includes white, and preserves original channels', async () => {
  const { context } = harness([
    255, 255, 255, 255, 255, 255, 255, 255, 220, 20, 20, 255,
  ]);
  assert.equal(await context.dominantColorFromNativeImage(nativeImage), 'rgb(255 255 255)');
  const grouped = harness([100, 150, 200, 255, 102, 152, 202, 255, 255, 0, 0, 255]);
  assert.equal(await grouped.context.dominantColorFromNativeImage(nativeImage), 'rgb(101 151 201)');
});

test('transparent or unavailable screenshots produce no color', async () => {
  const { context } = harness([255, 0, 0, 0, 255, 255, 255, 20]);
  assert.equal(await context.dominantColorFromNativeImage(nativeImage), '');
  assert.equal(await context.dominantColorFromNativeImage(null), '');
  assert.equal(await context.dominantColorFromNativeImage({ toDataURL() { throw Error('closed'); } }), '');
});

test('text selects readable black or white for light, dark, and mid-tone pages', () => {
  const { context } = harness();
  assert.equal(context.tabTextColor('rgb(255 255 255)'), '#000000');
  assert.equal(context.tabTextColor('rgb(0 0 0)'), '#ffffff');
  assert.equal(context.tabTextColor('rgb(255 0 0)'), '#000000');
  assert.equal(context.tabTextColor('rgb(0 0 255)'), '#ffffff');
});

test('loaded page color is cached and reset retains the favicon fallback', async () => {
  const h = harness();
  const pending = h.context.refreshPageDominantColor(h.item);
  h.flush();
  await pending;
  assert.equal(h.item.pageColor, 'rgb(255 255 255)');
  assert.equal(h.state.renders, 1);
  await h.context.refreshPageDominantColor(h.item);
  assert.equal(h.state.timers.length, 0);
  h.item.faviconAccent = 'rgb(30 60 90)';
  h.context.resetPageDominantColor(h.item);
  assert.equal(h.item.pageColor, '');
  assert.equal(h.item.accent, 'rgb(30 60 90)');
});

test('navigation, closure, or view replacement discards in-flight screenshots', async () => {
  for (const change of [
    (h) => h.context.resetPageDominantColor(h.item),
    (h) => { h.item.url = 'https://other.example/'; },
    (h) => { h.state.tabItems.length = 0; },
    (h) => { h.item.view = {}; },
  ]) {
    const h = harness();
    let resolveCapture;
    h.item.view.capturePage = () => new Promise((resolve) => { resolveCapture = resolve; });
    const pending = h.context.refreshPageDominantColor(h.item);
    h.flush();
    await Promise.resolve();
    change(h);
    resolveCapture(nativeImage);
    await pending;
    assert.equal(h.item.pageColor, '');
    assert.equal(h.state.renders, 0);
  }
});

test('failed capture can retry; hidden, loading, and new tabs do not capture', async () => {
  const h = harness();
  h.item.view.capturePage = async () => { throw Error('not ready'); };
  const pending = h.context.refreshPageDominantColor(h.item);
  h.flush();
  await pending;
  assert.equal(h.item.accent, 'fallback');
  assert.equal(h.item.pageColorRequestKey, '');
  for (const change of [
    (item) => { item.view.hidden = true; },
    (item) => { item.view.isLoading = () => true; },
    (item) => { item.isNewTab = true; },
    (item) => { item.domReady = false; },
  ]) {
    const skipped = harness();
    change(skipped.item);
    await skipped.context.refreshPageDominantColor(skipped.item);
    assert.equal(skipped.state.timers.length, 0);
  }
});
