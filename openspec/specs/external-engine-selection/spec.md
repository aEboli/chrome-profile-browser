# external-engine-selection Specification

## Purpose
本能力规定配置中心如何管理新环境默认浏览器引擎、如何为每个环境分别保存并执行内置或外部 Chromium 模式、如何共用外部可执行文件路径，并定义旧环境迁移、并行运行、路径校验和运行期间配置限制。

## Requirements

### Requirement: 浏览器模式与外部路径独立保存

系统 MUST 将新环境默认模式与外部 Chromium 可执行文件路径分别保存。切换默认模式 MUST NOT 清除外部路径、版本或校验信息。旧设置缺少 `settings.engineMode` 时，系统 MUST 按旧 `enginePath` 是否非空迁移；旧环境缺少 `engineMode` 时，系统 MUST 初始化为迁移后的默认模式。

#### Scenario: 从旧设置迁移外部默认模式

- **WHEN** 设置状态没有 `engineMode` 且保存了非空 `enginePath`
- **THEN** 系统将新环境默认模式迁移为 `external`，并保留路径和版本信息

#### Scenario: 从旧设置迁移内置默认模式

- **WHEN** 设置状态没有 `engineMode` 且 `enginePath` 为空
- **THEN** 系统将新环境默认模式迁移为 `electron`

#### Scenario: 迁移旧环境模式

- **WHEN** profile 没有独立 `engineMode`
- **THEN** 系统使用迁移后的新环境默认模式填充该 profile，保留已有 profile 数据

#### Scenario: 切换默认值后保留外部路径

- **WHEN** 用户将新环境默认模式切到 `electron`
- **THEN** 外部路径、版本和校验信息保持不变

### Requirement: 设置页管理新环境默认引擎

配置中心 MUST 提供互斥的 Electron 内置 Chromium 与外部 Chromium 默认选项，并显示待保存或已保存的默认模式。默认模式更改 MUST 经“保存运行设置”持久化；默认模式只影响之后新建的环境，不覆盖已有 profile。设置页 MUST 继续管理所有外部 profile 共用的可执行文件路径。

#### Scenario: 新建环境继承默认模式

- **WHEN** 用户新建环境
- **THEN** 环境编辑器以设置页当前默认模式初始化，并保存为该环境独立的 `engineMode`

#### Scenario: 改变新环境默认模式

- **WHEN** 用户更改并保存全局默认模式
- **THEN** 后续新建的环境继承新模式，已有环境保持各自模式

#### Scenario: 选择外部 Chromium 文件

- **WHEN** 用户从文件选择器选中有效 Chromium 可执行文件
- **THEN** 路径写入全局外部 Chromium 配置并将新环境默认值切到 `external`

#### Scenario: 默认外部模式没有有效路径

- **WHEN** 用户保存外部默认模式但路径为空或无效
- **THEN** 保存失败并提示选择有效的 Chromium 可执行文件

### Requirement: 每个环境独立选择并启动浏览器引擎

系统 MUST 为每个环境持久化 `electron` 或 `external` 启动模式。启动时 MUST 按该环境保存的模式选择 Electron 内置 Chromium 或共享的外部 Chromium 可执行文件。不同环境 MUST 能以不同模式同时运行，且外部环境继续使用各自隔离的数据目录。

#### Scenario: 不同环境使用不同引擎

- **WHEN** 一个环境选择 `electron`，另一个环境选择 `external`
- **THEN** 启动前者使用 Electron 内置 Chromium，启动后者使用共享外部 Chromium 路径，且两者可以同时运行

#### Scenario: 内置环境保留失效外部路径

- **WHEN** 环境模式为 `electron` 且共享外部路径已不存在
- **THEN** 该环境仍可通过 Electron Chromium 启动

#### Scenario: 外部环境路径失效

- **WHEN** 环境模式为 `external` 且共享路径已不存在
- **THEN** 启动失败并提示外部 Chromium 路径无效

#### Scenario: 外部环境使用带认证的代理节点

- **WHEN** 外部 Chromium 环境选择带用户名或密码的 HTTP、HTTPS 或 SOCKS5 节点
- **THEN** 系统通过本机临时 HTTP 转发器向上游代理转发请求，由转发器处理上游认证，且认证信息不得写入外部 Chromium 启动参数

### Requirement: 环境模式修改遵守运行边界

环境编辑界面 MUST 显示并允许修改该环境的引擎模式。外部模式 MUST 要求共享外部 Chromium 路径有效；运行中的环境 MUST 拒绝修改自身模式，停止后保存的修改在下次启动时生效。任何环境运行期间 MUST 拒绝更换共享外部 Chromium 路径，但 MUST 允许更改只用于新环境的默认模式。

#### Scenario: 外部路径未配置或无效

- **WHEN** 用户将环境设为 `external`，但全局外部 Chromium 路径为空或无效
- **THEN** 保存失败并指出需要先配置有效的外部 Chromium 可执行文件

#### Scenario: 运行期间切换环境引擎

- **WHEN** 环境正在运行，用户修改该环境的 `engineMode` 并保存
- **THEN** 系统拒绝保存并提示先停止该环境

