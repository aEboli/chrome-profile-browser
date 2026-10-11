# 设计

## 剪贴板图片

- 在网页助手 textarea 的 `paste` 事件中读取 `clipboardData.items` / `files` 中的 `image/*` 项；图片粘贴时拦截浏览器默认行为，并保留剪贴板中的纯文本插入及光标位置。
- 图片读为 data URL，每张最多 10,000,000 个字符；维护 renderer 内待发送队列，并在 composer 与发送按钮之间显示紧凑预览和逐项移除控件。
- 将附件随现有 model task 传给 `runModelAgent`，加入 user 消息的 `images` 数组。复用四种协议已有图片转换，不增加独立上传 IPC。
- 清空输入时同时消费附件；仅图片也能提交。图片过大或读取失败时保留可见错误并避免部分静默发送。

## 长回复续写

- 统一将 OpenAI Chat `length`、Responses `incomplete_details.reason=max_output_tokens`、Anthropic `max_tokens` 和 Gemini `MAX_TOKENS` 归类为输出截断。
- 流式和非流式 Agent 请求在文本回复被截断时，以同一思考等级追加明确的续写提示并再次请求；累计文本返回为一条完整回复。每次续写重新按现有上下文预算裁剪消息。
- 续写请求关闭工具，避免模型把续写解释成新的网页操作。若服务端同时返回工具调用和长度截断，则整个不完整调用不进入执行路径，UI 明确提示用户。
- 继续使用现有 AbortSignal 和 request ID；用户停止请求时停止当前续写。

## 移除 JEV

- 删除 JEV 专用 protocol builder、`jev_decide` 工具、自动完成判断循环、专用 IPC/preload bridge、设置 UI 和专属完成解析器。
- Agent 执行网页工具后继续由同一个配置模型生成下一步或最终答复，不再额外判断完成状态；最终答复不声称经外部模型确认。
- 状态规范化时删除全局 `jevAutoJudgeEnabled`、`jevProvider`、`jevBaseUrl`、`jevModel`、`jevKey`、`jevToken` 字段，并从每个 `agentProfileOverrides` 对象删除相同字段。检测到旧字段时将清理后的状态原子写回，避免旧 Key 留在状态文件中。
- 其他全局 Agent 字段、密钥及环境覆盖原样保留。

## 浅色主题

- 将浏览器设置面板和人工验证提示中的深色背景、浅色文字、边框与焦点色替换为 `--agent-*` 语义变量。
- 浅色主题为所有背景、文本、边框、滚动条和提示状态提供成对值；深色主题沿用现有视觉效果。固定语义颜色仅保留必要的成功、警告和错误对比度。

## 验证

- 定向测试覆盖剪贴板图像取值/图片消息组装、四类协议的截断判别及续写条件、旧 JEV 状态全局和环境迁移、JEV 工具与 IPC 删除、浅色主题样式变量。
- 运行 `npm test`、`npm run check`、`git diff --check` 和 OpenSpec 严格校验。
- 手动复核复制图片后在网页助手中粘贴、预览/移除/发送；使用模拟返回长度上限的流验证续写和停止；切换浅色主题查看设置和提示表面。
