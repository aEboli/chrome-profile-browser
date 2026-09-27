(function exposeAgentRetry(root, factory) {
  const retry = factory();
  if (root) root.browserAgentRetry = retry;
  if (typeof module === 'object' && module.exports) module.exports = retry;
})(typeof window !== 'undefined' ? window : null, () => {
  const RETRY_DELAYS_MS = Object.freeze([1000, 2000, 4000, 8000, 16000]);

  function abortError() {
    const error = new Error('重试已取消');
    error.name = 'AbortError';
    return error;
  }

  function waitForRetry(delayMs, signal) {
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      let timer;
      const finish = (continued) => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(continued);
      };
      const onAbort = () => finish(false);
      timer = setTimeout(() => finish(true), delayMs);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function retryOperation(operation, options = {}) {
    if (typeof operation !== 'function') throw new Error('重试操作无效');
    const maxRetries = Number.isSafeInteger(options.maxRetries) && options.maxRetries >= 0
      ? options.maxRetries
      : RETRY_DELAYS_MS.length;
    const delays = Array.isArray(options.delays) && options.delays.length ? options.delays : RETRY_DELAYS_MS;
    const signal = options.signal;
    let retries = 0;

    while (true) {
      if (signal?.aborted) throw abortError();
      try {
        return await operation(retries + 1);
      } catch (error) {
        if (signal?.aborted || retries >= maxRetries || !options.shouldRetry?.(error)) throw error;
        const retry = retries + 1;
        const delay = delays[Math.min(retries, delays.length - 1)];
        options.onRetry?.({ error, retry, maxRetries, delay });
        const continued = await (options.wait || waitForRetry)(delay, signal);
        if (continued === false || signal?.aborted) throw abortError();
        retries = retry;
      }
    }
  }

  return Object.freeze({ RETRY_DELAYS_MS, retryOperation, waitForRetry });
});
