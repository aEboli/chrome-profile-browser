'use strict';

const crypto = require('node:crypto');

const REASONING_EFFORTS = Object.freeze([
  Object.freeze({ id: 'off', label: 'Off' }),
  Object.freeze({ id: 'minimal', label: 'Minimal' }),
  Object.freeze({ id: 'low', label: 'Low' }),
  Object.freeze({ id: 'medium', label: 'Medium' }),
  Object.freeze({ id: 'high', label: 'High' }),
  Object.freeze({ id: 'xhigh', label: 'XHigh' }),
  Object.freeze({ id: 'max', label: 'Max' }),
]);
const REASONING_EFFORT_VALUES = Object.freeze(REASONING_EFFORTS.map(({ id }) => id));

const DEFAULT_AGENT_SETTINGS = Object.freeze({
  protocol: 'openai-chat-completions',
  baseUrl: '',
  model: '',
  contextBudgetTokens: 200000,
  maxOutputTokens: 8192,
  temperature: 0.2,
  maxSteps: 0,
  reasoningEffort: 'medium',
});

const PROTOCOLS = Object.freeze([
  Object.freeze({
    id: 'openai-chat-completions',
    label: 'OpenAI Chat Completions',
    defaultPath: '/v1/chat/completions',
    modelsPath: '/models',
  }),
  Object.freeze({
    id: 'openai-responses',
    label: 'OpenAI Responses',
    defaultPath: '/v1/responses',
    modelsPath: '/models',
  }),
  Object.freeze({
    id: 'anthropic-messages',
    label: 'Anthropic Messages',
    defaultPath: '/v1/messages',
    modelsPath: '/models',
  }),
  Object.freeze({
    id: 'google-gemini',
    label: 'Google Gemini',
    defaultPath: '/v1beta/models/{model}:generateContent',
    modelsPath: '/models',
  }),
]);

const TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: 'browser_observe',
    description: '观察当前活动网页，返回标题、地址、可视区域、页面文字和截图。',
    parameters: Object.freeze({ type: 'object', properties: {}, additionalProperties: false }),
  }),
  Object.freeze({
    name: 'jev_decide',
    description: '调用已配置的 JEV 判断模型，对结构化状态和问题集合给出答案；不执行浏览器动作。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        state: { type: 'object', description: '需要判断的结构化当前状态。' },
        questions: { type: 'object', description: '问题键到问题文本的映射。', minProperties: 1, additionalProperties: { type: 'string' } },
      },
      required: ['state', 'questions'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_read_page',
    description: '读取当前活动网页的标题、地址、描述和正文。',
    parameters: Object.freeze({ type: 'object', properties: {}, additionalProperties: false }),
  }),
  Object.freeze({
    name: 'browser_collect_links',
    description: '收集当前网页中的链接。',
    parameters: Object.freeze({ type: 'object', properties: {}, additionalProperties: false }),
  }),
  Object.freeze({
    name: 'browser_collect_tables',
    description: '收集当前网页中的表格数据。',
    parameters: Object.freeze({ type: 'object', properties: {}, additionalProperties: false }),
  }),
  Object.freeze({
    name: 'browser_open',
    description: '在当前活动标签打开一个网页地址。',
    parameters: Object.freeze({
      type: 'object',
      properties: { url: { type: 'string', description: '要打开的网页地址或域名。' } },
      required: ['url'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_tabs',
    description: '列出当前 profile 浏览器中的标签页，并标记活动标签。',
    parameters: Object.freeze({ type: 'object', properties: {}, additionalProperties: false }),
  }),
  Object.freeze({
    name: 'browser_new_tab',
    description: '在当前 profile 浏览器中打开新标签页，可直接进入网页地址。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        url: { type: 'string', description: '新标签页地址，留空打开新标签页。' },
        focus: { type: 'boolean' },
      },
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_switch_tab',
    description: '切换当前 profile 浏览器的活动标签页。',
    parameters: Object.freeze({
      type: 'object',
      properties: { tabId: { type: 'string' } },
      required: ['tabId'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_close_tab',
    description: '关闭当前 profile 浏览器中的一个标签页。',
    parameters: Object.freeze({
      type: 'object',
      properties: { tabId: { type: 'string' } },
      required: ['tabId'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_tab_control',
    description: '控制标签页后退、前进、刷新、停止加载或开发者工具。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['back', 'forward', 'reload', 'stop', 'devtools'] },
        tabId: { type: 'string' },
      },
      required: ['action'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_click_selector',
    description: '按 CSS 选择器点击当前网页元素。',
    parameters: Object.freeze({
      type: 'object',
      properties: { selector: { type: 'string' } },
      required: ['selector'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_fill_selector',
    description: '按 CSS 选择器填写当前网页输入或可编辑元素。',
    parameters: Object.freeze({
      type: 'object',
      properties: { selector: { type: 'string' }, value: { type: 'string' } },
      required: ['selector', 'value'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_select_option',
    description: '按 CSS 选择器选择当前网页下拉框的值或显示文本。',
    parameters: Object.freeze({
      type: 'object',
      properties: { selector: { type: 'string' }, value: { type: 'string' } },
      required: ['selector', 'value'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_downloads',
    description: '读取当前 profile 浏览器的下载记录和进度。',
    parameters: Object.freeze({ type: 'object', properties: {}, additionalProperties: false }),
  }),
  Object.freeze({
    name: 'browser_choose_files',
    description: '打开本机文件选择器，请用户明确选择要授权给网页助手的文件；返回短期文件授权 ID。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        multiple: { type: 'boolean', description: '是否允许一次选择多个文件。' },
        defaultPath: { type: 'string', description: '可选的文件选择器起始目录。' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              extensions: { type: 'array', items: { type: 'string' } },
            },
            required: ['extensions'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_choose_folder',
    description: '打开本机文件夹选择器，请用户明确授权一个文件夹；返回短期文件夹授权 ID。',
    parameters: Object.freeze({
      type: 'object',
      properties: { defaultPath: { type: 'string', description: '可选的文件夹选择器起始目录。' } },
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_list_files',
    description: '列出已授权文件夹中的全部文件和子文件夹，并为可用条目返回短期授权 ID。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        directoryId: { type: 'string' },
        recursive: { type: 'boolean' },
      },
      required: ['directoryId'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_read_file',
    description: '读取已授权的文本文件全部内容；二进制文件只返回元数据，不会把内容上传给模型。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        fileId: { type: 'string' },
      },
      required: ['fileId'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_upload_files',
    description: '把已授权的本地文件设置到当前网页匹配的 input[type=file] 控件中；文件不会暴露给页面之外的标签。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        selector: { type: 'string', description: '当前网页中的 CSS 选择器，必须匹配 input[type=file]。'},
        fileIds: { type: 'array', minItems: 1, items: { type: 'string' } },
      },
      required: ['selector', 'fileIds'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_click',
    description: '在当前网页可视区域内模拟人工鼠标点击坐标。坐标使用 CSS 像素，可点击页面中的任意位置。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', enum: ['left', 'middle', 'right'] },
        clickCount: { type: 'integer', minimum: 1 },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_type',
    description: '向当前网页焦点输入文本。',
    parameters: Object.freeze({
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_keypress',
    description: '在当前网页发送键盘组合，例如 Control+L 或 Enter。',
    parameters: Object.freeze({
      type: 'object',
      properties: { keys: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } },
      required: ['keys'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_scroll',
    description: '在当前网页可视区域滚动，正 deltaY 表示向下。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        deltaX: { type: 'number' },
        deltaY: { type: 'number' },
      },
      required: ['x', 'y', 'deltaY'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_drag',
    description: '在当前网页内沿坐标路径拖拽。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        path: { type: 'array', minItems: 2, items: { type: 'object' } },
        button: { type: 'string', enum: ['left', 'middle', 'right'] },
      },
      required: ['path'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_wait',
    description: '等待当前网页完成渲染或响应，单位为毫秒。',
    parameters: Object.freeze({
      type: 'object',
      properties: { ms: { type: 'integer', minimum: 0 } },
      required: ['ms'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'browser_configure_shortcuts',
    description: '配置浏览器的刷新/开发者工具快捷键和鼠标手势。只提交用户明确要求修改的字段。',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        reloadShortcut: { type: 'string', description: '刷新快捷键，例如 F5 或 Ctrl+R。' },
        devtoolsShortcut: { type: 'string', description: '开发者工具快捷键，例如 F12 或 Ctrl+Shift+I。' },
        gestureEnabled: { type: 'boolean' },
        gestureButton: { type: 'string', enum: ['left', 'middle', 'right'] },
        gestureSequence: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string', enum: ['left', 'right', 'up', 'down'] } },
        gestureAction: { type: 'string', enum: ['back', 'forward', 'reload', 'devtools'] },
        gestureThreshold: { type: 'integer', minimum: 16, maximum: 400 },
      },
      additionalProperties: false,
    }),
  }),
]);

function agentToolsForJev(jevAutoJudgeEnabled = true) {
  return jevAutoJudgeEnabled === false
    ? TOOL_DEFINITIONS.filter((tool) => tool.name !== 'jev_decide')
    : TOOL_DEFINITIONS;
}

function protocolDefinition(value) {
  const source = String(value || '').trim().toLowerCase();
  const aliases = {
    openai: 'openai-chat-completions',
    'openai-compatible': 'openai-chat-completions',
    'openai-chat': 'openai-chat-completions',
    responses: 'openai-responses',
    'openai-response': 'openai-responses',
    'openai-responses-api': 'openai-responses',
    chatgpt: 'openai-chat-completions',
    anthropic: 'anthropic-messages',
    claude: 'anthropic-messages',
    gemini: 'google-gemini',
    google: 'google-gemini',
  };
  const id = aliases[source] || source;
  return PROTOCOLS.find((item) => item.id === id) || PROTOCOLS[0];
}

function normalizeProtocol(value) {
  return protocolDefinition(value).id;
}

function normalizeReasoningEffort(value, fallback = DEFAULT_AGENT_SETTINGS.reasoningEffort) {
  const aliases = { none: 'off', disabled: 'off', 'x-high': 'xhigh', maximum: 'max' };
  const normalized = String(value ?? '').trim().toLowerCase();
  if (REASONING_EFFORT_VALUES.includes(normalized)) return normalized;
  if (aliases[normalized]) return aliases[normalized];
  return REASONING_EFFORT_VALUES.includes(fallback) ? fallback : DEFAULT_AGENT_SETTINGS.reasoningEffort;
}

function resolveReasoningEffort(value, supported) {
  const requested = normalizeReasoningEffort(value);
  const available = [...new Set((Array.isArray(supported) ? supported : [])
    .map((item) => {
      const candidate = String(item ?? '').trim().toLowerCase();
      const aliases = { none: 'off', disabled: 'off', 'x-high': 'xhigh', maximum: 'max' };
      return REASONING_EFFORT_VALUES.includes(candidate) ? candidate : aliases[candidate] || '';
    })
    .filter((item) => REASONING_EFFORT_VALUES.includes(item)))]
    .sort((left, right) => REASONING_EFFORT_VALUES.indexOf(left) - REASONING_EFFORT_VALUES.indexOf(right));
  if (!available.length || available.includes(requested)) return requested;
  const requestedIndex = REASONING_EFFORT_VALUES.indexOf(requested);
  const firstIndex = REASONING_EFFORT_VALUES.indexOf(available[0]);
  const lastIndex = REASONING_EFFORT_VALUES.indexOf(available[available.length - 1]);
  if (requestedIndex <= firstIndex) return available[0];
  if (requestedIndex >= lastIndex) return available[available.length - 1];
  return available.reduce((closest, candidate) => {
    const candidateDistance = Math.abs(REASONING_EFFORT_VALUES.indexOf(candidate) - requestedIndex);
    const closestDistance = Math.abs(REASONING_EFFORT_VALUES.indexOf(closest) - requestedIndex);
    return candidateDistance < closestDistance ? candidate : closest;
  }, available[0]);
}

function reasoningEffortFallbacks(value) {
  const requested = normalizeReasoningEffort(value);
  const requestedIndex = REASONING_EFFORT_VALUES.indexOf(requested);
  const result = [requested];
  for (let distance = 1; distance < REASONING_EFFORT_VALUES.length; distance += 1) {
    const higher = REASONING_EFFORT_VALUES[requestedIndex + distance];
    const lower = REASONING_EFFORT_VALUES[requestedIndex - distance];
    if (higher) result.push(higher);
    if (lower) result.push(lower);
  }
  return result;
}

function stripKnownEndpoint(pathname) {
  let path = String(pathname || '').replace(/\/+$/, '');
  // Gemini users often paste the complete model endpoint. Reduce it to the
  // version root before appending the selected model again.
  path = path.replace(/\/models\/[^/]+:generatecontent$/i, '');
  for (const suffix of ['/chat/completions', '/responses', '/messages', '/generateContent', '/models']) {
    if (path.toLowerCase().endsWith(suffix.toLowerCase())) {
      path = path.slice(0, -suffix.length).replace(/\/+$/, '');
      break;
    }
  }
  return path;
}

function normalizeBaseUrl(value, protocol = DEFAULT_AGENT_SETTINGS.protocol) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Agent 接口地址必须是有效 URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Agent 接口地址只支持 HTTP 或 HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Agent 接口地址不得包含账号或密码');
  }
  const definition = protocolDefinition(protocol);
  let pathname = stripKnownEndpoint(parsed.pathname);
  if (!pathname) {
    pathname = definition.id === 'anthropic-messages' ? '/v1'
      : definition.id === 'google-gemini' ? '/v1beta' : '/v1';
  }
  return `${parsed.origin}${pathname}`;
}

function endpointFor(protocol, baseUrl, model) {
  const definition = protocolDefinition(protocol);
  const root = normalizeBaseUrl(baseUrl, definition.id).replace(/\/+$/, '');
  if (definition.id === 'google-gemini') {
    return `${root}/models/${encodeURIComponent(String(model || ''))}:generateContent`;
  }
  if (definition.id === 'openai-responses') return `${root}/responses`;
  return `${root}${definition.id === 'anthropic-messages' ? '/messages' : '/chat/completions'}`;
}

function streamingEndpointFor(protocol, baseUrl, model) {
  const definition = protocolDefinition(protocol);
  const root = normalizeBaseUrl(baseUrl, definition.id).replace(/\/+$/, '');
  if (definition.id === 'google-gemini') {
    return `${root}/models/${encodeURIComponent(String(model || ''))}:streamGenerateContent?alt=sse`;
  }
  return endpointFor(protocol, baseUrl, model);
}

function modelsEndpointFor(protocol, baseUrl) {
  const definition = protocolDefinition(protocol);
  const root = normalizeBaseUrl(baseUrl, definition.id).replace(/\/+$/, '');
  return `${root}${definition.modelsPath}`;
}

function authHeaders(protocol, token) {
  const value = String(token || '');
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  switch (protocolDefinition(protocol).id) {
    case 'anthropic-messages':
      headers['anthropic-version'] = '2023-06-01';
      if (value) headers['x-api-key'] = value;
      break;
    case 'google-gemini':
      if (value) headers['x-goog-api-key'] = value;
      break;
    default:
      if (value) headers.authorization = `Bearer ${value}`;
      break;
  }
  return headers;
}

function dataUrlParts(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

function textContent(message) {
  const value = message?.content;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((part) => typeof part === 'string' ? part : part?.text || '').join('');
  }
  return value == null ? '' : String(value);
}

function messageImages(message) {
  const images = Array.isArray(message?.images) ? message.images : [];
  return images.map((image) => {
    if (typeof image === 'string') return { dataUrl: image };
    return image && typeof image === 'object' ? image : null;
  }).filter(Boolean);
}

function openAiContent(message) {
  const images = messageImages(message);
  if (!images.length) return textContent(message);
  const parts = [];
  for (const image of images) {
    if (image.dataUrl) parts.push({ type: 'image_url', image_url: { url: image.dataUrl } });
  }
  const text = textContent(message);
  if (text) parts.push({ type: 'text', text });
  return parts;
}

function anthropicContent(message) {
  const parts = [];
  for (const image of messageImages(message)) {
    const parsed = dataUrlParts(image.dataUrl || image.url);
    if (parsed) {
      parts.push({ type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } });
    }
  }
  const text = textContent(message);
  if (text) parts.push({ type: 'text', text });
  return parts.length ? parts : text;
}

function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toolCallId(value, index) {
  return String(value || `agent-call-${index + 1}-${crypto.randomUUID().slice(0, 8)}`);
}

function buildOpenAiMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    const role = String(message?.role || 'user');
    if (role === 'tool') {
      return { role: 'tool', tool_call_id: String(message.toolCallId || message.tool_call_id || ''), content: textContent(message) };
    }
    if (role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
      return {
        role: 'assistant',
        content: textContent(message),
        tool_calls: message.toolCalls.map((call, index) => ({
          id: toolCallId(call.id, index),
          type: 'function',
          function: { name: String(call.name || ''), arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}) },
        })),
      };
    }
    return { role: role === 'system' ? 'system' : role === 'assistant' ? 'assistant' : 'user', content: openAiContent(message) };
  });
}

function buildAnthropicMessages(messages) {
  let system = '';
  const result = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = String(message?.role || 'user');
    if (role === 'system') {
      system = system ? `${system}\n\n${textContent(message)}` : textContent(message);
      continue;
    }
    if (role === 'tool') {
      result.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: String(message.toolCallId || ''), content: textContent(message) }],
      });
      continue;
    }
    if (role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
      const content = [];
      const text = textContent(message);
      if (text) content.push({ type: 'text', text });
      message.toolCalls.forEach((call, index) => content.push({
        type: 'tool_use',
        id: toolCallId(call.id, index),
        name: String(call.name || ''),
        input: parseJsonObject(call.arguments),
      }));
      result.push({ role: 'assistant', content });
      continue;
    }
    result.push({ role: role === 'assistant' ? 'assistant' : 'user', content: anthropicContent(message) });
  }
  return { system, messages: result };
}

function geminiParts(message) {
  const parts = [];
  for (const image of messageImages(message)) {
    const parsed = dataUrlParts(image.dataUrl || image.url);
    if (parsed) parts.push({ inlineData: { mimeType: parsed.mediaType, data: parsed.data } });
  }
  const text = textContent(message);
  if (text) parts.push({ text });
  return parts.length ? parts : [{ text: '' }];
}

function buildGeminiContents(messages) {
  const contents = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = String(message?.role || 'user');
    if (role === 'system') continue;
    if (role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: String(message.name || ''), response: parseJsonObject(message.content) } }],
      });
      continue;
    }
    if (role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
      const parts = [];
      const text = textContent(message);
      if (text) parts.push({ text });
      message.toolCalls.forEach((call) => parts.push({ functionCall: { name: String(call.name || ''), args: parseJsonObject(call.arguments) } }));
      contents.push({ role: 'model', parts });
      continue;
    }
    contents.push({ role: role === 'assistant' ? 'model' : 'user', parts: geminiParts(message) });
  }
  return contents;
}

function buildAgentRequest(input = {}) {
  const protocol = normalizeProtocol(input.protocol);
  const definition = protocolDefinition(protocol);
  const model = String(input.model || '').trim();
  if (!model) throw new Error('尚未填写 Agent 模型');
  const baseUrl = normalizeBaseUrl(input.baseUrl, protocol);
  if (!baseUrl) throw new Error('尚未填写 Agent 接口地址');
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const tools = Array.isArray(input.tools) ? input.tools : TOOL_DEFINITIONS;
  const maxOutputTokens = Number.isFinite(Number(input.maxOutputTokens)) ? Math.max(1, Math.round(Number(input.maxOutputTokens))) : DEFAULT_AGENT_SETTINGS.maxOutputTokens;
  const temperature = input.temperature === null || input.temperature === undefined || input.temperature === ''
    ? null
    : Math.max(0, Math.min(2, Number(input.temperature)));
  const reasoningEffort = resolveReasoningEffort(input.reasoningEffort, input.supportedReasoningEfforts);

  if (definition.id === 'anthropic-messages') {
    const converted = buildAnthropicMessages(messages);
    const body = {
      model,
      max_tokens: maxOutputTokens,
      messages: converted.messages,
    };
    if (tools.length) body.tools = tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
    if (input.stream === true) body.stream = true;
    if (converted.system) body.system = converted.system;
    if (temperature !== null && Number.isFinite(temperature)) body.temperature = temperature;
    return { protocol, reasoningEffort, url: endpointFor(protocol, baseUrl, model), headers: authHeaders(protocol, input.token), body };
  }

  if (definition.id === 'google-gemini') {
    const system = messages.find((message) => message?.role === 'system');
    const body = {
      contents: buildGeminiContents(messages),
      generationConfig: { maxOutputTokens },
    };
    if (tools.length) body.tools = [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) }];
    if (system && textContent(system)) body.systemInstruction = { parts: [{ text: textContent(system) }] };
    if (temperature !== null && Number.isFinite(temperature)) body.generationConfig.temperature = temperature;
    if (input.stream === true) return {
      protocol,
      reasoningEffort,
      url: streamingEndpointFor(protocol, baseUrl, model),
      headers: authHeaders(protocol, input.token),
      body,
    };
    return { protocol, reasoningEffort, url: endpointFor(protocol, baseUrl, model), headers: authHeaders(protocol, input.token), body };
  }

  if (definition.id === 'openai-responses') {
    const inputItems = [];
    for (const message of messages) {
      const role = String(message?.role || 'user');
      if (role === 'tool') {
        inputItems.push({
          type: 'function_call_output',
          call_id: String(message.toolCallId || message.tool_call_id || ''),
          output: textContent(message),
        });
        continue;
      }
      if (role === 'assistant' && Array.isArray(message.responseItems) && message.responseItems.length) {
        for (const item of message.responseItems) {
          if (!item || typeof item !== 'object' || Array.isArray(item) || !item.type) continue;
          inputItems.push(item);
        }
        continue;
      }
      if (role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
        for (const [index, call] of message.toolCalls.entries()) {
          inputItems.push({
            type: 'function_call',
            call_id: toolCallId(call.id, index),
            name: String(call.name || ''),
            arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}),
          });
        }
        if (textContent(message)) inputItems.push({ role: 'assistant', content: textContent(message) });
        continue;
      }
      const images = messageImages(message);
      if (images.length) {
        const content = [];
        for (const image of images) {
          if (image.dataUrl) content.push({ type: 'input_image', image_url: image.dataUrl });
        }
        if (textContent(message)) content.push({ type: 'input_text', text: textContent(message) });
        inputItems.push({ role: role === 'system' ? 'developer' : role, content });
      } else {
        inputItems.push({ role: role === 'system' ? 'developer' : role, content: textContent(message) });
      }
    }
    const body = {
      model,
      input: inputItems,
      max_output_tokens: maxOutputTokens,
    };
    if (tools.length) {
      body.tools = tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters }));
      body.tool_choice = 'auto';
    }
    if (input.stream === true) body.stream = true;
    if (temperature !== null && Number.isFinite(temperature)) body.temperature = temperature;
    if (reasoningEffort !== 'off') body.reasoning = { effort: reasoningEffort };
    return { protocol, reasoningEffort, url: endpointFor(protocol, baseUrl, model), headers: authHeaders(protocol, input.token), body };
  }

  const body = {
    model,
    messages: buildOpenAiMessages(messages),
    max_tokens: maxOutputTokens,
  };
  if (tools.length) {
    body.tools = tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
    body.tool_choice = 'auto';
  }
  if (input.stream === true) body.stream = true;
  if (temperature !== null && Number.isFinite(temperature)) body.temperature = temperature;
  if (reasoningEffort !== 'off') body.reasoning_effort = reasoningEffort;
  return { protocol, reasoningEffort, url: endpointFor(protocol, baseUrl, model), headers: authHeaders(protocol, input.token), body };
}

