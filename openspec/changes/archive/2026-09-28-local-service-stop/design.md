## 设计

- 本地服务发现结果保留已识别服务对应的 PID，renderer 提交 PID、端口和当前项目名供主进程复核。
- preload 暴露独立的 `stopLocalListener` IPC 方法；主进程 handler 复用本地服务发现逻辑完成二次校验。
- renderer 复用现有 `requestShellConfirmation` 弹窗，不引入浏览器原生 `confirm`，并在确认后重新读取列表。
- 主进程通过 `taskkill.exe /PID <pid> /T /F` 停止已复核的目标进程树；输入不包含命令行或可执行文件路径。
