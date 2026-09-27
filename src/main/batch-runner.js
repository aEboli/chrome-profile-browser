'use strict';

async function runBoundedBatch(items, worker, concurrency = 1) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (typeof worker !== 'function') throw new TypeError('批量任务处理器无效');
  const requested = Number(concurrency);
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(items.length, Math.floor(requested))
    : 1;
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => consume()));
  return results;
}

module.exports = { runBoundedBatch };
