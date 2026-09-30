const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const actions = require('../src/renderer/browser-agent-actions');

const rendererRoot = path.join(__dirname, '..', 'src', 'renderer');

test('parses the supported browser agent commands', () => {
  assert.deepEqual(actions.parseCommand('读取当前页面').kind, 'page');
  assert.deepEqual(actions.parseCommand('收集网页链接').kind, 'links');
  assert.deepEqual(actions.parseCommand('提取表格').kind, 'tables');
  assert.deepEqual(actions.parseCommand('滚动到底部').kind, 'bottom');
  assert.deepEqual(actions.parseCommand('打开 example.com'), { kind: 'open', label: '打开页面', url: 'example.com' });
  assert.deepEqual(actions.parseCommand('点击选择器 #submit'), { kind: 'click', label: '点击元素', selector: '#submit' });
  assert.deepEqual(actions.parseCommand('填写选择器 input[name=q]：测试词'), {
    kind: 'fill', label: '填写元素', selector: 'input[name=q]', value: '测试词',
  });
  assert.deepEqual(actions.parseCommand('填写选择器 input[name=q]:测试词'), {
    kind: 'fill', label: '填写元素', selector: 'input[name=q]', value: '测试词',
  });
  assert.deepEqual(actions.parseCommand('点击坐标 120,240'), {
    kind: 'input', label: '点击页面坐标（120, 240）', inputAction: { type: 'click', x: 120, y: 240, button: 'left' },
  });
  assert.deepEqual(actions.parseCommand('按键 Ctrl+L'), {
    kind: 'input', label: '按键 Ctrl+L', inputAction: { type: 'keypress', keys: 'Ctrl+L' },
  });
  assert.deepEqual(actions.parseCommand('输入文本 测试词'), {
    kind: 'input', label: '输入文字（3 字）', inputAction: { type: 'type', text: '测试词' },
  });
  assert.deepEqual(actions.parseCommand('滚动坐标 120,240：0,600'), {
    kind: 'input', label: '在页面坐标（120, 240）向下滚动 600px', inputAction: { type: 'scroll', x: 120, y: 240, deltaX: 0, deltaY: 600 },
  });
});

test('describes pointer and keyboard actions with their concrete parameters', () => {
  assert.equal(actions.actionLabel({ type: 'click', x: 420, y: 260 }), '点击页面坐标（420, 260）');
  assert.equal(actions.actionLabel({ type: 'click', x: 420, y: 260, button: 'right' }), '右键点击页面坐标（420, 260）');
  assert.equal(actions.actionLabel({ type: 'keypress', keys: ['Control', 'L'] }), '按键 Ctrl+L');
  assert.equal(actions.actionLabel({ type: 'type', text: 'secret text' }), '输入文字（11 字）');
});

