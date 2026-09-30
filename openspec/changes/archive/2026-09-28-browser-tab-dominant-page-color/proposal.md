## Why

标签当前只使用 favicon 的主色，无法反映页面本身的视觉身份。页面可见区域通常比 favicon 更能说明当前标签的内容，因此需要在页面加载后把可见区域中占比最大的颜色同步到标签高亮。

## What Changes

- 对网页标签的可见截图进行低分辨率颜色量化，选择像素占比最大的颜色桶作为页面主色。
- 页面主色更新时同步活动标签的背景、边框和文字对比色；每个标签保留自己的颜色，切换标签时恢复对应颜色。
- 页面截图不可用、颜色数据无效或标签为新标签页时继续使用现有 favicon/主题回退色。
- 页面重新加载或发生页内导航时重新采样，避免旧页面颜色残留。

## Capabilities

### New Capabilities

- `browser-tab-dominant-page-color`: 网页标签根据可见页面主色显示高亮，并提供失败回退和可读性保证。

### Modified Capabilities

None. The existing tab switcher and motion requirements remain unchanged; this change only adds a new color source for the highlighter.

## Impact

- `src/renderer/browser-shell.js`：调用现有 webview 截图能力，采样主色并同步标签状态。
- `src/renderer/browser-shell.css`：提高活动标签主色表面的可见度并使用动态文字对比色。
- `test/browser-shell-tabs.test.js`：增加页面主色采样、状态重置和样式回归检查。
- 不新增依赖、IPC 或持久化字段；颜色只存在于当前窗口运行期间。
