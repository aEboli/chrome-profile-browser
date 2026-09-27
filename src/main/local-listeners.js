'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const { isIP } = require('node:net');

const HTML_PROBE_TIMEOUT_MS = 1000;
const HTML_PROBE_CONCURRENCY = 12;

function parseEndpoint(value) {
  const text = String(value || '');
  const match = text.match(/^\[(.+)\]:(\d+)$/) || text.match(/^([^:]+):(\d+)$/);
  if (!match) return null;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { address: match[1], port };
}

function formatUrlHost(address) {
  return address.includes(':') ? `[${address.replace(/%/g, '%25')}]` : address;
}

function loopbackHost(address) {
  const normalized = address.toLowerCase();
  if (normalized === '0.0.0.0') return '127.0.0.1';
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return '::1';
  return address;
}

function parseNetstatOutput(output) {
  const listeners = new Map();
  for (const line of String(output || '').split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || columns[0].toUpperCase() !== 'TCP' || columns[3].toUpperCase() !== 'LISTENING') continue;
    const endpoint = parseEndpoint(columns[1]);
    if (!endpoint || !/^\d+$/.test(columns[4])) continue;
    const pid = Number(columns[4]);
    if (!Number.isSafeInteger(pid)) continue;
    const key = `${pid}:${endpoint.address.toLowerCase()}:${endpoint.port}`;
    const host = loopbackHost(endpoint.address);
    listeners.set(key, {
      address: endpoint.address,
      urlHost: formatUrlHost(host),
      port: endpoint.port,
      pid,
    });
  }
  return [...listeners.values()].sort((a, b) => a.port - b.port || a.address.localeCompare(b.address) || a.pid - b.pid);
}

function parseProcessOutput(output) {
  const text = String(output || '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.flatMap((row) => {
    const pid = Number(row?.pid ?? row?.Pid ?? row?.ProcessId);
    if (!Number.isSafeInteger(pid)) return [];
    return [{
      pid,
      commandLine: String(row?.commandLine ?? row?.CommandLine ?? ''),
      executablePath: String(row?.executablePath ?? row?.ExecutablePath ?? ''),
      name: String(row?.name ?? row?.Name ?? ''),
    }];
  });
}

