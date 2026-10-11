'use strict';

const AVAILABLE_STATUSES = new Set(['ok', 'ready', 'available', 'healthy', 'reachable']);

function supportedSubscriptionNodes(nodes, subscriptionId, excludedNodeIds = []) {
  const id = String(subscriptionId || '').trim();
  const excluded = new Set(Array.isArray(excludedNodeIds) ? excludedNodeIds.map((value) => String(value || '').trim()) : []);
  if (!id || !Array.isArray(nodes)) return [];
  const seenIds = new Set();
  return nodes.filter((node) => {
    const nodeId = String(node?.id || '').trim();
    if (!node
      || typeof node !== 'object'
      || !nodeId
      || seenIds.has(nodeId)
      || String(node.sourceId || '').trim() !== id
      || excluded.has(nodeId)
      || node.supported === false
      || node.unsupported === true
      || node.subscriptionInfo === true
      || String(node.status || '').toLowerCase() === 'unsupported') return false;
    seenIds.add(nodeId);
    return true;
  });
}

function rankSubscriptionRoutes(nodes, subscriptionId, results, excludedNodeIds = []) {
  const resultById = new Map((Array.isArray(results) ? results : [])
    .filter((result) => result && typeof result === 'object')
    .map((result) => [String(result.nodeId || '').trim(), result]));
  return supportedSubscriptionNodes(nodes, subscriptionId, excludedNodeIds)
    .map((node, order) => {
      const result = resultById.get(String(node.id).trim());
      const status = String(result?.status || '').toLowerCase();
      const latency = Number(result?.latencyMs);
      return {
        node,
        result,
        latencyMs: Number.isFinite(latency) && latency >= 0 ? Math.round(latency) : Number.POSITIVE_INFINITY,
        order,
        available: result?.ok === true || (result?.ok !== false && AVAILABLE_STATUSES.has(status)),
      };
    })
    .filter((route) => route.available)
    .sort((left, right) => left.latencyMs - right.latencyMs || left.order - right.order);
}

module.exports = {
  rankSubscriptionRoutes,
  supportedSubscriptionNodes,
};
