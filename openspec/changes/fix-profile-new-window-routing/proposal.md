## Why

当前内置浏览器会把带窗口尺寸参数的普通 `window.open()` 当成授权弹窗。站点通过 Ctrl/中键、新标签目标或先开空白页再跳转时，页面可能落在独立窗口或当前页面体验异常。用户要求授权可以使用弹窗，普通网站新窗口都进入内置标签栏，同时把误导入的五个收藏恢复。

## What Changes

- 明确的前台/后台标签 disposition 始终进入当前 profile 标签栏；普通新窗口请求也进入标签栏。
- 仅将明显的 OAuth/登录授权 URL 或明确命名的授权窗口保留为弹窗；窗口尺寸特征本身不触发弹窗。
- 对通用 `about:blank` 预创建窗口使用隐藏的短生命周期桥接：首次 HTTP(S) 跳转到普通网页时转入新标签页，跳转到可识别的授权地址时显示为当前 profile 的授权弹窗。
- 保持新标签、弹窗使用同一 profile session、代理认证和导航限制；授权弹窗随环境停止关闭。
- 修复完成并已核对恢复 5 个缺失收藏：Chrome 默认账号 1 个、Chrome Profile 2 的 4 个，写入前备份原 profile 状态。

## Capabilities

### New Capabilities

- `profile-window-navigation`: 普通网站新窗口进入标签，授权窗口可保留为 profile 内弹窗，空白页跳转正确分流。

### Modified Capabilities

无。

## Impact

- 修改 `src/main/main.js` 的 profile window-open 决策和空白窗口跳转接管。
- 新增纯函数模块和行为测试，覆盖 disposition、普通窗口尺寸、授权 URL、命名授权窗口及空白页跳转分流。
- 更新 `test/browser-context-menu-media-downloads.test.js` 及项目 OpenSpec。
- 保留当前未提交工作区改动，不回滚订阅、下载、历史、Agent 或布局相关的其他修改。

## Explicit Boundaries

- 只在当前内置 profile 标签栏/弹窗内处理；不创建独立脱离 profile 的浏览器应用窗口。
- Ctrl/中键的明确标签意图优先于授权 URL 分类，确保其始终开标签。
- 仅对 HTTP(S) 新文档导航进行隐藏桥接；不改变下载、外部协议或当前标签的普通导航。
- 收藏恢复已单独完成并备份，不作为每次启动时的自动导入或同步功能。