function textFromParts(parts) {
  return (Array.isArray(parts) ? parts : []).map((part) => {
    if (typeof part === 'string') return part;
    return String(part?.text || part?.content || '');
  }).join('');
}

function parseAgentResponse(protocol, payload) {
  const root = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
  const kind = protocolDefinition(protocol).id;
  if (kind === 'anthropic-messages') {
    const toolCalls = [];
    const texts = [];
    for (const [index, block] of (Array.isArray(root.content) ? root.content : []).entries()) {
      if (block?.type === 'text') texts.push(String(block.text || ''));
      if (block?.type === 'tool_use') {
        toolCalls.push({ id: toolCallId(block.id, index), name: String(block.name || ''), arguments: block.input || {} });
      }
    }
    return { text: texts.join(''), toolCalls, finishReason: root.stop_reason || '', usage: root.usage || null };
  }
  if (kind === 'google-gemini') {
    const parts = root.candidates?.[0]?.content?.parts || [];
    const toolCalls = [];
    const texts = [];
    parts.forEach((part, index) => {
      if (part?.text) texts.push(String(part.text));
      if (part?.functionCall) toolCalls.push({
        id: toolCallId(part.functionCall.id, index),
        name: String(part.functionCall.name || ''),
        arguments: part.functionCall.args || {},
      });
    });
    return { text: texts.join(''), toolCalls, finishReason: root.candidates?.[0]?.finishReason || '', usage: root.usageMetadata || null };
  }

  if (kind === 'openai-responses') {
    const toolCalls = [];
    const texts = [];
    for (const [index, item] of (Array.isArray(root.output) ? root.output : []).entries()) {
      if (item?.type === 'function_call') {
        toolCalls.push({
          id: toolCallId(item.call_id || item.id, index),
          name: String(item.name || ''),
          arguments: item.arguments || {},
        });
        continue;
      }
      if (item?.type === 'message') {
        if (typeof item.content === 'string') {
          texts.push(item.content);
        } else {
          const parts = Array.isArray(item.content) ? item.content : [];
          for (const part of parts) {
            if (typeof part === 'string') texts.push(part);
            else if (part?.type === 'output_text' || part?.type === 'text') texts.push(String(part.text || ''));
          }
        }
      }
    }
    if (!texts.length && root.output_text) texts.push(String(root.output_text));
    const responseItems = Array.isArray(root.output) ? root.output : [];
    // Responses requires the model output items to be fed back verbatim on the
    // next request before any function_call_output items are appended.
    const response = {
      text: texts.join(''),
      toolCalls,
      responseItems,
      finishReason: root.incomplete_details?.reason || root.status || '',
      usage: root.usage || null,
    };
    return response;
  }

  const message = root.choices?.[0]?.message || {};
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((call, index) => ({
      id: toolCallId(call.id, index),
      name: String(call.function?.name || ''),
      arguments: call.function?.arguments || {},
    }))
    : message.function_call
      ? [{ id: toolCallId('', 0), name: String(message.function_call.name || ''), arguments: message.function_call.arguments || {} }]
      : [];
  const text = typeof message.content === 'string' ? message.content : textFromParts(message.content);
  return { text, toolCalls, finishReason: root.choices?.[0]?.finish_reason || '', usage: root.usage || null };
}

