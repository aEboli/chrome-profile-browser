'use strict';

function textId(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizedNodeIds(value) {
  return new Set(Array.isArray(value) ? value.map(textId).filter(Boolean) : []);
}

function subscriptionNodes(state, subscriptionId) {
  const id = textId(subscriptionId);
  if (!id) return [];
  const subscriptions = Array.isArray(state?.subscriptions) ? state.subscriptions : [];
  const record = subscriptions.find((item) => textId(item?.id) === id);
  const recordedIds = normalizedNodeIds(record?.nodeIds);
  const knownSubscriptionIds = new Set(subscriptions.map((item) => textId(item?.id)).filter(Boolean));
  const nodes = [];

  for (const node of Array.isArray(state?.nodes) ? state.nodes : []) {
    const nodeId = textId(node?.id);
    const sourceId = textId(node?.sourceId);
    if (sourceId === id) {
      nodes.push(node);
      continue;
    }
    if (!nodeId) continue;
    // Older records may only keep the node ID on the subscription. Do not
    // remove a node that is explicitly owned by another live subscription.
    if (recordedIds.has(nodeId) && (!sourceId || !knownSubscriptionIds.has(sourceId))) {
      nodes.push(node);
    }
  }
  return nodes;
}

function subscriptionNodeIds(state, subscriptionId) {
  return new Set(subscriptionNodes(state, subscriptionId).map((node) => textId(node?.id)).filter(Boolean));
}

function removeSubscriptionData(state, subscriptionId) {
  const id = textId(subscriptionId);
  const ownedNodes = new Set(subscriptionNodes(state, id));
  const nodeIds = new Set([...ownedNodes].map((node) => textId(node?.id)).filter(Boolean));
  state.nodes = (Array.isArray(state.nodes) ? state.nodes : [])
    .filter((node) => !ownedNodes.has(node));
  // Imported records can share IDs; retain references while that ID still exists.
  for (const node of state.nodes) nodeIds.delete(textId(node?.id));
  state.profiles = (Array.isArray(state.profiles) ? state.profiles : [])
    .map((profile) => {
      const subscriptionSelected = profile?.connectionMode === 'subscription'
        && textId(profile.subscriptionId) === id;
      if (!subscriptionSelected && !nodeIds.has(textId(profile?.nodeId))) return profile;
      const next = { ...profile, connectionMode: 'direct', nodeId: null };
      if (subscriptionSelected) next.subscriptionId = null;
      return next;
    });
  state.subscriptions = (Array.isArray(state.subscriptions) ? state.subscriptions : [])
    .filter((item) => textId(item?.id) !== id)
    .map((item) => {
      if (!Array.isArray(item.nodeIds)) return item;
      return {
        ...item,
        nodeIds: item.nodeIds.filter((nodeId) => !nodeIds.has(textId(nodeId))),
      };
    });
  return nodeIds;
}

module.exports = {
  removeSubscriptionData,
  subscriptionNodeIds,
};
