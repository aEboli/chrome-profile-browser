const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { createAgentRequestRegistry } = require('../src/main/agent-request-lifecycle');

function createSender(id) {
  const sender = new EventEmitter();
  sender.id = id;
  sender.closed = false;
  sender.isDestroyed = () => sender.closed;
  return sender;
}

test('cancels only the matching sender request and cleans it up', async () => {
  const registry = createAgentRequestRegistry();
  const sender = createSender(1);
  const otherSender = createSender(2);
  const stopped = registry.run(sender, 'model-list', (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }));
  let finishOther;
  let otherSignal;
  const other = registry.run(sender, 'jev', (signal) => {
    otherSignal = signal;
    return new Promise((resolve) => { finishOther = resolve; });
  });

  assert.equal(registry.cancel(otherSender, 'model-list'), false);
  assert.equal(registry.cancel(sender, 'unknown'), false);
  assert.equal(registry.cancel(sender, 'model-list'), true);
  await assert.rejects(stopped, /请求已取消/);
  assert.equal(otherSignal.aborted, false);
  finishOther('complete');
  assert.equal(await other, 'complete');
  assert.equal(registry.requests.size, 0);
});

test('aborts a request when its sender is destroyed and removes its listener', async () => {
  const registry = createAgentRequestRegistry();
  const sender = createSender(3);
  const request = registry.run(sender, 'stream', (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }));

  sender.closed = true;
  sender.emit('destroyed');
  await assert.rejects(request, /请求已取消/);
  assert.equal(registry.requests.size, 0);
  assert.equal(sender.listenerCount('destroyed'), 0);
});
