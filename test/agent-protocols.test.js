const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PROTOCOLS,
  REASONING_EFFORTS,
  TOOL_DEFINITIONS,
  agentToolsForJev,
  authHeaders,
  buildAgentRequest,
  modelsEndpointFor,
  normalizeBaseUrl,
  normalizeProtocol,
  normalizeReasoningEffort,
  parseAgentResponse,
  reasoningEffortFallbacks,
  resolveReasoningEffort,
  trimAgentMessages,
} = require('../src/main/agent-protocols');

const baseInput = {
  baseUrl: 'https://api.example.test/v1',
  model: 'test-model',
  token: 'secret-token',
  messages: [{ role: 'user', content: '打开页面并读取标题' }],
  tools: TOOL_DEFINITIONS.slice(0, 1),
};

test('lists and normalizes all supported agent protocols', () => {
  assert.deepEqual(PROTOCOLS.map((protocol) => protocol.id), [
    'openai-chat-completions',
    'openai-responses',
    'anthropic-messages',
    'google-gemini',
  ]);
  assert.equal(normalizeProtocol('responses'), 'openai-responses');
  assert.equal(normalizeProtocol('openai-responses-api'), 'openai-responses');
  assert.equal(normalizeBaseUrl('https://api.example.test/v1/responses', 'openai-responses'), 'https://api.example.test/v1');
  assert.equal(normalizeBaseUrl('https://api.example.test/v1beta/models/gemini-test:generateContent', 'google-gemini'), 'https://api.example.test/v1beta');
  assert.equal(modelsEndpointFor('openai-chat-completions', 'https://api.example.test/v1'), 'https://api.example.test/v1/models');
  assert.equal(modelsEndpointFor('anthropic-messages', 'https://api.example.test'), 'https://api.example.test/v1/models');
  assert.equal(modelsEndpointFor('google-gemini', 'https://api.example.test/v1beta'), 'https://api.example.test/v1beta/models');
  const controls = TOOL_DEFINITIONS.find((tool) => tool.name === 'browser_configure_shortcuts');
  assert.ok(controls);
  const jev = TOOL_DEFINITIONS.find((tool) => tool.name === 'jev_decide');
  assert.deepEqual(jev.parameters.required, ['state', 'questions']);
  assert.ok(agentToolsForJev(true).some((tool) => tool.name === 'jev_decide'));
  assert.ok(!agentToolsForJev(false).some((tool) => tool.name === 'jev_decide'));
  assert.deepEqual(controls.parameters.properties.gestureAction.enum, ['back', 'forward', 'reload', 'devtools']);
  const click = TOOL_DEFINITIONS.find((tool) => tool.name === 'browser_click');
  assert.deepEqual(click.parameters.properties.clickCount, { type: 'integer', minimum: 1 });
  const wait = TOOL_DEFINITIONS.find((tool) => tool.name === 'browser_wait');
  assert.deepEqual(wait.parameters.properties.ms, { type: 'integer', minimum: 0 });
  const drag = TOOL_DEFINITIONS.find((tool) => tool.name === 'browser_drag');
  assert.deepEqual(drag.parameters.properties.path, { type: 'array', minItems: 2, items: { type: 'object' } });
});

