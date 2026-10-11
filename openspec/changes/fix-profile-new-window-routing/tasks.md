## 1. 需求与方案

- [x] 1.1 确认问题位于 profile `setWindowOpenHandler()` 的 popup 分类。
- [ ] 1.2 用户确认普通链接/新窗口归入标签、授权流程可保留弹窗的分类和空白页跳转方案。

## 2. 实现

- [ ] 2.1 增加纯 window-open 策略分类与单元测试。
- [ ] 2.2 将 Ctrl/中键 disposition 和普通网站 URL 优先路由至 profile 标签。
- [ ] 2.3 实现空白窗口隐藏接管、普通跳转转标签、授权跳转显示弹窗和超时清理。
- [ ] 2.4 保留 session、代理认证、安全导航和环境停止清理行为。

## 3. 恢复收藏

- [x] 3.1 从 Chrome `AccountBookmarks` 恢复缺失的 1 项。
- [x] 3.2 从 Chrome Profile 2 `AccountBookmarks` 恢复缺失的 4 项。
- [x] 3.3 按完整 URL 去重，保留目标 profile 其他收藏，并备份写入前状态。

## 4. 验证与交付

- [ ] 4.1 运行分类、shell/guest 回归测试和全量测试/检查。
- [ ] 4.2 隔离 Electron 手动验证 Ctrl-click、普通新标签跳转、尺寸窗口及授权 popup。
- [x] 4.3 核对恢复的五个 URL 和备份文件。
- [ ] 4.4 OpenSpec 严格校验并归档变更。
