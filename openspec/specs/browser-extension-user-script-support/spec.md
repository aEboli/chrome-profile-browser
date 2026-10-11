# browser-extension-user-script-support Specification

## Purpose
TBD - created by archiving change tampermonkey-user-scripts-support. Update Purpose after archive.

## Requirements

### Requirement: 说明内置浏览器的用户脚本 API 能力
浏览器 MUST 根据扩展 manifest 声明识别 `userScripts` 权限。内置 Electron 引擎中，系统 MUST 将面板打开状态与用户脚本 API 兼容性状态分开呈现，且 MUST NOT 暗示已授予扩展权限。

#### Scenario: 打开声明 userScripts 的扩展面板
- **WHEN** 用户在内置 Electron 环境打开声明 `userScripts` 权限的扩展
- **THEN** 扩展面板按现有行为打开，同时显示内置引擎未声明支持该 API 的兼容性说明

#### Scenario: 打开不声明 userScripts 的扩展面板
- **WHEN** 用户在内置 Electron 环境打开未声明 `userScripts` 权限的扩展
- **THEN** 系统不显示用户脚本 API 专属提示

#### Scenario: 面板自身加载失败
- **WHEN** 扩展面板页面无法加载
- **THEN** 系统显示面板加载错误，且不将其替换为用户脚本 API 兼容性提示

### Requirement: 用户控制外部 Chromium 与脚本迁移
系统 MUST 保留用户对外部 Chromium 引擎的显式选择。系统 MUST NOT 自动切换引擎或复制浏览器 profile 数据；用户脚本迁移 MUST 使用 Tampermonkey 自身的导出和导入流程。

#### Scenario: 查看外部 Chromium 指引
- **WHEN** 用户从兼容性提示查看解决路径
- **THEN** 系统说明 Chromium 138 及以上的扩展详情页授权步骤、更早版本的开发者模式步骤和 Tampermonkey 脚本导出/导入步骤，且不执行引擎切换或 profile 数据复制
