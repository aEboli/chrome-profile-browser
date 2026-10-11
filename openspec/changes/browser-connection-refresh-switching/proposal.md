## Why

浏览器右上角的连接信息显示当前延迟和出口信息，但点击后不能主动更新。增加按连接模式重新检测的操作，让订阅自动环境可以即时择优切换，指定节点环境可以快速确认当前节点延迟。

## What Changes

- 将浏览器右上角的连接信息改为可点击的重新检测入口，并在检测期间提供处理中状态。
- 右键点击浏览器右上角连接信息时打开手动线路菜单，允许选择系统直连、订阅自动、订阅节点或手动节点。
- 手动线路菜单中的节点按出口 IP、国家/来源/属性、延迟或检查状态三行展示，并保留节点名、协议和服务器地址供辅助技术与悬浮提示识别。
- 订阅自动模式重新检测所选订阅的可用节点；当前线路仍是最低延迟时保持不变，否则通过现有本机转发路由热切到最低延迟线路。
- 指定节点模式只重新检测当前节点并更新连接信息，不切换节点、不重启浏览器。
- 系统直连模式重新检测直连，并在界面反馈结果。
- 检测结束后更新延迟、国家和 IP，并显示成功、失败或切线提示。

## Capabilities

### New Capabilities

- `browser-connection-refresh`: 描述浏览器连接信息的手动检测入口及直连、指定节点、订阅自动三种模式的行为。

### Modified Capabilities

无。

## Impact

- `src/main/main.js`、`src/main/browser-shell-preload.js`：按 profile 连接模式执行检查、订阅线路择优和热切换，并为浏览器壳提供脱敏线路列表和手动切换 IPC。
- `src/renderer/browser-shell.html`、`src/renderer/browser-shell.js`、`src/renderer/browser-shell.css`：连接信息的点击检测、右键线路菜单、处理中反馈和检测结果提示。
- `openspec/specs/browser-connection-refresh/spec.md`：归档时新增浏览器连接重测能力规范。
