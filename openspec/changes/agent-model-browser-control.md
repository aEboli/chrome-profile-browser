# Agent 大模型网页控制

> 本增量规范扩展 [`browser-agent-panel.md`](browser-agent-panel.md) 和 [`browser-agent-virtual-input.md`](browser-agent-virtual-input.md)，定义远程模型接入与协议适配边界。

## 目的

- 将 Agent 的连接设置收拢到对话页标题栏右上角，避免与浏览器全局设置混淆。
- 让 Agent 使用用户配置的模型观察当前活动标签，并通过受控浏览器工具完成多轮操作。
- 用统一协议层适配 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和 Google Gemini。

## 行为

- Agent 设置面板提供协议、接口地址、模型、Token、上下文预算、单次输出上限、温度和单轮工具步数。
- 单轮工具步数为 `0` 时不设置有限步数，由用户停止或模型结束本轮任务。
- 首次模型请求包含当前活动标签的受限观察结果；模型返回工具调用时，renderer 只执行白名单动作并把受限结果回传，直到模型返回文字或用户中止。
- OpenAI Responses 使用 `/responses` 端点、`input` 项和 `function_call_output`；其他协议使用各自的消息与工具调用格式。
- 上下文达到预算时按消息组裁剪；assistant 工具请求和紧随其后的 tool 结果必须一起保留。

## 安全边界

- Token 只在主进程读取安全存储并用于请求，不进入公共设置返回值、renderer 日志或模型工具结果。
- 远程请求仅发送用户输入、当前页面受限观察结果和工具结果；请求有 URL 协议校验，但不设固定请求时长或请求/响应字节上限。模型请求、模型列表和连通性检查都能由发起窗口取消；窗口销毁会中止请求。固定消息条数限制由 [`agent-context-threshold-compression.md`](agent-context-threshold-compression.md) 取代，改为按配置预算裁剪与压缩。
- 模型只能调用既有 `window.browserAgent` 白名单能力，动作只绑定当前活动 Electron `<webview>`，不执行任意脚本，也不控制操作系统其他窗口。
- JEV 协同判断是后续扩展位，本增量不调用或模拟 JEV。

## 可验证成功标准

1. Agent 对话页标题栏右上角显示设置按钮，浏览器全局设置不再显示可见 Agent 连接字段。
2. 四种协议均可生成正确的端点、认证头、消息体和工具声明；OpenAI Responses 可解析文本、`function_call`，并生成对应的 `function_call_output`。
3. Anthropic `tool_use`/`tool_result`、Gemini 函数调用和 OpenAI 工具调用的 ID 在多轮请求中保持配对。
4. 上下文裁剪不会产生没有对应 assistant 调用的 tool 结果；`0` 工具步骤表示无限循环，发送按钮可中止。
5. Token 不出现在 renderer 公共设置对象；协议层、请求构造、响应解析和裁剪均有自动化测试，`npm test` 与 `npm run check` 通过。

## 任务

- [x] 增加四种协议和 Responses 请求/响应适配。
- [x] 将 Agent 设置移动到对话页右上角并增加上下文、输出和步骤配置。
- [x] 接入主进程请求与安全 Token 存储。
- [x] 复用浏览器动作白名单实现多轮工具循环和用户中止。
- [x] 增加协议层自动化测试并更新总规范与 README。

状态：已实现。
