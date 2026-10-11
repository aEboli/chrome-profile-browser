## Why

浏览器扩展弹层会列出当前环境未启用的插件，占用列表空间并让用户误以为这些插件可直接使用。弹层应聚焦于当前环境实际启用的插件，未启用插件继续通过完整插件管理页管理。

## What Changes

- 扩展弹层仅显示当前环境已启用的插件。
- 当前环境没有已启用插件时显示空状态，并保留插件管理入口。
- 保留已启用插件的固定、详情和停用操作。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `browser-extension-toolbar-menu`：弹层列表只展示当前环境已启用插件，并定义无已启用插件时的空状态。

## Impact

- 修改 `src/renderer/browser-shell.js` 和 `src/renderer/browser-shell.html` 的弹层渲染与空状态。
- 更新 `openspec/specs/browser-extension-toolbar-menu/spec.md` 和 `openspec/spec.md`。
- 在 `test/browser-shell-interactions.test.js` 增加筛选和空状态回归检查。
