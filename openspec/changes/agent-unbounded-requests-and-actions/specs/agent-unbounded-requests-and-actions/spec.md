# Agent 无固定请求与动作上限 Specification

## Purpose

移除 Agent/JEV 网络请求及网页动作输入的应用层固定上限，同时保留用户取消能力、profile 隔离和固定工具白名单。

## ADDED Requirements

### Requirement: Agent network requests have no application timeout or byte cap

模型聊天、流式聊天、JEV 判断、模型列表和连通性检查 MUST NOT 由应用固定请求时长或请求/响应字节数拒绝或终止。模型服务商或底层平台返回的错误仍正常显示。

#### Scenario: A request exceeds previous byte and time caps

- **WHEN** Agent 或 JEV 请求运行超过 120 秒，或请求/响应超过 8MB
- **THEN** 应用继续等待或解析请求
- **AND** 用户仍可停止对应请求

#### Scenario: A request is cancelled

- **WHEN** 用户停止请求或请求所属窗口销毁
- **THEN** 主进程 abort 对应的网络请求/流
- **AND** 取消只影响相同 IPC 发送方和 request ID 的请求
- **AND** 请求完成后释放关联状态

### Requirement: Web actions have no fixed scalar or collection caps

选择器、填写/输入文本、坐标、滚动量、等待时长、点击次数、按键数、拖拽点数和单批动作数 MUST NOT 受应用固定长度、数值上限或数量上限约束。有限数值、非负等待、动作类型白名单和页面 viewport 坐标范围仍 MUST 校验。

#### Scenario: Large valid page action input

- **WHEN** Agent 提交超过原有长度、数值或数量上限但结构有效的白名单动作
- **THEN** 应用完整保留参数并按顺序逐项执行
- **AND** 不会静默截断文本、选择器、拖拽点或批次

#### Scenario: Invalid or cancelled action

- **WHEN** 输入不是有效数据、动作不在白名单，或坐标超出活动页面 viewport
- **THEN** 应用拒绝无效动作
- **WHEN** 用户停止当前批次
- **THEN** 执行队列不再开始该批次后续动作

### Requirement: Agent security boundaries remain enforced

解除应用层固定上限 MUST NOT 开放任意 JavaScript、桌面全局输入或越出当前 profile 的网页控制。文件读写仍 MUST 经用户选择器授权，且 Agent 页面动作仍绑定当前 profile。

#### Scenario: Model requests an unlisted action or ungranted file

- **WHEN** 模型提交未知动作、任意脚本或没有授权的文件 ID
- **THEN** 应用拒绝操作
