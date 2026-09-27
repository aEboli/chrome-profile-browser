# Agent、JEV 与插件面板

> 本增量扩展 [`agent-model-browser-control.md`](agent-model-browser-control.md) 和 [`extension-management.md`](extension-management.md)，为网页助手提供独立的配置界面、环境作用域，并接入 TypeSafe JEV provider。

## 行为

- 独立的 Agent 配置页维护默认 Agent/JEV 配置和环境作用域；配置可以作用于全部环境，也可以只作用于勾选的环境，插件管理页只管理插件。
- Agent 配置页的 Agent 字段和高级参数使用紧凑的左右两列布局；模型输入框聚焦时由主进程按协议读取模型列表，也允许手动填写；图标按钮可发起模型刷新和接口连通性测试。
- 每个环境可以保存 Agent/JEV 覆盖配置；未保存覆盖时继承全局配置。浏览器 Shell 内的 Agent 设置默认保存为当前环境覆盖，管理页用于维护全局默认和环境激活范围。
- Agent 覆盖配置中的 Agent Token 与 JEV Key 只由主进程读取，并沿用系统安全存储确认流程；公共状态与 renderer 不返回密钥内容。
- JEV 使用 TypeSafe System One HTTP 契约：官方 provider 默认 `https://api.typesafe.ai/v1/systemone`、`jev-latest` 和 Bearer Key；也支持填写自定义 JEV 兼容端点。JEV 是结构化判断 provider，不伪装成聊天补全协议。
- 主进程提供受 profile sender 校验保护的 JEV 判断入口，Agent 通过显式 `jev_decide` 工具按需复用该 provider；本增量不自动改变 Agent 的聊天循环或强制发起协同请求。
- 插件 manifest 解析 `action.default_popup`、旧版 `browser_action/page_action.default_popup`、`side_panel.default_path` 和 options 页面入口。浏览器插件弹层中，有面板且已启用的插件名称与图标可点击打开面板；没有面板或未启用时保持静态展示。
- 面板使用当前 Electron profile session 的 `chrome-extension://` URL 和独立 BrowserWindow 打开，环境停止时关闭关联面板。

## 安全边界

- profile 覆盖只接受已存在的环境 ID；删除环境时同步清理 Agent 激活范围和覆盖配置。
- JEV 自定义地址只允许 HTTP(S)，禁止账号密码；面板路径拒绝绝对路径、路径穿越和非 Chrome 扩展 ID。
- Agent/JEV 请求继续受现有 URL、超时、请求体和响应体限制；JEV 不执行浏览器动作，也不绕过 Agent 工具白名单。

## 可验证成功标准

1. 独立 Agent 配置页可保存 Agent/JEV 默认配置、选择全部/指定环境，并为单个环境读取、保存和恢复覆盖配置；插件管理页不再包含 Agent 配置卡片。
2. Agent 模型输入框可自动获取模型列表，接口连通性测试只显示状态，不持久化临时 Token。
3. 有效 profile 的浏览器 Shell 能收到解析后的 Agent 配置；禁用环境不会发送 Agent 聊天请求。
4. JEV 请求构造为官方 `state/model/questions` 形状，认证为 Bearer Key，自定义 provider 可替换基础地址；响应能解析 `answers` 和 `usage`，Agent 可通过 `jev_decide` 工具按需调用。
5. 带 popup、side panel 或 options 入口的启用插件可通过名称或图标打开；无入口插件不会生成可点击面板入口。
6. `npm run check`、`npm test` 和新增的 JEV、manifest 面板、Agent 作用域测试全部通过。

状态：已实现并完成 `npm run check`、`npm test` 自动化验证；实际桌面窗口截图验证受当前计算机自动化授权不可用影响。
