## ADDED Requirements

### Requirement: 每个环境独立选择浏览器引擎

系统 MUST 为每个环境持久化独立的启动引擎模式，模式为 `electron` 或 `external`。启动一个环境 MUST 根据该环境的模式分别使用 Electron 内置 Chromium 或外部 Chromium；不同环境 MUST 能在不同模式下同时运行。外部 Chromium 可执行文件路径由全局设置共享，外部环境仍使用各自隔离的数据目录。

#### Scenario: 迁移未保存引擎模式的旧环境

- **WHEN** 状态文件中的环境没有 `engineMode`
- **THEN** 系统将其模式初始化为该状态文件当前的全局默认引擎模式，并保留其他环境数据

#### Scenario: 新建环境继承默认引擎

- **WHEN** 用户新建环境
- **THEN** 环境编辑器以设置页当前的全局默认模式作为初始值，并将选择结果保存到该环境

#### Scenario: 不同环境使用不同引擎

- **WHEN** 一个环境选择 `electron`，另一个环境选择 `external`
- **THEN** 启动前者使用 Electron 内置 Chromium，启动后者使用共享外部 Chromium 路径，且两者可以同时运行

#### Scenario: 更改全局默认值

- **WHEN** 用户更改设置页的全局默认引擎
- **THEN** 后续新环境使用新默认值，已有环境保持各自保存的引擎模式

### Requirement: 环境引擎设置的校验与运行边界

环境编辑界面 MUST 显示并允许修改该环境的引擎模式。外部模式 MUST 要求全局外部 Chromium 路径有效；运行中的环境 MUST 拒绝修改其引擎模式，停止后保存的修改在下次启动时生效。

#### Scenario: 外部路径未配置或无效

- **WHEN** 用户将环境设为 `external`，但全局外部 Chromium 路径为空或无效
- **THEN** 保存失败并指出需要先配置有效的外部 Chromium 可执行文件

#### Scenario: 运行期间切换环境引擎

- **WHEN** 环境正在运行，用户修改该环境的 `engineMode` 并保存
- **THEN** 系统拒绝保存并提示先停止该环境

#### Scenario: 启动器显示环境引擎

- **WHEN** 启动器展示环境卡片
- **THEN** 卡片显示该环境保存的内置或外部 Chromium 模式
