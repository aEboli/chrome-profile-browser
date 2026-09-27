# Agent 思考等级配置

## 目的

- 为网页助手 Agent 增加与参考界面一致的 `Off`、`Minimal`、`Low`、`Medium`、`High`、`XHigh`、`Max` 七档思考等级。
- 让等级配置在全局 Agent 设置和单环境覆盖设置之间保持一致，并随请求传递到支持的 OpenAI 协议。

## 行为

- 默认思考等级为 `Medium`；`Off` 不发送思考参数。
- OpenAI Chat Completions 使用 `reasoning_effort`，OpenAI Responses 使用 `reasoning.effort`。
- 当前模型拒绝所选等级时，按距离最近的相邻等级重试；请求 `Max` 且模型最高只支持 `XHigh` 时自动使用 `XHigh`。非 OpenAI 协议保留配置但不注入不兼容的字段。
- 不支持的配置值在主进程归一化为默认等级，不能写入非法状态。

## 可验证成功标准

1. 对话页和独立 Agent 配置页均显示七档思考等级并默认选中 `Medium`。
2. 保存配置后重启或切换环境，等级仍保持；环境覆盖优先于全局配置。
3. OpenAI 两种请求体携带正确的思考字段；`Max` 在可用等级只有 `XHigh` 时降级为 `XHigh`，`Off` 不携带该字段。
4. 相关协议构造、等级边界和状态默认值测试通过，`npm test` 与 `npm run check` 通过。

状态：已实现并完成自动化验证。
