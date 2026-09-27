## Why

收藏栏目前只显示通用图案，收藏条目也没有管理入口。网站图标和右键操作能让用户更快识别、整理和维护常用页面。

## What Changes

- 收藏栏优先显示网页提供的网站图标；图标缺失时尝试加载网站根路径的 `/favicon.ico`。
- 在收藏栏空白处右键可添加当前页面或新建文件夹；文件夹可展开，并可在文件夹内继续创建收藏和文件夹。
- 收藏链接右键可在当前标签或新标签打开、编辑标题和地址、删除。
- 文件夹右键可新建内容、重命名或删除；删除非空文件夹前确认，并递归删除其内容。
- 收藏、文件夹及图标地址按浏览器 profile 保存；旧收藏数据继续显示为根目录链接。

## Capabilities

### New Capabilities
- `bookmark-bar-management`: 收藏栏的网站图标、文件夹组织与右键管理行为。

### Modified Capabilities
- None.

## Impact

- `src/main/main.js`：收藏数据规范化、profile 持久化和收藏/文件夹 IPC 校验。
- `src/main/browser-shell-preload.js`：暴露受限的收藏和文件夹操作。
- `src/renderer/browser-shell.js`、`browser-shell.html`、`browser-shell.css`：网站图标、文件夹展开、右键菜单和编辑交互。
- `test/`：收藏数据、IPC 和浏览器壳交互的回归验证。
- 归档时更新 `openspec/spec.md` 并生成 `openspec/specs/bookmark-bar-management/spec.md`。
