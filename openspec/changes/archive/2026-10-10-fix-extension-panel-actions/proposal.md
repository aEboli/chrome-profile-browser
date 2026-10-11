## Why

扩展 action 页面由独立 `BrowserWindow` 加载，但该窗口没有接入 profile 的窗口打开策略。扩展页面通过 `window.open()` 打开的普通网页、授权页或扩展设置页无法沿用浏览器已有的 profile 标签和授权弹窗路由。

本机 Tampermonkey BETA 面板中，Dashboard 等操作会向扩展后台发送 `newTab` 请求，后台调用 `chrome.tabs.create`。Electron 只承诺一部分扩展 API，公开支持列表不含该方法，所以扩展界面能显示并不代表所有操作都能在内置引擎运行。

## What Changes

- 扩展 action 窗口的 `window.open()` 请求通过现有 profile 窗口策略处理；普通网页和扩展页进入当前 profile 标签，登录授权页保留 profile 弹窗。
- 兼容性提示说明 `chrome.tabs.create` 等未承诺 API 在内置 Electron 中可能无响应，并保留外部 Chromium 使用步骤。
- 不修改第三方扩展文件，不伪造 Electron 未提供的扩展 API。

## Capabilities

### Modified Capabilities

- `browser-extension-toolbar-menu`: action 窗口路由和扩展 API 兼容性提示。

## Impact

- 修改 `src/main/main.js` 中扩展 action 窗口的 `webContents` 路由。
- 更新浏览器扩展弹层文案、窗口策略测试和 OpenSpec。

## Boundaries

- 保留独立 action 窗口和当前 profile session。
- 普通页面与扩展页面沿用当前标签路由；授权页面沿用 profile 授权弹窗策略。
- 通过扩展 API `chrome.tabs.create` 发起的调用仍受 Electron API 支持范围限制。

## Validation

- 回归测试覆盖扩展 action 窗口接入 profile window-open policy、扩展页标签分类和兼容性提示。
- 运行相关测试、`npm run check`、`npm test`、`git diff --check` 和 OpenSpec 严格校验。
