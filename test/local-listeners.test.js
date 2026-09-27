const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {
  discoverFrontendListeners,
  parseNetstatOutput,
  parseProcessOutput,
  probeHtmlService,
  resolveFrontendProject,
} = require('../src/main/local-listeners');

async function startHttpServer(handler) {
  const server = http.createServer(handler);
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: server.address().port };
}

async function closeHttpServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

test('parses, sorts, and deduplicates Windows TCP listeners', () => {
  const output = [
    'Active Connections',
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234',
    '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234',
    '  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       1234',
    '  TCP    [::]:8080              [::]:0                 LISTENING       5678',
    '  TCP    127.0.0.1:3001         127.0.0.1:55555        ESTABLISHED     1234',
    '  TCP    127.0.0.1:3002         0.0.0.0:0              LISTENING       invalid',
    '  UDP    0.0.0.0:5353           *:*                                    4321',
    '  TCP    127.0.0.1:70000        0.0.0.0:0              LISTENING       9876',
  ].join('\r\n');

  assert.deepEqual(parseNetstatOutput(output), [
    { address: '0.0.0.0', urlHost: '127.0.0.1', port: 3000, pid: 1234 },
    { address: '127.0.0.1', urlHost: '127.0.0.1', port: 3000, pid: 1234 },
    { address: '::', urlHost: '[::1]', port: 8080, pid: 5678 },
  ]);
});

test('parses process metadata returned by PowerShell', () => {
  assert.deepEqual(parseProcessOutput('{"pid":1234,"commandLine":"node vite"}'), [
    { pid: 1234, commandLine: 'node vite', executablePath: '', name: '' },
  ]);
  assert.deepEqual(parseProcessOutput('[{"ProcessId":1234,"CommandLine":"node vite","ExecutablePath":"C:\\\\node.exe","Name":"node.exe"}]'), [
    { pid: 1234, commandLine: 'node vite', executablePath: 'C:\\node.exe', name: 'node.exe' },
  ]);
  assert.deepEqual(parseProcessOutput(''), []);
});

test('keeps recognized frontend projects and merges their multiple bind addresses', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-listener-projects-'));
  try {
    const frontendRoot = path.join(tempRoot, 'frontend-dashboard');
    const backendRoot = path.join(tempRoot, 'backend-api');
    const unknownRoot = path.join(tempRoot, 'unknown-frontend');
    for (const root of [frontendRoot, backendRoot, unknownRoot]) fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(frontendRoot, 'package.json'), JSON.stringify({
      name: '@demo/dashboard',
      devDependencies: { vite: '^6.0.0' },
    }));
    fs.writeFileSync(path.join(backendRoot, 'package.json'), JSON.stringify({
      name: 'backend-api',
      dependencies: { express: '^5.0.0' },
    }));

    const listeners = [
      { address: '0.0.0.0', urlHost: '127.0.0.1', port: 5173, pid: 101 },
      { address: '127.0.0.1', urlHost: '127.0.0.1', port: 5173, pid: 101 },
      { address: '127.0.0.1', urlHost: '127.0.0.1', port: 3000, pid: 202 },
      { address: '0.0.0.0', urlHost: '127.0.0.1', port: 8080, pid: 303 },
      { address: '0.0.0.0', urlHost: '127.0.0.1', port: 9000, pid: 4 },
    ];
    const processes = [
      {
        pid: 101,
        commandLine: `"C:\\Program Files\\nodejs\\node.exe" "${path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')}" --host 0.0.0.0`,
      },
      {
        pid: 202,
        commandLine: `"C:\\Program Files\\nodejs\\node.exe" "${path.join(backendRoot, 'node_modules', 'express', 'index.js')}"`,
      },
      {
        pid: 303,
        commandLine: `"C:\\Program Files\\nodejs\\node.exe" "${path.join(unknownRoot, 'node_modules', 'vite', 'bin', 'vite.js')}" --host`,
      },
      { pid: 4, commandLine: 'C:\\Windows\\System32\\svchost.exe -k netsvcs' },
    ];

    assert.deepEqual(await discoverFrontendListeners(listeners, processes, async () => null), [{
      address: '0.0.0.0',
      addresses: ['0.0.0.0', '127.0.0.1'],
      urlHost: '127.0.0.1',
      port: 5173,
      pid: 101,
      projectName: '@demo/dashboard',
    }]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('recognizes local HTML interfaces, excludes JSON and does not follow redirects', async () => {
  const htmlServer = await startHttpServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Local UI</title>');
  });
  try {
    assert.equal(await probeHtmlService({ address: '127.0.0.1', port: htmlServer.port }), 'http');
  } finally {
    await closeHttpServer(htmlServer.server);
  }

  const jsonServer = await startHttpServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"ok":true}');
  });
  try {
    assert.equal(await probeHtmlService({ address: '127.0.0.1', port: jsonServer.port }), null);
  } finally {
    await closeHttpServer(jsonServer.server);
  }

  let requestCount = 0;
  const redirectServer = await startHttpServer((_request, response) => {
    requestCount += 1;
    response.writeHead(302, { Location: 'http://127.0.0.1:1/' });
    response.end();
  });
  try {
    assert.equal(await probeHtmlService({ address: '127.0.0.1', port: redirectServer.port }), null);
    assert.equal(requestCount, 1);
  } finally {
    await closeHttpServer(redirectServer.server);
  }
});

