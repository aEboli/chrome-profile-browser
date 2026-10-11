# 网页助手输入、长回复与主题修复及 JEV 移除

## Why

网页助手输入框不能接收剪贴板中的图片，模型回复达到输出上限后会直接结束，浅色主题下设置面板仍出现深色背景和文字。当前 JEV 判断还占用独立模型配置、密钥、工具及请求通道；用户决定移除整个 JEV 判断能力。

## What Changes

- 支持在网页助手输入框粘贴剪贴板图片，显示待发送预览并允许移除；文本与图片可一起发送给当前 Agent 模型。
- 识别各模型协议的输出长度截断状态。纯文本回复达到单次输出上限时自动续写并保持为同一条回复；续写沿用当前思考等级、用户取消和既有上下文预算。长度截断的工具调用不得执行。
- 移除 JEV 独立模型、自动完成判断、`jev_decide` 工具、设置项、配置中心与环境覆盖字段、主进程请求接口及专属协议模块。
- 启动时清除旧全局配置和环境覆盖中的 JEV 字段及 Key，保留其他 Agent 设置和环境覆盖。
- 将网页助手浏览器设置面板、人工验证提示等残留硬编码深色样式改为跟随当前深浅主题的语义变量。

## Capabilities

### New Capabilities

- `agent-composer-image-paste`: 将剪贴板图片粘贴到网页助手输入、预览并发送。
- `agent-response-continuation`: 检测服务端输出长度上限并续写纯文本回复。
- `browser-agent-panel-theme`: 网页助手浅色与深色主题的完整表面和状态颜色。

### Modified Capabilities

- `agent-jev-auto-judge`: 移除整个 JEV 自动判断能力及其配置。

## Impact

- 修改 `src/renderer/browser-shell.html`、`browser-shell.js` 和 `browser-shell.css`，接通剪贴板图片、回复状态处理和主题变量。
- 修改 `src/main/agent-protocols.js`、`src/main/main.js`、`src/main/store.js` 及 `src/main/browser-shell-preload.js`，识别截断、清除 JEV 请求与配置并迁移旧状态。
- 移除只服务 JEV 的 `src/main/jev-protocols.js`、`src/renderer/agent-completion.js` 及对应测试；更新 Agent 配置中心和相关测试。
- 更新 `openspec/spec.md` 与 Agent 能力规范，确保当前规范反映移除后的行为。

## Explicit Boundaries

- 剪贴板图片作为网页助手消息上下文发送，不会自动上传到当前网页或本地服务。
- 每张剪贴板图片的 data URL 上限为 10,000,000 字符；超限时明确提示，不静默丢弃。
- 只自动续写明确由输出 token 上限结束且没有工具调用的回复；长度截断的工具调用全部停止并向用户说明，不执行不完整动作。
- JEV 移除不影响 Agent 自身的思考等级、工具调用、网页操作和最终答复能力。
- 历史归档提案仅保留为变更记录，不作为运行时能力或当前规范。