function projectRootFromCommandLine(commandLine) {
  const match = String(commandLine || '').match(/(?:^|["'\s])([a-z]:\\[^"'\r\n]*?)\\node_modules\\/i);
  return match ? path.win32.normalize(match[1]) : null;
}

function hasArgument(commandLine, argument) {
  return new RegExp(`(?:^|[\\s"'])${argument}(?=$|[\\s"'])`, 'i').test(commandLine);
}

function projectDeclaresTool(manifest, packageNames, scriptTokens = []) {
  const dependencies = new Set([
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.devDependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
  ]);
  const scripts = Object.values(manifest.scripts || {}).join(' ').toLowerCase();
  return packageNames.some((name) => dependencies.has(name))
    || scriptTokens.some((token) => scripts.includes(token));
}

function isFrontendServer(commandLine, manifest) {
  const command = String(commandLine || '').replace(/\\/g, '/').toLowerCase();
  if (command.includes('/node_modules/vite/')
    && !hasArgument(command, 'build')
    && !hasArgument(command, 'optimize')
    && projectDeclaresTool(manifest, ['vite', '@sveltejs/kit'], ['vite'])) return true;

  if (command.includes('/node_modules/next/dist/bin/next')
    && hasArgument(command, 'dev')
    && projectDeclaresTool(manifest, ['next'], ['next dev'])) return true;

  if ((command.includes('/node_modules/nuxi/bin/nuxi.') || command.includes('/node_modules/nuxt/bin/nuxt.'))
    && hasArgument(command, 'dev')
    && projectDeclaresTool(manifest, ['nuxt', 'nuxi'], ['nuxt dev', 'nuxi dev'])) return true;

  if (command.includes('/node_modules/@angular/cli/bin/ng.')
    && hasArgument(command, 'serve')
    && projectDeclaresTool(manifest, ['@angular/cli'])) return true;

  if (command.includes('/node_modules/@vue/cli-service/bin/vue-cli-service.')
    && hasArgument(command, 'serve')
    && projectDeclaresTool(manifest, ['@vue/cli-service'])) return true;

  if (command.includes('/node_modules/react-scripts/scripts/start.')
    && projectDeclaresTool(manifest, ['react-scripts'])) return true;

  if (command.includes('/node_modules/astro/')
    && hasArgument(command, 'dev')
    && projectDeclaresTool(manifest, ['astro'], ['astro dev'])) return true;

  if (command.includes('/node_modules/webpack-dev-server/')
    && projectDeclaresTool(manifest, ['webpack-dev-server'])) return true;

  if (command.includes('/node_modules/webpack-cli/')
    && hasArgument(command, 'serve')
    && projectDeclaresTool(manifest, ['webpack-cli'], ['webpack serve'])) return true;

  if (command.includes('/node_modules/parcel/')
    && !hasArgument(command, 'build')
    && projectDeclaresTool(manifest, ['parcel'], ['parcel'])) return true;

  return command.includes('/node_modules/@rsbuild/core/')
    && hasArgument(command, 'dev')
    && projectDeclaresTool(manifest, ['@rsbuild/core'], ['rsbuild dev']);
}

function readProjectManifest(projectRoot) {
  try {
    const text = fs.readFileSync(path.win32.join(projectRoot, 'package.json'), 'utf8');
    const manifest = JSON.parse(text);
    return manifest && typeof manifest === 'object' && !Array.isArray(manifest) ? manifest : null;
  } catch {
    return null;
  }
}

function resolveProcessProject(process) {
  const packageRoot = projectRootFromCommandLine(process?.commandLine);
  const manifest = packageRoot ? readProjectManifest(packageRoot) : null;
  const executablePath = String(process?.executablePath || '');
  const executableDirectory = executablePath ? path.win32.dirname(executablePath) : '';
  const root = packageRoot || executableDirectory;
  const processName = path.win32.parse(String(process?.name || '')).name;
  const name = typeof manifest?.name === 'string' && manifest.name.trim()
    ? manifest.name.trim()
    : path.win32.basename(root) || processName;
  if (!name) return null;
  return {
    root: root || `pid:${process?.pid}`,
    name,
    manifest,
  };
}

function resolveFrontendProject(commandLine, process = {}) {
  const project = resolveProcessProject({ ...process, commandLine });
  if (!project?.manifest || !isFrontendServer(commandLine, project.manifest)) return null;
  return { root: project.root, name: project.name };
}

function localProbeHost(address) {
  const host = loopbackHost(String(address || ''));
  return isIP(host.split('%')[0]) ? host : null;
}

function requestRootPage(transport, host, port, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let request;
    const timer = setTimeout(() => request?.destroy(new Error('Local page probe timed out')), timeoutMs);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      request = transport.get({
        hostname: host,
        port,
        path: '/',
        headers: { Accept: 'text/html' },
        rejectUnauthorized: false,
      }, (response) => {
        const contentType = String(response.headers['content-type'] || '');
        const isHtml = response.statusCode >= 200
          && response.statusCode < 300
          && /^\s*text\/html(?:\s*;|$)/i.test(contentType);
        response.on('error', () => {});
        response.destroy();
        finish({ responded: true, isHtml });
      });
      request.on('error', () => finish({ responded: false, isHtml: false }));
    } catch {
      finish({ responded: false, isHtml: false });
    }
  });
}

