## Why

图片右键菜单已有打开、另存为和复制地址操作，但无法直接复制图片内容或把图片地址分享为二维码。补齐这两项常见操作，让图片菜单覆盖参考中的完整流程。

## What Changes

- 图片右键菜单增加“复制图片”，把鼠标右键位置对应的图片复制到剪贴板。
- 图片右键菜单增加“为此图片创建二维码”，显示当前图片地址对应的二维码。

## Capabilities

### New Capabilities

- `browser-image-context-menu`: 浏览器图片上下文菜单的操作及其结果。

### Modified Capabilities

None.

## Impact

- `src/main/main.js`：当前 guest 的图片复制和二维码窗口。
- `test/browser-context-menu-media-downloads.test.js`：图片菜单回归检查。
- `openspec/spec.md` 和现有右键菜单验收说明：记录菜单项与验证要求。
