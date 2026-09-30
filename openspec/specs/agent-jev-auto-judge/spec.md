# agent-jev-auto-judge Specification

## Purpose
控制网页助手 Agent 是否使用 JEV 自动判断网页任务完成状态。该设置支持所有环境统一配置，也支持按浏览器环境单独覆盖；关闭时不把 JEV 模型加入 Agent 请求。

## Requirements

### Requirement: Agent can control whether JEV is included

Agent 配置 MUST 持久化 JEV 开关，并支持全局设置和单环境覆盖。旧配置未保存此字段时 MUST 默认开启，以保留现有自动判断行为。

#### Scenario: JEV is enabled

- **WHEN** 当前 Agent 的有效配置启用了 JEV
- **THEN** Agent 模型请求包含 `jev_decide` 工具
- **AND** 每批网页动作后自动请求 JEV 判断完成状态

#### Scenario: JEV is disabled

- **WHEN** 当前 Agent 的有效配置关闭了 JEV
- **THEN** Agent 模型请求不包含 `jev_decide` 工具
- **AND** 网页任务不自动请求 JEV
- **AND** Agent 不会声称任务已由 JEV 确认

#### Scenario: A profile overrides the global JEV setting

- **WHEN** 用户为某个环境单独保存 JEV 开关状态
- **THEN** 该环境使用覆盖值，其他环境继续使用全局值