test('stops probing a local service that does not return headers in time', async () => {
  let responseTimer;
  const server = await startHttpServer((_request, response) => {
    responseTimer = setTimeout(() => response.end('<html></html>'), 1000);
  });
  try {
    const startedAt = Date.now();
    assert.equal(await probeHtmlService({ address: '127.0.0.1', port: server.port }, { timeoutMs: 50 }), null);
    assert.ok(Date.now() - startedAt < 500);
  } finally {
    clearTimeout(responseTimer);
    await closeHttpServer(server.server);
  }
});

test('shows a non-Node service when its local root page serves HTML', async () => {
  const server = await startHttpServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<html><title>Sub2API</title></html>');
  });
  try {
    assert.deepEqual(await discoverFrontendListeners([{
      address: '127.0.0.1',
      urlHost: '127.0.0.1',
      port: server.port,
      pid: 7001,
    }], [{
      pid: 7001,
      commandLine: '"C:\\Apps\\Sub2api-MoonStars\\sub2api.exe"',
      executablePath: 'C:\\Apps\\Sub2api-MoonStars\\sub2api.exe',
      name: 'sub2api.exe',
    }]), [{
      address: '127.0.0.1',
      addresses: ['127.0.0.1'],
      urlHost: '127.0.0.1',
      port: server.port,
      pid: 7001,
      projectName: 'Sub2api-MoonStars',
    }]);
  } finally {
    await closeHttpServer(server.server);
  }
});

test('recognizes the supported frontend server launchers', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-listener-frameworks-'));
  const cases = [
    { name: 'next-app', dependency: 'next', entry: ['next', 'dist', 'bin', 'next'], args: 'dev' },
    { name: 'nuxt-app', dependency: 'nuxt', entry: ['nuxi', 'bin', 'nuxi.mjs'], args: 'dev' },
    { name: 'angular-app', dependency: '@angular/cli', entry: ['@angular', 'cli', 'bin', 'ng.js'], args: 'serve' },
    { name: 'vue-app', dependency: '@vue/cli-service', entry: ['@vue', 'cli-service', 'bin', 'vue-cli-service.js'], args: 'serve' },
    { name: 'react-app', dependency: 'react-scripts', entry: ['react-scripts', 'scripts', 'start.js'], args: '' },
    { name: 'astro-app', dependency: 'astro', entry: ['astro', 'cli.js'], args: 'dev' },
    { name: 'svelte-app', dependency: '@sveltejs/kit', entry: ['vite', 'bin', 'vite.js'], args: 'dev' },
    { name: 'webpack-server', dependency: 'webpack-dev-server', entry: ['webpack-dev-server', 'bin', 'webpack-dev-server.js'], args: '' },
    { name: 'webpack-cli-app', dependency: 'webpack-cli', entry: ['webpack-cli', 'bin', 'cli.js'], args: 'serve' },
    { name: 'parcel-app', dependency: 'parcel', entry: ['parcel', 'lib', 'bin.js'], args: 'src/index.html' },
    { name: 'rsbuild-app', dependency: '@rsbuild/core', entry: ['@rsbuild', 'core', 'bin', 'rsbuild.js'], args: 'dev' },
  ];

  try {
    for (const item of cases) {
      const projectRoot = path.join(tempRoot, item.name);
      fs.mkdirSync(projectRoot, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
        name: item.name,
        devDependencies: { [item.dependency]: '1.0.0' },
      }));
      const entryPath = path.join(projectRoot, 'node_modules', ...item.entry);
      const commandLine = `"C:\\Program Files\\nodejs\\node.exe" "${entryPath}" ${item.args}`.trim();
      assert.equal(resolveFrontendProject(commandLine)?.name, item.name, item.name);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('falls back to the project directory when package.json has no name', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-listener-project-'));
  try {
    const projectRoot = path.join(tempRoot, 'my-frontend');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
      devDependencies: { vite: '^6.0.0' },
    }));
    const commandLine = `"C:\\Program Files\\nodejs\\node.exe" "${path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')}" --host`;
    assert.deepEqual(resolveFrontendProject(commandLine), { root: projectRoot, name: 'my-frontend' });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('browser shell exposes local listeners through its profile IPC and active tab navigation', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'main', 'browser-shell-preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'browser-shell.js'), 'utf8');

  assert.match(main, /browser-shell:get-local-listeners/);
  assert.match(main, /browser-shell:stop-local-listener/);
  assert.match(preload, /getLocalListeners:/);
  assert.match(preload, /stopLocalListener:/);
  assert.match(html, /id="local-listeners-toggle"/);
  assert.match(html, /id="local-listeners-panel"/);
  assert.match(html, /id="local-listeners-scheme"/);
  assert.match(html, /当前没有可识别的前端项目端口/);
  assert.match(renderer, /function refreshLocalListeners\(/);
  assert.match(renderer, /local-listener-project-name/);
  assert.match(renderer, /local-listener-stop/);
  assert.match(renderer, /requestShellConfirmation/);
  assert.match(renderer, /找到 \$\{localListeners.length\} 个前端项目端口/);
  assert.match(renderer, /function openLocalListener\(index\)[\s\S]*?navigateAddress\(/);
});