function estimateMessageTokens(message) {
  try {
    return Math.max(1, Math.ceil(JSON.stringify(message || {}).length / 4));
  } catch {
    return 1;
  }
}

function trimAgentMessages(messages, budget) {
  const source = Array.isArray(messages) ? messages : [];
  const limit = Number.isFinite(Number(budget)) && Number(budget) > 0 ? Math.floor(Number(budget)) : DEFAULT_AGENT_SETTINGS.contextBudgetTokens;
  const total = source.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  if (total <= limit) return source.slice();
  const system = source.find((message) => message?.role === 'system');
  // Keep an assistant tool request and its contiguous tool results together. Both
  // OpenAI protocols and the other adapters require those records to remain paired.
  const units = [];
  for (let index = 0; index < source.length; index += 1) {
    const message = source[index];
    if (message === system) continue;
    const unit = [message];
    if (message?.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
      let next = index + 1;
      while (next < source.length && source[next]?.role === 'tool') {
        unit.push(source[next]);
        next += 1;
      }
      index = next - 1;
    }
    units.push(unit);
  }
  const result = system ? [system] : [];
  let used = result.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    const cost = unit.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
    if (used + cost > limit && result.length > (system ? 1 : 0)) break;
    result.splice(system ? 1 : 0, 0, ...unit);
    used += cost;
  }
  return result;
}

function extractErrorMessage(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.slice(0, 2000);
  if (typeof payload === 'object') {
    const error = payload.error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && error.message) return String(error.message).slice(0, 2000);
    if (payload.message) return String(payload.message).slice(0, 2000);
  }
  return '';
}

module.exports = {
  DEFAULT_AGENT_SETTINGS,
  REASONING_EFFORTS,
  PROTOCOLS,
  TOOL_DEFINITIONS,
  agentToolsForJev,
  authHeaders,
  buildAgentRequest,
  endpointFor,
  modelsEndpointFor,
  extractErrorMessage,
  normalizeBaseUrl,
  normalizeProtocol,
  normalizeReasoningEffort,
  parseAgentResponse,
  reasoningEffortFallbacks,
  resolveReasoningEffort,
  trimAgentMessages,
};
