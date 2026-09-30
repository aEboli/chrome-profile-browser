## Why

沉浸背景的不透明度和模糊度目前取自全局主题设置。用户在新标签页右上角切换显示模式时，无法就地调整背景效果；修改全局主题还会影响管理页和浏览器壳层。

## What Changes

- 在新标签页右上角显示模式菜单中增加背景不透明度和模糊度滑块，调整时立即预览。
- 将两个值作为独立的新标签页设置保存，并同步到当前及其他已打开的新标签页；重启后保留。
- 保留已有显示模式、搜索框和常用网站交互。

## Capabilities

### Modified Capabilities

- `new-tab-display-modes`: 增加沉浸背景参数的直接控制与持久化。

## Impact

- `src/main/store.js`、`src/main/main.js`：设置默认值、边界校验和公开设置同步。
- `src/renderer/browser-shell.js`、`src/renderer/browser-shell.css`：右上角滑块、实时预览和背景样式。
- `test/store.test.js`、`test/browser-shell-tabs.test.js`：持久化与界面回归。
