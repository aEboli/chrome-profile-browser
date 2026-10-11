# agent-response-continuation Specification

## Purpose
定义网页助手如何识别不同模型协议的输出 token 上限，并将被截断的自然语言回复续写为同一条答复。

## Requirements

### Requirement: 网页助手续写达到输出上限的文本回复

Agent MUST 将 OpenAI Chat `length`、OpenAI Responses `max_output_tokens`、Anthropic `max_tokens` 和 Gemini `MAX_TOKENS` 视为输出截断。纯文本回复被截断时，Agent MUST 使用当前 Agent 模型和思考等级继续生成，并将各段作为同一条回复呈现。续写 MUST 沿用当前请求取消和上下文预算行为。

#### Scenario: Medium 思考等级下文本输出达到上限

- **WHEN** 当前 Agent 使用 Medium 思考等级且服务端因输出 token 上限结束纯文本回复
- **THEN** Agent 自动续写直至收到非截断完成状态
- **AND** 已生成文本在用户界面中保持为同一条累计回复

#### Scenario: 其他等级或协议达到上限

- **WHEN** 任一已支持协议返回明确的输出 token 截断状态
- **THEN** Agent 使用相同思考等级续写纯文本回复
- **AND** 后续请求继续遵守配置的上下文预算

#### Scenario: 输出截断期间用户取消

- **WHEN** 用户停止正在续写的 Agent 回复
- **THEN** 当前网络请求和后续续写立即停止

#### Scenario: 长度截断响应包含工具调用

- **WHEN** 因输出上限结束的响应同时包含工具调用
- **THEN** Agent 不执行这些不完整工具调用
- **AND** 界面说明响应达到长度上限

#### Scenario: 服务端正常结束

- **WHEN** 服务端返回非截断完成状态
- **THEN** Agent 不额外发起续写请求
