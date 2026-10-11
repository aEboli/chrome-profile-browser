## ADDED Requirements

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