async function probeHtmlService(listener, { timeoutMs = HTML_PROBE_TIMEOUT_MS } = {}) {
  const host = localProbeHost(listener.address);
  if (!host) return null;
  const httpResult = await requestRootPage(http, host, listener.port, timeoutMs);
  if (httpResult.isHtml) return 'http';
  if (httpResult.responded) return null;
  const httpsResult = await requestRootPage(https, host, listener.port, timeoutMs);
  return httpsResult.isHtml ? 'https' : null;
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function discoverFrontendListeners(listeners, processes, probe = probeHtmlService) {
  const processByPid = new Map(processes.map((process) => [process.pid, process]));
  const projects = new Map();
  for (const listener of listeners) {
    const process = processByPid.get(listener.pid);
    if (!process) continue;
    const frontendProject = resolveFrontendProject(process.commandLine, process);
    const project = frontendProject || resolveProcessProject(process);
    if (!project) continue;
    const key = `${project.root.toLowerCase()}:${listener.port}`;
    let entry = projects.get(key);
    if (!entry) {
      entry = {
        projectRoot: project.root,
        address: listener.address,
        addresses: [],
        urlHost: listener.urlHost,
        port: listener.port,
        pid: listener.pid,
        projectName: project.name,
        shouldProbe: !frontendProject,
      };
      projects.set(key, entry);
    }
    if (frontendProject) entry.shouldProbe = false;
    entry.probeListeners ||= [];
    entry.probeListeners.push(listener);
    if (!entry.addresses.includes(listener.address)) entry.addresses.push(listener.address);
  }

  const pending = [...projects.values()].filter((entry) => entry.shouldProbe);
  const probeResults = await mapLimit(pending, HTML_PROBE_CONCURRENCY, async (entry) => {
    for (const listener of entry.probeListeners) {
      const scheme = await probe(listener);
      if (scheme) return scheme;
    }
    return null;
  });
  pending.forEach((entry, index) => {
    entry.detectedScheme = probeResults[index];
  });

  return [...projects.values()]
    .filter((entry) => !entry.shouldProbe || entry.detectedScheme)
    .sort((a, b) => a.port - b.port || a.projectName.localeCompare(b.projectName))
    .map(({ projectRoot, shouldProbe, probeListeners, detectedScheme, ...entry }) => entry);
}

function execFileText(file, args, errorPrefix, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    }, (error, stdout) => {
      if (error) {
        reject(new Error(`${errorPrefix}${error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function listLocalTcpListeners() {
  const netstat = await execFileText('netstat.exe', ['-ano', '-p', 'tcp'], '读取本地监听端口失败：');
  const listeners = parseNetstatOutput(netstat);
  if (!listeners.length) return [];

  const pids = [...new Set(listeners.map((listener) => listener.pid))];
  const filter = pids.map((pid) => `ProcessId=${pid}`).join(' OR ');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$utf8 = New-Object System.Text.UTF8Encoding($false)',
    '[Console]::OutputEncoding = $utf8',
    '$OutputEncoding = $utf8',
    `$rows = @(Get-CimInstance -ClassName Win32_Process -Filter '${filter}' | Select-Object @{Name='pid';Expression={$_.ProcessId}}, @{Name='commandLine';Expression={$_.CommandLine}}, @{Name='executablePath';Expression={$_.ExecutablePath}}, @{Name='name';Expression={$_.Name}})`,
    'ConvertTo-Json -InputObject $rows -Compress -Depth 2',
  ].join('; ');
  const processOutput = await execFileText(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    '读取本地进程信息失败：',
    10000,
  );
  let processes;
  try {
    processes = parseProcessOutput(processOutput);
  } catch (error) {
    throw new Error(`解析本地进程信息失败：${error.message}`);
  }
  return discoverFrontendListeners(listeners, processes);
}

async function stopLocalListener(input = {}) {
  const pid = Number(input?.pid);
  const port = Number(input?.port);
  const projectName = String(input?.projectName || '').trim();
  if (!Number.isSafeInteger(pid) || pid < 1 || !Number.isSafeInteger(port) || port < 1 || port > 65535
    || !projectName || projectName.length > 256) {
    throw new Error('本地服务标识无效');
  }

  const listeners = await listLocalTcpListeners();
  const target = listeners.find((listener) => listener.pid === pid
    && listener.port === port
    && listener.projectName === projectName);
  if (!target) throw new Error('本地服务已不存在或信息已变化，请刷新后重试');

  await execFileText(
    'taskkill.exe',
    ['/PID', String(pid), '/T', '/F'],
    '停止本地服务失败：',
    10000,
  );
  return { pid, port };
}

module.exports = {
  discoverFrontendListeners,
  listLocalTcpListeners,
  parseNetstatOutput,
  parseProcessOutput,
  probeHtmlService,
  resolveFrontendProject,
  stopLocalListener,
};