test('normalizes valid computer-use actions without fixed application caps', () => {
  assert.deepEqual(actions.normalizeAgentAction({ type: 'double_click', x: 10, y: 20 }), {
    type: 'click', x: 10, y: 20, button: 'left', clickCount: 2,
  });
  assert.deepEqual(actions.normalizeAgentAction({ type: 'right_click', x: 10, y: 20 }), {
    type: 'click', x: 10, y: 20, button: 'right', clickCount: 1,
  });
  assert.deepEqual(actions.normalizeAgentAction({ action: { type: 'click', coordinate: [10, 20] } }), {
    type: 'click', x: 10, y: 20, button: 'left', clickCount: 1,
  });
  assert.deepEqual(actions.normalizeAgentAction({ type: 'scroll', x: 10, y: 20, scroll_y: 600 }), {
    type: 'scroll', x: 10, y: 20, deltaX: 0, deltaY: 600,
  });
  assert.deepEqual(actions.normalizeAgentAction({ type: 'drag', path: [[1, 2], [4, 5]] }), {
    type: 'drag', path: [{ x: 1, y: 2 }, { x: 4, y: 5 }], button: 'left',
  });
  assert.deepEqual(actions.normalizeAgentAction({ type: 'drag', from_x: 1, from_y: 2, to_x: 4, to_y: 5 }), {
    type: 'drag', path: [{ x: 1, y: 2 }, { x: 4, y: 5 }], button: 'left',
  });
  assert.deepEqual(actions.keyPressEvents(['CTRL', 'L']), [
    { type: 'rawKeyDown', keyCode: 'Control' },
    { type: 'rawKeyDown', keyCode: 'L' },
    { type: 'char', keyCode: 'L' },
    { type: 'keyUp', keyCode: 'L' },
    { type: 'keyUp', keyCode: 'Control' },
  ]);
  assert.throws(() => actions.normalizeAgentAction({ type: 'click', x: -1, y: 10 }), /无效/);
  assert.throws(() => actions.normalizeAgentAction({ type: 'scroll', x: 1, y: 1 }), /不能为零/);
  assert.equal(actions.normalizeAgentAction({ type: 'click', x: 10001, y: 10002, clickCount: 4 }).clickCount, 4);
  assert.equal(actions.normalizeAgentAction({ type: 'type', text: 'x'.repeat(4001) }).text.length, 4001);
  assert.equal(actions.normalizeAgentAction({ type: 'scroll', x: 1, y: 1, deltaY: 5001 }).deltaY, 5001);
  assert.equal(actions.normalizeAgentAction({ type: 'wait', ms: 5001 }).ms, 5001);
  assert.equal(actions.normalizeAgentAction({ type: 'drag', path: Array.from({ length: 33 }, (_, index) => [index, index]) }).path.length, 33);
  assert.equal(actions.normalizeAgentAction({ type: 'keypress', keys: [...'ABCDEFGHI'] }).keys.length, 9);
  const shell = fs.readFileSync(path.join(rendererRoot, 'browser-shell.js'), 'utf8');
  assert.match(shell, /function boundedAgentPoint\(point, viewport[\s\S]*?x >= viewport\.width \|\| y >= viewport\.height/);
});

test('preserves long selectors and values through instruction and action templates', () => {
  const selector = `#${'x'.repeat(600)}`;
  const value = 'y'.repeat(2400);
  assert.deepEqual(actions.parseCommand(`点击选择器 ${selector}`), { kind: 'click', label: '点击元素', selector });
  assert.deepEqual(actions.parseCommand(`填写选择器 ${selector}：${value}`), { kind: 'fill', label: '填写元素', selector, value });

  let receivedSelector = '';
  let receivedValue = '';
  const context = {
    document: {
      querySelector(next) {
        receivedSelector = next;
        return { tagName: 'INPUT', focus() {}, dispatchEvent() {}, set value(nextValue) { receivedValue = nextValue; } };
      },
    },
    Event: function Event() {},
  };
  vm.runInNewContext(actions.fillScript(selector, value), context);
  assert.equal(receivedSelector, selector);
  assert.equal(receivedValue, value);
});

test('keeps selector and fill values as data in fixed page action scripts', () => {
  const maliciousSelector = '"); window.__agentInjected = true; //';
  let receivedSelector = '';
  const context = {
    document: {
      querySelector(value) {
        receivedSelector = value;
        return null;
      },
    },
  };

  vm.runInNewContext(actions.clickScript(maliciousSelector), context);
  assert.equal(receivedSelector, maliciousSelector);
  assert.equal(context.window, undefined);

  const fillScript = actions.fillScript(maliciousSelector, '"); window.__agentInjected = true; //');
  receivedSelector = '';
  vm.runInNewContext(fillScript, context);
  assert.equal(receivedSelector, maliciousSelector);
});

test('limits collected page payloads and uses fixed operation templates', () => {
  assert.match(actions.pageReadScript(), /12000/);
  assert.match(actions.linksScript(), /slice\(0, 80\)/);
  assert.match(actions.tablesScript(), /slice\(0, 8\)/);
  assert.match(actions.scrollScript('bottom'), /scrollTo/);
  assert.doesNotMatch(actions.pageReadScript(), /executeJavaScript|eval\s*\(/);

  const page = {
    title: '测试页',
    body: { innerText: '页面正文' },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const context = { document: page, location: { href: 'https://example.test/' }, window: { scrollTo() {} } };
  assert.equal(JSON.stringify(vm.runInNewContext(actions.pageReadScript(), context)), JSON.stringify({
    title: '测试页', url: 'https://example.test/', description: '', text: '页面正文',
  }));
  assert.equal(JSON.stringify(vm.runInNewContext(actions.linksScript(), context)), '[]');
  assert.equal(JSON.stringify(vm.runInNewContext(actions.tablesScript(), context)), '[]');
});

test('detects human verification pages without attempting to solve them', () => {
  const challengeContext = {
    document: {
      title: '登录',
      body: { innerText: '确认你是真人后继续' },
      querySelectorAll: () => [],
    },
    location: { href: 'https://example.test/login' },
  };
  const challenge = vm.runInNewContext(actions.humanVerificationScript(), challengeContext);
  assert.equal(challenge.required, true);
  assert.equal(challenge.reason, 'human-verification-marker');

  const normalContext = {
    document: {
      title: '普通页面',
      body: { innerText: '欢迎访问测试页面' },
      querySelectorAll: () => [],
    },
    location: { href: 'https://example.test/home' },
  };
  const normal = vm.runInNewContext(actions.humanVerificationScript(), normalContext);
  assert.equal(normal.required, false);
});

test('renders the robot entry and docked conversation panel in the browser shell', () => {
  const html = fs.readFileSync(path.join(rendererRoot, 'browser-shell.html'), 'utf8');
  const css = fs.readFileSync(path.join(rendererRoot, 'browser-shell.css'), 'utf8');
  const shell = fs.readFileSync(path.join(rendererRoot, 'browser-shell.js'), 'utf8');
  assert.match(html, /id="agent-toggle"/);
  assert.match(html, /id="agent-panel"/);
  assert.match(html, /id="agent-settings-toggle"/);
  assert.match(html, /id="agent-setting-protocol"/);
  assert.match(html, /id="agent-setting-context"/);
  assert.match(html, /id="agent-setting-reasoning"/);
  assert.match(html, /id="agent-setting-steps"/);
  assert.match(html, /id="extensions-panel"/);
  assert.match(html, /id="extensions-status"[^>]*role="alert"/);
  assert.match(html, /class="browser-settings-legacy-agent" hidden/);
  assert.match(html, /browser-agent-actions\.js/);
  assert.match(html, /agent-retry\.js/);
  assert.match(html, /agent-completion\.js/);
  assert.doesNotMatch(html, /agent-quick-actions/);
  assert.doesNotMatch(html, /agent-queue-send/);
  assert.doesNotMatch(html, /agent-send-now/);
  assert.match(html, /id="agent-context-usage"[^>]*aria-live="polite"/);
  assert.match(html, /script src="agent-context-usage\.js"/);
  assert.match(html, /id="agent-model-summary"[^>]*aria-controls="agent-model-picker"/);
  assert.match(html, /id="agent-model-options"/);
  assert.match(html, /id="agent-human-verification"/);
  assert.match(html, /id="agent-human-verification-resume"/);
  assert.match(html, /shell-icon-mouse/);
  assert.match(css, /\.browser-stage\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.agent-panel\s*\{[^}]*border-left/s);
  assert.match(css, /\.agent-input-status\s*\{/);
  assert.match(css, /\.agent-composer-footer \{[^}]*margin-left:\s*auto/);
  assert.match(css, /\.agent-composer-footer,\s*\n\.agent-model-summary,\s*\n\.agent-context-usage,\s*\n\.agent-send \{ height: 28px; \}/);
  assert.match(css, /\.browser-settings-legacy-agent\s*\{\s*display:\s*none/);
  assert.match(shell, /openai-responses/);
  assert.match(shell, /OpenAI Responses/);
  assert.match(shell, /agentReasoningEffort/);
  assert.match(shell, /\$\{model\} · \${reasoning}/);
  assert.match(shell, /function agentContextUsagePercent\(/);
  assert.match(shell, /agentContextUsageUtils\.formatTokenCount\(usedTokens, 1\)/);
  assert.match(shell, /上下文使用量 \$\{tokenUsage\}（\$\{percent\}%\），点击压缩/);
  assert.match(shell, /function requestAgentContextCompression\(/);
  assert.match(shell, /function waitForAgentAction\(/);
  assert.match(shell, /signal\?\.addEventListener\('abort', onAbort/);
  assert.doesNotMatch(shell, /maxActionsPerBatch/);
  assert.doesNotMatch(shell, /单批最多执行/);
  assert.match(shell, /上下文使用量低于 50%/);
  assert.match(shell, /jev_decide/);
  assert.match(shell, /function judgeAgentCompletion\(/);
  assert.match(shell, /ranPageTool && !agentStopRequested && browserSettings\.jevAutoJudgeEnabled !== false/);
  assert.match(shell, /if \(browserSettings\.jevAutoJudgeEnabled === false\) throw new Error\('JEV 模型未启用'\)/);
  assert.match(shell, /taskActionHistory = agentCompletion\.appendActionHistory/);
  assert.match(shell, /actions: taskActionHistory\.actions/);
  assert.match(shell, /earlierActionCount: taskActionHistory\.omittedCount/);
  assert.match(shell, /retryModelTool\(/);
  assert.match(shell, /finalize: finalizing/);
  assert.match(shell, /置信度/);
  assert.match(shell, /data-extension-open/);
  assert.match(shell, /openExtensionPanel/);
  assert.match(shell, /setExtensionPanelStatus/);
  assert.match(shell, /本轮已停止，工具未执行/);
  assert.match(shell, /fetchAgentModels/);
  assert.match(shell, /agentTaskQueue/);
  assert.match(shell, /ensureModelActionAllowed/);
  assert.match(shell, /不会代替你识别或提交验证/);
  assert.match(shell, /setInterval\(\(\) => \{\s*void resumeHumanVerification\(\{ silent: true \}\)/);
  assert.match(shell, /scheduleAgentTask/);
  assert.match(css, /agent-send-progress/);
  assert.match(css, /agent-send.is-busy:hover \.agent-send-progress/);
  assert.match(shell, /if \(runId === agentRunSequence\) \{[\s\S]*?agentStopRequested = false;[\s\S]*?setAgentBusy\(/);
});

test('exposes a model-ready browser agent bridge without arbitrary script execution', () => {
  const shell = fs.readFileSync(path.join(rendererRoot, 'browser-shell.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'browser-shell-preload.js'), 'utf8');
  const managerPreload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.js'), 'utf8');
  const managerRenderer = fs.readFileSync(path.join(rendererRoot, 'renderer.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.match(shell, /window\.browserAgent\s*=\s*Object\.freeze/);
  assert.match(shell, /protocol: 'browser-agent\.v1'/);
  assert.match(shell, /executeBatch/);
  assert.match(shell, /sendInputEvent/);
  assert.match(shell, /capturePage/);
  assert.match(preload, /observeAgent/);
  assert.match(preload, /getAgentCapabilities/);
  assert.match(preload, /executeAgentBatch/);
  assert.match(preload, /fetchAgentModels/);
  assert.match(preload, /openExtensionPanel/);
  assert.match(main, /browser-shell:agent-execute/);
  assert.match(main, /\|\| await loadSessionExtension\(profileKey, profileSession, record\)/);
  assert.match(main, /browser-shell:agent-chat/);
  assert.match(main, /browser-shell:agent-models/);
  assert.match(main, /browser-shell:jev-decision/);
  assert.match(shell, /agentRequestCancel\?\.\(\)/);
  assert.match(preload, /cancelAgentRequest: \(requestId\)/);
  assert.match(preload, /chatAgent: \(input, onRequestId\)/);
  assert.match(preload, /fetchAgentModels: \(input, onRequestId\)/);
  assert.match(managerPreload, /fetchAgentModels: \(payload, onRequestId\)/);
  assert.match(managerPreload, /testAgentConnection: \(payload, onRequestId\)/);
  assert.match(managerRenderer, /function cancelAgentModelFetch\(/);
  assert.match(managerRenderer, /cancelAgentRequest\?\.\(agentConnectionTestRequestId\)/);
  assert.match(main, /browser-shell:agent-request-cancel/);
  assert.match(main, /async function runAgentRequest\(/);
  assert.match(main, /requestAgentModels\(profileId, input, \{ cancelSignal: signal \}\)/);
  assert.match(main, /requestAgentModel\(profileId, input, signal\)/);
  assert.match(main, /requestAgentModelStream\(profileId, input, \(delta\) => send\(delta\), controller\.signal\)/);
  assert.match(main, /runAgentRequest\(event\.sender, input\?\.requestId, \(signal\) => requestJevDecision\(profileId, input, signal\)\)/);
  assert.match(main, /tools: input\?\.finalize === true \? \[\] : agentToolsForJev\(connection\.jevAutoJudgeEnabled\)/);
  assert.match(main, /if \(!connection\.autoJudgeEnabled\) throw new Error\('请先在 Agent 配置中启用 JEV 模型'\)/);
  assert.match(main, /scriptJson\(/);
  assert.doesNotMatch(main, /MAX_AGENT_REQUEST_BYTES|AGENT_REQUEST_TIMEOUT_MS|网页助手动作数据过大/);
  assert.doesNotMatch(main, /receivedBytes > MAX_AGENT_REQUEST_BYTES/);
  assert.doesNotMatch(shell, /eval\s*\(/);
});

test('agent can operate profile tabs and browser permissions stay inside the profile shell', () => {
  const shell = fs.readFileSync(path.join(rendererRoot, 'browser-shell.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'browser-shell-preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  const protocols = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'agent-protocols.js'), 'utf8');
  assert.match(shell, /function agentTabsSnapshot\(/);
  assert.match(shell, /function agentOpenTab\(/);
  assert.match(shell, /function agentNavigate\(/);
  assert.match(shell, /operations: \['tabs', 'openTab', 'switchTab', 'closeTab', 'navigate', 'tabControl'\]/);
  assert.match(shell, /case 'browser_new_tab'/);
  assert.match(shell, /case 'browser_select_option'/);
  assert.match(preload, /onOpenNewTab/);
  assert.match(preload, /getDownloads/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /setDevicePermissionHandler/);
  assert.match(main, /setDisplayMediaRequestHandler/);
  assert.match(main, /setDownloadPath/);
  assert.match(main, /browser-shell:open-new-tab/);
  assert.match(protocols, /name: 'browser_tabs'/);
  assert.match(protocols, /name: 'browser_new_tab'/);
  assert.match(protocols, /name: 'browser_downloads'/);
  assert.doesNotMatch(shell, /if \(observation\?\.humanVerification\?\.required\) \{\s*const resumed = await waitForHumanVerification/);
});

test('agent keeps the built-in new-tab page operable', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'browser-shell.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'browser-shell-preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.match(shell, /function createNewTabAgentView\(/);
  assert.match(shell, /function executeNewTabAgentOperation\(/);
  assert.match(shell, /executeAgentOperation: \(operation\)/);
  assert.match(shell, /webview = item\.isNewTab \? item\.agentView : item\.view/);
  assert.doesNotMatch(shell, /webview = item\.isNewTab \? null : item\.view/);
  assert.match(preload, /captureAgentPage/);
  assert.match(main, /browser-shell:agent-capture/);
  assert.match(main, /event\.sender\.capturePage\(captureRect\)/);
});

test('selector selection remains a fixed page template', () => {
  const selector = 'select[name="country"]';
  const value = '"); window.__agentInjected = true; //';
  let selected = '';
  const context = {
    document: {
      querySelector() {
        return {
          tagName: 'SELECT',
          options: [{ value, textContent: 'safe' }],
          focus() {},
          dispatchEvent() {},
          set value(next) { selected = next; },
        };
      },
    },
    Event: function Event() {},
  };
  vm.runInNewContext(actions.selectScript(selector, value), context);
  assert.equal(selected, value);
  assert.doesNotMatch(actions.selectScript(selector, value), /executeJavaScript|eval\s*\(/);
});