test('supports configured reasoning levels and clamps unavailable extremes', () => {
  assert.deepEqual(REASONING_EFFORTS.map((item) => item.id), ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(normalizeReasoningEffort('X-High'), 'xhigh');
  assert.equal(resolveReasoningEffort('max', ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']), 'xhigh');
  assert.equal(resolveReasoningEffort('off', ['low', 'medium']), 'low');
  assert.deepEqual(reasoningEffortFallbacks('max').slice(0, 3), ['max', 'xhigh', 'high']);
});

test('adds reasoning effort to OpenAI request shapes', () => {
  const responses = buildAgentRequest({
    ...baseInput,
    protocol: 'openai-responses',
    reasoningEffort: 'max',
    supportedReasoningEfforts: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  });
  assert.equal(responses.reasoningEffort, 'xhigh');
  assert.deepEqual(responses.body.reasoning, { effort: 'xhigh' });

  const chat = buildAgentRequest({ ...baseInput, reasoningEffort: 'high' });
  assert.equal(chat.body.reasoning_effort, 'high');

  const off = buildAgentRequest({ ...baseInput, reasoningEffort: 'off' });
  assert.equal('reasoning_effort' in off.body, false);
});

test('builds streaming requests for every supported agent protocol', () => {
  for (const protocol of PROTOCOLS.map((item) => item.id)) {
    const request = buildAgentRequest({
      ...baseInput,
      protocol,
      stream: true,
      messages: [{ role: 'system', content: '自然聊天' }, ...baseInput.messages],
    });
    if (protocol === 'google-gemini') {
      assert.match(request.url, /:streamGenerateContent\?alt=sse$/);
      assert.equal(request.body.stream, undefined);
      assert.equal(request.body.systemInstruction.parts[0].text, '自然聊天');
    } else {
      assert.equal(request.body.stream, true);
    }
  }
});

test('builds request bodies larger than the former application byte ceiling', () => {
  const content = 'x'.repeat(8 * 1024 * 1024 + 1);
  const request = buildAgentRequest({ ...baseInput, messages: [{ role: 'user', content }] });
  assert.equal(request.body.messages[0].content.length, content.length);
  assert.ok(Buffer.byteLength(JSON.stringify(request.body), 'utf8') > 8 * 1024 * 1024);
});

test('builds final-answer requests without browser tools', () => {
  for (const protocol of PROTOCOLS.map((item) => item.id)) {
    const request = buildAgentRequest({ ...baseInput, protocol, tools: [] });
    assert.equal('tools' in request.body, false, protocol);
    assert.equal('tool_choice' in request.body, false, protocol);
  }
});

test('builds OpenAI Responses requests with the Responses wire shape', () => {
  const request = buildAgentRequest({
    ...baseInput,
    protocol: 'openai-responses',
    messages: [
      { role: 'system', content: '只操作当前标签' },
      { role: 'user', content: '读取页面' },
    ],
  });

  assert.equal(request.url, 'https://api.example.test/v1/responses');
  assert.equal(request.headers.authorization, 'Bearer secret-token');
  assert.equal(request.body.model, 'test-model');
  assert.equal(request.body.input[0].role, 'developer');
  assert.equal(request.body.input[1].role, 'user');
  assert.equal(request.body.tools[0].type, 'function');
  assert.equal(request.body.tools[0].name, 'browser_observe');
  assert.equal(request.body.tool_choice, 'auto');
  assert.equal(request.body.max_output_tokens, 8192);
  assert.equal('messages' in request.body, false);
  assert.equal('max_tokens' in request.body, false);
});

test('keeps Responses function calls and outputs paired across turns', () => {
  const request = buildAgentRequest({
    ...baseInput,
    protocol: 'openai-responses',
    messages: [
      { role: 'user', content: '读取页面' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_123', name: 'browser_read_page', arguments: { includeLinks: false } }],
      },
      { role: 'tool', toolCallId: 'call_123', content: '{"ok":true}' },
    ],
  });

  assert.deepEqual(request.body.input.slice(1), [
    {
      type: 'function_call',
      call_id: 'call_123',
      name: 'browser_read_page',
      arguments: '{"includeLinks":false}',
    },
    {
      type: 'function_call_output',
      call_id: 'call_123',
      output: '{"ok":true}',
    },
  ]);
});

test('parses Responses text and function_call output items', () => {
  const result = parseAgentResponse('openai-responses', {
    status: 'completed',
    output: [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'browser_click',
        arguments: '{"x":12,"y":34}',
      },
      { type: 'message', content: [{ type: 'output_text', text: '已找到按钮。' }] },
    ],
  });

  assert.equal(result.text, '已找到按钮。');
  assert.equal(result.responseItems[0].type, 'reasoning');
  assert.equal(result.responseItems[1].type, 'function_call');
  assert.deepEqual(result.toolCalls, [{
    id: 'call_1',
    name: 'browser_click',
    arguments: '{"x":12,"y":34}',
  }]);
  assert.equal(result.finishReason, 'completed');
});

test('reuses Responses output items before appending tool results', () => {
  const responseItems = [
    { type: 'reasoning', id: 'rs_1', summary: [] },
    { type: 'function_call', call_id: 'call_1', name: 'browser_read_page', arguments: '{}' },
  ];
  const request = buildAgentRequest({
    ...baseInput,
    protocol: 'openai-responses',
    messages: [
      { role: 'user', content: '读取页面' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'browser_read_page', arguments: '{}' }], responseItems },
      { role: 'tool', toolCallId: 'call_1', content: '{"ok":true}' },
    ],
  });
  assert.deepEqual(request.body.input.slice(1), [
    ...responseItems,
    { type: 'function_call_output', call_id: 'call_1', output: '{"ok":true}' },
  ]);
});

