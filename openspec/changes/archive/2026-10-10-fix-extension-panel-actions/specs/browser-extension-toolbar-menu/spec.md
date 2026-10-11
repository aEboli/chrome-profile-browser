## MODIFIED Requirements

### Requirement: 插件弹层区分面板状态与 API 兼容性
扩展弹层 MUST 将扩展面板加载结果与 manifest 声明的 API 兼容性分别呈现。对声明 `userScripts` 权限的扩展，内置 Electron 引擎 MUST 显示兼容性提示，说明内置引擎只支持部分 Chrome 扩展 API，并为依赖未支持 API 的操作提供外部 Chromium 指引。该提示 MUST NOT 表示面板加载失败或授予任何扩展权限。

扩展 action panel 发起的 `window.open()` MUST 使用当前 profile 的窗口打开策略，并复用该 profile 的 session。

#### Scenario: 面板成功打开但声明 userScripts
- **WHEN** 用户打开声明 `userScripts` 的扩展，且扩展面板页面成功加载
- **THEN** 面板正常显示，并单独呈现扩展 API 兼容性提示和外部 Chromium 指引

#### Scenario: 扩展 action 页面打开普通网页或扩展页面
- **WHEN** 扩展 action panel 使用 `window.open()` 打开普通网页或扩展 URL
- **THEN** 目标进入当前 profile 标签并复用当前 profile session

#### Scenario: 扩展 action 页面打开授权 URL
- **WHEN** 扩展 action panel 使用 `window.open()` 打开可识别的授权 URL
- **THEN** 目标沿用当前 profile 授权弹窗策略

#### Scenario: 扩展 action 页面加载失败
- **WHEN** 扩展 action panel 加载失败
- **THEN** 弹层显示面板加载错误，且不以 API 兼容性提示取代该错误

#### Scenario: 扩展面板加载失败
- **WHEN** 扩展面板页面无法加载
- **THEN** 弹层显示面板加载错误，且不以 API 兼容性提示取代该错误
