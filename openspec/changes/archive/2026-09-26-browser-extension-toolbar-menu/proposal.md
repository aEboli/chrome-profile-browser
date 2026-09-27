## Why

浏览器当前的插件弹层只有启停开关，与常见 Chromium 的扩展程序面板不一致。用户需要从浏览器窗口直接固定常用插件、查看插件信息，并进入完整管理页。

## What Changes

- 为每个浏览器环境保存独立的插件工具栏固定状态。
- 插件弹层按当前环境是否启用分组；每项提供固定按钮和详情操作。
- 插件详情展示清单中的简介、版本、网站访问范围和请求权限，并支持在当前环境启用或停用。
- 浏览器工具栏只显示当前环境中已启用且已固定的插件；弹层底部提供插件管理入口。

## Capabilities

### New Capabilities
- `browser-extension-toolbar-menu`: 浏览器扩展弹层、工具栏固定和插件详情行为。

### Modified Capabilities
- None.

## Impact

- `src/main/extension-manager.js`、`src/main/main.js`：读取并返回插件权限清单，保存每个环境的固定状态。
- `src/main/browser-shell-preload.js`、`src/renderer/browser-shell.html`、`src/renderer/browser-shell.js`、`src/renderer/browser-shell.css`：扩展弹层与工具栏操作。
- `openspec/spec.md`：同步浏览器扩展行为。
