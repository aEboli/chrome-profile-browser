## Why

标签栏空间有限，标签标题与关闭入口容易挨得太近，用户也缺少集中查找和恢复标签的入口。按 Chrome 标签切换面板的交互补齐首部列表入口，并让标签状态变化更清楚。

## What Changes

- 在标签栏最前面提供可访问的标签列表按钮，打开按标题和网址实时筛选的面板。
- 面板支持切换、单独关闭打开的标签，以及恢复当前窗口运行期间最近关闭的网页标签。
- 标签栏关闭图标在悬停或键盘聚焦时显示，空闲时隐藏并保留稳定的标签宽度，减少误关。
- 活动标签高亮随切换平滑移动；新增和重排保留短暂过渡，并尊重系统减少动态效果设置。

## Capabilities

### New Capabilities

- `chrome-tab-switcher-and-motion`: 搜索和管理打开/最近关闭的标签，并呈现可减少的标签动效。

### Modified Capabilities

None.

## Impact

- `src/renderer/browser-shell.html`、`src/renderer/browser-shell.css`、`src/renderer/browser-shell.js`：面板、标签同步与动效。
- `test/browser-shell-tabs.test.js`：浏览器壳回归检查。
- `openspec/spec.md`：项目总规范中的标签行为和成功标准。
