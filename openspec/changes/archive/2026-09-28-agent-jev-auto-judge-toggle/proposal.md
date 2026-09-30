# Agent JEV 自动判断开关

## Why

- 让用户在 Agent 配置中控制网页任务是否加入 JEV 模型判断。
- 支持全局配置和现有的单环境覆盖机制。

## What Changes

- Agent 配置提供“启用 JEV 模型”复选框；旧配置默认开启以保持原行为。
- 开启时，Agent 请求携带 `jev_decide` 工具，且网页任务每批操作后自动请求 JEV 完成判断。
- 关闭时，Agent 请求不携带该工具，不自动请求 JEV，也不把任务标记为经过 JEV 确认。
- 关闭状态由主进程校验；renderer 不能仅靠隐藏工具来绕过设置。

## 可验证成功标准

1. 全局和单环境配置均能保存并读取 JEV 开关。
2. 关闭时主进程生成的 Agent 工具列表不含 `jev_decide`，renderer 不自动发起 JEV 请求。
3. 开启时保留既有自动判断行为。
4. `npm test` 与 `npm run check` 通过。
