## ADDED Requirements

### Requirement: 插件弹层区分面板状态与 API 兼容性
扩展弹层 MUST 将扩展面板加载结果与 manifest 声明的 API 兼容性分别呈现。对声明 `userScripts` 权限的扩展，内置 Electron 引擎 MUST 显示未声明支持该 API 的兼容性提示；该提示 MUST NOT 表示面板加载失败或授予任何扩展权限。

#### Scenario: 面板成功打开但声明 userScripts
- **WHEN** 用户打开声明 `userScripts` 的扩展，且扩展面板页面成功加载
- **THEN** 面板正常显示，并单独呈现内置引擎的 API 兼容性说明

#### Scenario: 扩展面板加载失败
- **WHEN** 扩展面板页面无法加载
- **THEN** 弹层显示面板加载错误，且不以 API 兼容性提示取代该错误
