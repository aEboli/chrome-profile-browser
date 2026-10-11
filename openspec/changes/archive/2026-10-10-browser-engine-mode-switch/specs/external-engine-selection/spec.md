## ADDED Requirements

### Requirement: 浏览器模式与外部路径独立保存

系统 MUST 将当前引擎模式与外部 Chromium 可执行文件路径分别保存。切换到 Electron 内置 Chromium MUST NOT 清除外部路径、版本或校验信息。旧状态缺少模式字段时，系统 MUST 按旧 `enginePath` 是否非空迁移为 `external` 或 `electron`。

#### Scenario: 从旧设置迁移外部模式

- **WHEN** 状态文件没有 `engineMode` 且保存了非空 `enginePath`
- **THEN** 系统将模式迁移为 `external`，并保留路径和版本信息

#### Scenario: 从旧设置迁移内置模式

- **WHEN** 状态文件没有 `engineMode` 且 `enginePath` 为空
- **THEN** 系统将模式迁移为 `electron`

#### Scenario: 切回内置模式后保留外部路径

- **WHEN** 用户选择 Electron 内置 Chromium 并保存设置
- **THEN** 后续 profile 使用 Electron 窗口，已配置的外部路径和版本信息保持不变

### Requirement: 设置页提供明确的浏览器模式切换

配置中心 MUST 在浏览器引擎设置区域提供互斥的 Electron 内置 Chromium 与外部 Chromium 选项，并清楚显示当前待保存模式与已保存模式。模式更改 MUST 经“保存运行设置”持久化。

#### Scenario: 在已配置路径时启用外部模式

- **WHEN** 用户选择外部 Chromium 且已有有效外部路径，然后保存设置
- **THEN** 后续启动的环境使用该可执行文件，外部路径保持不变

#### Scenario: 外部模式没有有效路径

- **WHEN** 用户选择外部 Chromium，但路径为空或无效后保存设置
- **THEN** 保存失败并提示选择有效的 Chromium 可执行文件，原有引擎模式保持不变

#### Scenario: 选择外部浏览器文件

- **WHEN** 用户从文件选择器选中有效 Chromium 可执行文件
- **THEN** 路径写入待保存设置且待保存模式切到外部 Chromium，保存后才用于后续启动

### Requirement: 引擎模式切换遵守环境运行边界

系统 MUST 在存在运行中环境时拒绝更改引擎模式或外部路径。引擎模式为 `electron` 时，启动流程 MUST 使用 Electron Chromium，即使外部路径仍配置或失效。

#### Scenario: 环境运行期间修改模式

- **WHEN** 至少一个 profile 正在运行，用户更改引擎模式或外部路径并保存
- **THEN** 系统拒绝更改并提示先停止运行中的环境

#### Scenario: 内置模式保留失效外部路径

- **WHEN** 引擎模式为 `electron` 且已保存的外部路径已不存在
- **THEN** profile 仍可通过 Electron Chromium 启动，外部路径仅在选择外部模式时触发路径错误

#### Scenario: 安装浏览器内核

- **WHEN** 官方 Chromium 安装成功
- **THEN** 系统保存安装路径和版本信息，并按现有行为将模式设为 `external`
