'use strict';

function createAgentRequestRegistry() {
  const requests = new Map();

  function key(sender, requestId) {
    const id = String(requestId || '').slice(0, 160);
    return id && sender ? `${sender.id || 0}:${id}` : '';
  }

  function cancel(sender, requestId) {
    const requestKey = key(sender, requestId);
    if (!requestKey) return false;
    const request = requests.get(requestKey);
    if (!request || request.sender !== sender) return false;
    request.cancel();
    return true;
  }

  async function run(sender, requestId, operation, onCancel) {
    const requestKey = key(sender, requestId);
    if (!requestKey || typeof operation !== 'function') throw new Error('Agent 请求标识无效');
    if (sender.isDestroyed?.()) throw new Error('请求所属窗口已关闭');
    const controller = new AbortController();
    const entry = {
      sender,
      controller,
      cancel: () => {
        controller.abort();
        onCancel?.();
      },
    };
    const onDestroyed = () => controller.abort();
    requests.get(requestKey)?.cancel?.();
    requests.set(requestKey, entry);
    sender.once?.('destroyed', onDestroyed);
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted) throw new Error('请求已取消');
      return result;
    } catch (error) {
      if (controller.signal.aborted && error?.name === 'AbortError') throw new Error('请求已取消');
      throw error;
    } finally {
      sender.removeListener?.('destroyed', onDestroyed);
      if (requests.get(requestKey) === entry) requests.delete(requestKey);
    }
  }

  return Object.freeze({ requests, key, cancel, run });
}

module.exports = { createAgentRequestRegistry };
