# browser-extension-toolbar-menu Specification

## Purpose
规范本地浏览器插件弹层、按环境隔离的插件工具栏固定状态、扩展清单权限详情展示以及进入完整插件管理页的交互行为。

## Requirements

### Requirement: 浏览器扩展弹层管理工具栏固定状态

系统 MUST 按当前浏览器环境保存插件是否固定到工具栏。工具栏 MUST 只显示当前环境中已启用且已固定的插件。固定状态 MUST 与插件启用状态分开保存。

#### Scenario: 固定已启用的插件
- **WHEN** 用户在插件弹层中固定当前环境已启用的插件
- **THEN** 插件图标显示在该环境的浏览器工具栏中，其他环境的固定状态不变

#### Scenario: 取消固定或停用插件
- **WHEN** 用户取消固定插件或停用插件
- **THEN** 图标从当前环境工具栏移除，插件启用状态与固定偏好分别保留

#### Scenario: 再次启用已固定插件
- **WHEN** 用户重新启用一个保留固定偏好的插件
- **THEN** 插件图标重新显示在当前环境工具栏中

### Requirement: 浏览器扩展弹层提供插件信息和管理入口

系统 MUST 在浏览器扩展弹层中只列出当前环境已启用的插件，不得显示未启用的插件。每个列出的插件 MUST 支持固定操作和详情展开；详情 MUST 展示可用的简介、版本、网站访问范围和请求权限，并提供当前环境的停用操作。当前环境没有已启用插件时，弹层 MUST 显示空状态。弹层 MUST 提供进入完整插件管理页的入口，以便管理未启用插件。

#### Scenario: 隐藏当前环境未启用的插件
- **WHEN** 浏览器扩展弹层包含已启用和未启用插件
- **THEN** 弹层只列出当前环境已启用的插件

#### Scenario: 当前环境没有已启用插件
- **WHEN** 当前环境没有任何已启用插件
- **THEN** 弹层不显示插件条目并显示空状态，同时保留插件管理入口

#### Scenario: 查看插件详情
- **WHEN** 用户打开插件详情
- **THEN** 弹层显示已保存或从 manifest 读取的信息；缺少可选字段时显示明确的无声明状态

#### Scenario: 打开无面板插件的固定图标
- **WHEN** 用户点击已固定且启用、但没有 popup、side panel 或 options 入口的工具栏图标
- **THEN** 浏览器打开插件列表并展开该插件详情

#### Scenario: 打开完整管理页
- **WHEN** 用户点击弹层底部的插件管理入口
- **THEN** 主工作台切换到现有插件管理页

#### Scenario: 展示权限清单
- **WHEN** 插件详情显示权限
- **THEN** 界面只展示 manifest 声明的信息，不授予或更改 Chromium 的网站访问权限

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
