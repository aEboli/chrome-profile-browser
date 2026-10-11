## 1. Window Routing

- [x] 1.1 将扩展 action 窗口接入 profile window-open handler。
- [x] 1.2 将 action 创建的子窗口登记到同 profile popup 生命周期。
- [x] 1.3 增加扩展 URL、普通 URL 和授权 URL 路由回归。

## 2. Compatibility Feedback

- [x] 2.1 说明 `chrome.tabs.create` 等未承诺 API 可能导致操作无响应。
- [x] 2.2 保留外部 Chromium 授权和 Tampermonkey 手动脚本迁移指引。
- [x] 2.3 增加提示文案回归测试。

## 3. Verification

- [x] 3.1 运行相关测试、`npm run check`、`npm test` 和 `git diff --check`。
- [x] 3.2 严格校验 OpenSpec 并归档变更。
