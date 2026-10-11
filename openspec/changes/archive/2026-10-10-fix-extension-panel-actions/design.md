## Context

扩展 panel 通过当前 profile `Session` 加载 `chrome-extension://` URL。profile shell、webview guest 和网站 popup 已使用 `profileWindowOpenResponse()` 统一导航分类；扩展 panel 目前未设置该 handler。

本机 Tampermonkey BETA 清单声明 MV3 service worker。扩展面板的 Dashboard 路径使用后台消息并调用 `chrome.tabs.create`。Electron 的公开扩展 API 列表只列出部分 `chrome.tabs` 方法，不承诺该方法。

## Decisions

1. 扩展 panel 的新窗口请求复用 `profileWindowOpenResponse()`，不另建 URL 分类规则。
2. 允许创建的子窗口使用同一 profile session，并登记到 profile popup 生命周期。
3. 明确提示 Electron API 兼容范围，不 monkey-patch 扩展 API 或改写已安装扩展。
4. 用户需要完整 Tampermonkey 操作时使用外部 Chromium；外部引擎和 profile 迁移仍由用户显式管理。

## Risks

- 由 `chrome.tabs.create` 发起、而不是 `window.open()` 发起的操作仍可能无响应。
- 外部 Chromium profile 与内置 Electron profile 数据独立；不自动复制 Cookie、密码或扩展数据。

## Validation

- 源码回归测试确认 action 窗口复用 profile window policy 和 popup lifecycle。
- 标签策略测试确认扩展 URL 归入当前 profile 标签。
- Renderer 测试确认 API 限制和外部 Chromium 引导显示。
