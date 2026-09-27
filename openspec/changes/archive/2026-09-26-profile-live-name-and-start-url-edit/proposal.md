## Why

环境名称和启动网址只是描述与下一次启动参数，当前却必须先关闭环境才能保存，打断了正在进行的浏览。允许它们运行时更新后，配置中心、启动中的 Electron 壳层和后续启动都能及时使用新值。

## What Changes

- 运行中的环境允许保存名称和启动网址的修改。
- 内置 Electron 环境立即同步窗口标题和壳层名称；当前网页保持原样，更新的网址用于后续启动。
- 连接、授权身份、备注等其他配置仍要求先停止环境。
- 外部 Chromium 保持当前进程，名称在管理界面即时更新，新的启动网址用于下一次启动。

## Capabilities

### New Capabilities
- `profile-live-name-and-start-url-edit`: 运行中环境的名称与启动网址编辑行为。

### Modified Capabilities
- None.

## Impact

- `src/main/main.js`：运行中保存校验、环境元数据广播及启动过程读取最新值。
- `src/main/browser-shell-preload.js`、`src/renderer/browser-shell.js`：将主进程更新安全地同步到内置浏览器壳。
- `test/main-lifecycle.test.js`：运行中允许与受保护配置仍需停止的回归覆盖。
- `openspec/spec.md`：同步项目行为规范。