test('builds and parses the other supported protocol shapes', () => {
  const anthropic = buildAgentRequest({ ...baseInput, protocol: 'anthropic-messages' });
  assert.equal(anthropic.url, 'https://api.example.test/v1/messages');
  assert.equal(anthropic.headers['x-api-key'], 'secret-token');
  assert.equal(anthropic.headers['anthropic-version'], '2023-06-01');
  assert.equal(anthropic.body.max_tokens, 8192);
  assert.equal(anthropic.body.tools[0].input_schema.type, 'object');

  const gemini = buildAgentRequest({ ...baseInput, protocol: 'google-gemini' });
  assert.equal(gemini.url, 'https://api.example.test/v1/models/test-model:generateContent');
  assert.equal(gemini.headers['x-goog-api-key'], 'secret-token');
  assert.equal(gemini.body.tools[0].functionDeclarations[0].name, 'browser_observe');

  const anthropicResult = parseAgentResponse('anthropic-messages', {
    stop_reason: 'tool_use',
    content: [{ type: 'text', text: '先观察。' }, { type: 'tool_use', id: 'tool_1', name: 'browser_observe', input: {} }],
  });
  assert.equal(anthropicResult.text, '先观察。');
  assert.equal(anthropicResult.toolCalls[0].id, 'tool_1');

  const geminiResult = parseAgentResponse('google-gemini', {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '完成。' }, { functionCall: { name: 'browser_wait', args: { ms: 100 } } }] } }],
  });
  assert.equal(geminiResult.text, '完成。');
  assert.deepEqual(geminiResult.toolCalls[0].arguments, { ms: 100 });
});

test('does not split an assistant tool call from its tool results when trimming context', () => {
  const messages = [
    { role: 'system', content: '系统规则' },
    { role: 'user', content: '旧问题'.repeat(40) },
    { role: 'assistant', content: '', toolCalls: [{ id: 'call_keep', name: 'browser_read_page', arguments: '{}' }] },
    { role: 'tool', toolCallId: 'call_keep', content: '最新结果'.repeat(40) },
  ];
  const trimmed = trimAgentMessages(messages, 100);
  const assistantIndex = trimmed.findIndex((message) => message.role === 'assistant');
  const toolIndex = trimmed.findIndex((message) => message.role === 'tool');
  assert.equal(assistantIndex >= 0, true);
  assert.equal(toolIndex, assistantIndex + 1);
  assert.equal(trimmed[toolIndex].toolCallId, 'call_keep');
});

test('uses protocol-specific authentication headers', () => {
  assert.equal(authHeaders('openai-responses', 'token').authorization, 'Bearer token');
  assert.equal(authHeaders('anthropic-messages', 'token')['x-api-key'], 'token');
  assert.equal(authHeaders('google-gemini', 'token')['x-goog-api-key'], 'token');
  assert.equal(authHeaders('anthropic-messages', '')['anthropic-version'], '2023-06-01');
});
