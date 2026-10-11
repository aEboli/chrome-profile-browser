## Why

Tampermonkey BETA 的扩展弹窗可以在内置浏览器中打开，但其用户脚本功能依赖 `userScripts` API 和扩展级“允许用户脚本”授权。当前项目使用 Electron 内置 Chromium；Electron 只承诺支持 Chrome 扩展 API 的一个子集，且浏览器壳没有 Chrome 扩展详情页。结果是扩展弹窗已经显示，用户脚本仍报告无法访问当前网页，容易被误认为新标签被拦截。

## What Changes

- 浏览器壳识别声明 `userScripts` 权限的扩展，并在内置 Electron 引擎中展示明确的兼容性说明。
- 说明面板仍可打开，但该引擎未声明支持此 API；不把扩展自己的脚本权限错误显示成面板打开失败。
- 提供使用外部 Chromium 的操作指引；Chromium 138 及以上在扩展详情中管理“允许用户脚本”，更早版本通过扩展页开发者模式启用，具体由用户在 Chromium UI 中管理。
- Tampermonkey 脚本只通过其自身的导出/导入能力由用户显式迁移，不复制 Cookie、密码或整个 profile 数据目录。

## Capabilities

### New Capabilities

- `browser-extension-user-script-support`: 对依赖 `userScripts` 的扩展说明内置引擎能力，并指引用户使用外部 Chromium。

### Modified Capabilities

- `browser-extension-toolbar-menu`: 扩展面板打开状态与扩展 API 兼容性状态分别展示。

## Impact

- 修改浏览器壳的扩展能力状态展示与必要的主进程公开状态。
- 新增 `browser-extension-user-script-support` 增量规范，并更新扩展工具栏菜单规范。
- 新增 manifest 能力识别和 renderer 状态测试；Electron 窗口验收需确认提示不会遮挡扩展面板。

## Explicit Boundaries

- 不把扩展面板改成普通网站标签；`action.default_popup` 继续以扩展面板窗口打开。
- 不在内置 Electron 中伪造或 shim `chrome.userScripts`。
- 不自动更改全局浏览器引擎，不自动安装外部浏览器，也不自动复制 profile 或扩展存储。
- 不宣称 Tampermonkey 用户脚本可在内置 Electron 引擎运行。

## Validation

- manifest 声明 `userScripts` 的扩展在 Electron 模式显示兼容性提示；不声明该权限的扩展不显示该提示。
- 面板打开错误仍显示为面板错误，不与 API 能力提示混淆。
- 验证外部 Chromium 指引不触发引擎切换或 profile 数据复制。
- 运行相关扩展测试、`npm run check`、`npm test`、`git diff --check` 和 OpenSpec 严格校验。

## Approval

状态：待用户确认方案后实现。
