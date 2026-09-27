'use strict';

const crypto = require('node:crypto');
const { fetch: undiciFetch, ProxyAgent, Socks5ProxyAgent } = require('undici');

function formatProxyHost(value) {
  const host = String(value || '').trim();
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function proxyUriForNode(node) {
  if (!node || node.requiresCore || node.coreConfig) return '';
  const protocol = String(node.protocol || '').toLowerCase();
  const rawHost = String(node.host || '').trim();
  const port = Number(node.port);
  if (!rawHost || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('商店请求节点地址无效');
  }
  let parsedHost;
  try {
    parsedHost = new URL(`http://${formatProxyHost(rawHost)}`);
  } catch {
    throw new Error('商店请求节点地址无效');
  }
  if (parsedHost.username || parsedHost.password || parsedHost.port || parsedHost.pathname !== '/' || parsedHost.search || parsedHost.hash) {
    throw new Error('商店请求节点地址无效');
  }
  let scheme;
  if (protocol === 'socks5') scheme = 'socks5';
  else if (protocol === 'http') scheme = node.tls ? 'https' : 'http';
  else if (protocol === 'https') scheme = 'https';
  else throw new Error(`商店请求不支持 ${protocol || '未知'} 节点`);

  const url = new URL(`${scheme}://proxy.invalid`);
  url.hostname = parsedHost.hostname;
  url.port = String(port);
  if (node.username) url.username = String(node.username);
  if (node.password) url.password = String(node.password);
  return url.toString();
}

function selectRandomReachableNode(nodes, results, randomInt = crypto.randomInt) {
  const reachableIds = new Set(
    (Array.isArray(results) ? results : [])
      .filter((result) => result?.ok === true || result?.reachable === true)
      .map((result) => String(result.nodeId || '')),
  );
  const reachable = (Array.isArray(nodes) ? nodes : [])
    .filter((node) => node?.id && reachableIds.has(String(node.id)));
  if (!reachable.length) throw new Error('没有可联通的代理节点，无法连接 Chrome Web Store');
  return reachable[randomInt(reachable.length)];
}

function createExtensionStoreProxyDispatcher(node, factories = {}) {
  const uri = proxyUriForNode(node);
  if (!uri) return null;
  const protocol = new URL(uri).protocol;
  const Proxy = factories.ProxyAgent || ProxyAgent;
  const Socks5 = factories.Socks5ProxyAgent || Socks5ProxyAgent;
  return protocol === 'socks5:' ? new Socks5(uri) : new Proxy({ uri });
}

async function withExtensionStoreProxy(node, operation, options = {}) {
  const fetchImpl = options.fetchImpl || undiciFetch;
  if (!node) return operation(fetchImpl);

  let runtime;
  let dispatcher;
  try {
    let proxyNode = node;
    if (node.requiresCore || node.coreConfig) {
      if (typeof options.startCore !== 'function') throw new Error('商店请求核心代理未配置');
      runtime = await options.startCore(node);
      proxyNode = { protocol: 'socks5', host: '127.0.0.1', port: runtime?.port };
    }
    dispatcher = createExtensionStoreProxyDispatcher(proxyNode, options.factories);
    const request = (url, init = {}) => fetchImpl(url, {
      ...init,
      dispatcher,
      signal: init.signal || AbortSignal.timeout(45000),
    });
    return await operation(request);
  } finally {
    try {
      if (dispatcher && typeof dispatcher.close === 'function') await dispatcher.close();
    } finally {
      if (runtime && typeof options.stopCore === 'function') await options.stopCore(runtime);
    }
  }
}

module.exports = {
  createExtensionStoreProxyDispatcher,
  proxyUriForNode,
  selectRandomReachableNode,
  withExtensionStoreProxy,
};
