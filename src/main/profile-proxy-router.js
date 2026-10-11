'use strict';

const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildUpstreamProxyUrl(node, coreRuntime = null) {
  if (coreRuntime) return `socks5h://127.0.0.1:${coreRuntime.port}`;
  if (!node) throw new Error('订阅自动线路无效');

  const protocol = safeText(node.protocol).toLowerCase();
  const scheme = protocol === 'http' && node.tls
    ? 'https'
    : protocol === 'socks5'
      ? 'socks5h'
      : protocol;
  if (!['http', 'https', 'socks5h'].includes(scheme)) {
    throw new Error(`订阅自动暂不支持 ${protocol || '未知'} 节点`);
  }
  const host = safeText(node.host);
  const port = Number(node.port);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('订阅自动线路地址无效');
  }
  const uriHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  let proxyUrl;
  try {
    proxyUrl = new URL(`${scheme}://${uriHost}:${port}`);
  } catch {
    throw new Error('订阅自动线路地址无效');
  }
  if (node.username) proxyUrl.username = String(node.username);
  if (node.password) proxyUrl.password = String(node.password);
  return proxyUrl.toString();
}

async function createProfileProxyRouter(initialRoute) {
  const { Server } = await import('proxy-chain');
  const events = new EventEmitter();
  const httpAgent = new http.Agent({ keepAlive: false, maxFreeSockets: 0 });
  const httpsAgent = new https.Agent({ keepAlive: false, maxFreeSockets: 0 });
  const connectionRuntimes = new Map();
  const runtimeReferences = new Map();
  const retiredRuntimes = new Set();
  let currentRoute = initialRoute;
  let closed = false;

  if (!safeText(currentRoute?.upstreamProxyUrl)) throw new Error('订阅自动线路无效');

  const releaseRuntime = (runtime) => {
    const references = runtimeReferences.get(runtime) || 0;
    if (references <= 1) {
      runtimeReferences.delete(runtime);
      if (retiredRuntimes.delete(runtime)) events.emit('core-runtime-idle', runtime);
    } else {
      runtimeReferences.set(runtime, references - 1);
    }
  };
  const server = new Server({
    host: '127.0.0.1',
    port: 0,
    verbose: false,
    prepareRequestFunction: ({ connectionId }) => {
      const route = currentRoute;
      if (route.coreRuntime && !closed) {
        const runtimes = connectionRuntimes.get(connectionId) || new Set();
        if (!runtimes.has(route.coreRuntime)) {
          runtimes.add(route.coreRuntime);
          runtimeReferences.set(route.coreRuntime, (runtimeReferences.get(route.coreRuntime) || 0) + 1);
          connectionRuntimes.set(connectionId, runtimes);
        }
      }
      return {
        upstreamProxyUrl: route.upstreamProxyUrl,
        requestAuthentication: false,
        httpAgent,
        httpsAgent,
      };
    },
  });
  server.on('connectionClosed', ({ connectionId }) => {
    const runtimes = connectionRuntimes.get(connectionId);
    if (!runtimes) return;
    connectionRuntimes.delete(connectionId);
    for (const runtime of runtimes) releaseRuntime(runtime);
  });
  await server.listen();

  return {
    port: server.port,
    proxyUrl: `http://127.0.0.1:${server.port}`,
    setRoute(route) {
      if (closed || !safeText(route?.upstreamProxyUrl)) throw new Error('订阅自动转发器已关闭');
      const previousRoute = currentRoute;
      currentRoute = route;
      return previousRoute;
    },
    retireCoreRuntime(runtime) {
      if (!runtime) return;
      retiredRuntimes.add(runtime);
      if (!runtimeReferences.has(runtime)) {
        retiredRuntimes.delete(runtime);
        events.emit('core-runtime-idle', runtime);
      }
    },
    isCoreRuntimeInUse(runtime) {
      return (runtimeReferences.get(runtime) || 0) > 0;
    },
    on: events.on.bind(events),
    async close() {
      if (closed) return;
      closed = true;
      try {
        await server.close(true);
      } finally {
        httpAgent.destroy();
        httpsAgent.destroy();
        connectionRuntimes.clear();
        runtimeReferences.clear();
        retiredRuntimes.clear();
        events.removeAllListeners();
      }
    },
  };
}

module.exports = { buildUpstreamProxyUrl, createProfileProxyRouter };
