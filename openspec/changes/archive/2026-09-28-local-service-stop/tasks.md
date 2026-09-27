## 任务

- [x] 为发现结果补充服务 PID，并实现主进程停止 handler。
- [x] 在 preload 和 renderer 增加停止 IPC、图标、确认流程和刷新反馈。
- [x] 同步本地服务既有断言和总规范。
- [x] 完成 JavaScript 语法检查及静态接口核对。

## 验证

1. `src/main/local-listeners.js`、`src/main/main.js`、`src/main/browser-shell-preload.js`、`src/renderer/browser-shell.js` 和既有本地服务测试脚本均通过 `node --check`。
2. 静态核对确认停止图标、确认弹窗、preload IPC、主进程 handler 和刷新反馈均已连接。
3. 当前 CUA 桌面复核因 `Codex auth token is unavailable` 未执行，真实 Windows 服务停止和 Electron 窗口交互仍需在桌面环境复核。

状态：已实现并归档。