#### Scenario: 运行期间更改默认模式

- **WHEN** 至少一个环境正在运行，用户更改设置页的新环境默认模式
- **THEN** 系统允许保存，所有已有环境的当前和后续启动模式保持不变

#### Scenario: 运行期间更换共享外部路径

- **WHEN** 至少一个环境正在运行，用户更改共享外部 Chromium 路径
- **THEN** 系统拒绝保存并提示先停止运行中的环境

#### Scenario: 启动器显示环境引擎

- **WHEN** 启动器展示环境卡片
- **THEN** 卡片显示该环境保存的内置或外部 Chromium 模式

#### Scenario: 安装浏览器内核

- **WHEN** 官方 Chromium 安装成功
- **THEN** 系统保存安装路径和版本信息并将新环境默认模式设为 `external`，已有环境模式保持不变

### Requirement: 自动发现本机 Google Chrome

当外部 Chromium 路径未配置时，系统 MUST 自动搜索本机稳定版 Google Chrome，并将找到的可执行文件作为外部环境的运行时路径。搜索结果 MUST NOT 覆盖已保存的手动路径，也 MUST NOT 写入 `settings.enginePath`。用户保存了非空路径但该路径无效时，系统 MUST 报告该路径错误而不静默使用自动候选。自动搜索找不到 Chrome 时，设置页 MUST 保留手动选择入口。

#### Scenario: 路径为空且找到 Chrome

- **WHEN** 用户启动外部模式环境且未配置手动路径，本机标准安装位置存在 Google Chrome
- **THEN** 系统使用按平台搜索优先级找到的 Chrome 可执行文件，并在设置页显示其自动发现状态

#### Scenario: 手动路径有效

- **WHEN** 用户已配置有效的 Chromium 可执行文件
- **THEN** 外部环境使用该手动路径，不使用自动搜索结果

#### Scenario: 手动路径无效

- **WHEN** 用户保存了非空手动路径且该路径不存在或不可执行
- **THEN** 系统提示手动路径错误，不回退到自动发现的 Chrome

#### Scenario: 未找到 Chrome

- **WHEN** 手动路径为空且所有标准搜索位置均不存在 Google Chrome
- **THEN** 外部 profile 保存或启动明确提示需要安装 Chrome 或手动选择 Chromium 可执行文件

#### Scenario: 自动发现结果不覆盖设置

- **WHEN** 系统通过标准安装位置发现 Chrome
- **THEN** `settings.enginePath` 继续保持为空，之后启动可重新搜索当前安装位置

### Requirement: Chrome 自动发现优先级

系统 MUST 在 `settings.enginePath` 为空时按平台标准安装位置自动搜寻 Google Chrome 稳定版。系统 MUST 优先使用有效手动路径；非空手动路径无效时 MUST 报错且不得回退。设置页 MUST 显示自动发现路径或未找到提示，并保留手动选择入口。

#### Scenario: Windows 系统安装优先

- **WHEN** Windows 系统安装位置和用户安装位置都存在 Chrome
- **THEN** 自动搜寻优先使用 `Program Files` 下的 Chrome，其次尝试 `Program Files (x86)` 和用户 `LocalAppData`

#### Scenario: macOS 和 Linux 标准路径

- **WHEN** 应用运行在 macOS 或 Linux
- **THEN** macOS 搜寻系统及用户 Applications 内的 Google Chrome 应用包，Linux 搜寻 PATH 中的 `google-chrome-stable` 或 `google-chrome` 及标准安装路径

### Requirement: 启动器直接切换环境内核

启动器 MUST 为每个环境提供可访问的内核切换操作。用户点击操作后，系统 MUST 只更新该环境持久化的 `engineMode` 并立即反馈结果；该选择用于该环境下次启动。切换 MUST NOT 自动启动、停止或重启环境，也 MUST NOT 修改其他环境或全局新环境默认值。运行中的环境 MUST 禁止切换。

#### Scenario: 从启动器切换已停止环境

- **WHEN** 用户在启动器点击一个已停止环境的内核标签
- **THEN** 系统保存相反的内核模式，更新该卡片标签，并使新模式用于下一次启动

#### Scenario: 点击内核标签不启动环境

- **WHEN** 用户点击启动器卡片上的内核切换按钮
- **THEN** 系统只保存内核模式，不触发该环境启动或卡片主按钮操作

#### Scenario: 环境正在运行

- **WHEN** 环境正在运行、启动或停止，用户查看其启动器卡片
- **THEN** 内核切换按钮显示当前模式但不可操作，并说明必须先停止环境

#### Scenario: 切换到外部 Chrome 不可用

- **WHEN** 用户将环境切换为外部模式，但共享手动路径无效且自动发现找不到 Google Chrome
- **THEN** 系统显示具体错误并保留原环境模式

#### Scenario: 切换不覆盖其他配置

- **WHEN** 用户从启动器切换某一个环境的内核
- **THEN** 系统只修改该环境的 `engineMode`，其连接、备注、书签及其他环境配置保持不变
