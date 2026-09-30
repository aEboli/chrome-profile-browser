# 浏览器网页助手虚拟输入

## 目的

- 为 profile 浏览器提供只作用于当前活动页面视图的虚拟鼠标和键盘输入层；普通网页使用 `<webview>`，内置 `about:newtab` 使用受控的新标签页区域。
- 为后续接入 JEV 等快速判断模型提供稳定的观察与动作协议，不在本变更中引入模型服务或第三方网络请求。

## 行为

- 网页助手面板增加“观察页面”动作，并保留当前标签绑定关系。
- 支持结构化动作：`screenshot`、`mouse_move`、`click`、`mouse_down`、`mouse_up`、`scroll`、`drag`、`keypress`、`key_down`、`key_up`、`type` 和 `wait`。
- `scroll.deltaY` 使用模型侧约定：正数向下、负数向上；执行器会转换为 Chromium 的滚轮符号。
- 普通网页的鼠标动作通过当前 `<webview>.sendInputEvent()` 发送，文本输入使用当前页面焦点的 `<webview>.insertText()`；内置新标签页使用同一动作白名单映射到其根节点；不调用操作系统全局输入接口。
- `screenshot` 返回当前网页可视区域截图、CSS viewport 尺寸、标题、地址和受限页面正文；截图会按 viewport 尺寸归一化，模型坐标可以直接用于鼠标动作。
- 浏览器壳 renderer 暴露受限的 `window.browserAgent`：`capabilities()`、`observe()`、`execute(action)`、`executeBatch(actions)` 和 `context()`；shell preload 同时提供对应的 capability、observe、execute 与 batch bridge，便于未来由主进程接入模型。
- 面板文本支持坐标点击、双击、右键、拖拽、滚轮、键盘组合和文本输入；原有选择器点击/填写与页面采集动作保持兼容。
- 同一 profile 的动作按顺序串行执行；活动标签切换后坐标状态重置，动作不会转发到后台标签。

## 安全边界

- 所有动作先经过固定 schema、有限数值、动作类型和键名白名单校验；不接受任意 JavaScript、任意 Electron 方法或任意 IPC channel。文本、选择器、数值、按键、拖拽点和批次没有应用层固定上限。
- 坐标必须位于当前网页可视区域；等待必须为非负有限整数，拖拽至少包含两个点，滚动不能两个方向同时为零。长等待、点击序列、拖拽和动作批次可由用户停止。
- 虚拟输入只发送给当前页面视图，不模拟桌面级输入，不操作浏览器壳之外的窗口。
- 该能力只适用于内置 Electron 引擎；选择外部 Chromium 时没有可绑定的 `<webview>`，不会宣称能够控制外部窗口。
- 截图和页面正文只返回给当前 profile 窗口及其受控 bridge；当前版本不上传、不调用远程模型，也不自动提交登录、付款或其他敏感表单。
- 后续接入 JEV 时必须复用该动作白名单、串行队列和 profile sender 校验。

## 可验证成功标准

1. 面板可以捕获当前标签的截图和页面上下文，并在结果中显示尺寸、标题和地址。
2. 通过 `window.browserAgent.execute()` 或 preload bridge 执行点击、双击、滚轮、拖拽、按键和文本输入时，真实页面能收到对应事件。
3. 坐标越界、未知按键和无效动作会被拒绝并返回可读错误；超过原长度、数值和批次上限的有效输入不会被截断或拒绝。
4. 切换标签后动作只作用于新的活动标签，旧标签不会收到输入。
5. `npm test`、`npm run check` 通过，并有动作规范化、事件序列、界面入口和 bridge 的自动化覆盖。

## 任务

- [x] 增加纯函数动作 schema、键名归一化、事件序列和中文指令解析。
- [x] 接入当前 webview 的截图、鼠标、键盘、拖拽、滚轮和文本输入。
- [x] 增加 renderer、preload、主进程的受控 bridge。
- [x] 更新面板、测试、README 和总规范。

状态：已实现，并完成 Node 测试、语法检查和 Electron 实际输入 smoke 验证。
