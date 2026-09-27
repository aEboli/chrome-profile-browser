# Agent 浏览器权限与标签控制

> 扩展 [`agent-model-browser-control.md`](agent-model-browser-control.md)，让网页 Agent 在当前 profile 的内置浏览器中完成连续网页任务。

## 目的

- 让 Agent 能像浏览器用户一样在当前 profile 内进入和操作网页。
- 让网页打开的新窗口保持在同一浏览器环境的标签栏中。
- 让网页使用摄像头、麦克风、剪贴板、通知、地理位置、存储、设备和屏幕捕获等 Chromium 权限时，不被壳层默认拒绝。

## 行为

- Agent 可以列出、新建、切换和关闭标签，并在指定标签中导航、后退、前进、刷新或停止加载。
- `target=_blank`、`window.open` 和网页弹窗请求会被转换为当前 profile 的新标签；不会创建脱离 profile 的额外应用窗口。
- Agent 工具支持页面观察、坐标鼠标/键盘输入、CSS 选择器点击/填写/下拉选择、下载记录读取和连续等待。
- profile session 自动接受网页权限请求，开启设备权限、USB 类别和屏幕捕获处理；网页下载保存到该 profile 的独立下载目录并同步进度。
- `humanVerification` 仍作为观察结果中的页面状态提示，但不会自动暂停模型工具调用；用户可以随时停止 Agent。

## 边界

- 权限开放只作用于当前 profile 的内置 Electron `<webview>` 和其持久化 session，不控制外部 Chromium 进程或浏览器壳之外的操作系统窗口。
- Agent 继续使用固定页面动作模板，不接受任意 JavaScript；应用保留 Electron 的进程隔离和上下文隔离。
- 导航允许 Chromium 可渲染的页面协议，明确拒绝 `javascript:` 导航。

## 可验证成功标准

1. Agent 能通过工具列出、新建、切换、关闭标签，并在指定标签执行导航和后退/前进/刷新。
2. 网页的 `target=_blank` 或 `window.open` 请求在当前 profile 标签栏打开。
3. profile session 注册权限检查、权限请求、设备权限、USB 类别、屏幕捕获和下载处理器；下载记录可由 Agent 查询。
4. 页面带有人机验证标记时，模型仍能收到观察结果并继续执行普通网页工具，用户停止操作后循环结束。
5. `npm run check` 和 `npm test` 通过。

## 任务

- [x] 注册 profile 浏览器权限与下载处理。
- [x] 将网页新窗口转入 profile 标签栏。
- [x] 增加 Agent 标签、导航、选择器和下载工具。
- [x] 移除模型循环的人机验证自动暂停。
- [x] 增加静态回归测试并完成全量验证。

状态：已实现。
