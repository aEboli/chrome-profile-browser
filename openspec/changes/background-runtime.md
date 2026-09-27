# 最小化后台运行

## 目的

- 环境窗口最小化或隐藏后，尽量保持页面和 Chromium 插件的后台计时器运行，减少依赖后台轮询的插件失效。

## 行为

- 内置 Electron profile 的宿主 `BrowserWindow` 设置 `backgroundThrottling: false`；同一窗口承载的 `<webview>` 随宿主保持活动。
- 该设置只影响 Electron 内置引擎，不改变外部 Chromium 的启动参数或后台策略。
- 该设置不保证 Manifest V3 Service Worker 常驻；插件自身的生命周期、系统睡眠和资源压力仍然适用。
- 关闭后台节流可能增加 CPU、GPU 和电量消耗。

## 验收标准

1. 内置 Electron 环境的 profile 窗口配置 `backgroundThrottling: false`。
2. 最小化环境后，宿主页面与嵌入的 `<webview>` 不使用默认后台页面节流。
3. 外部 Chromium 行为和 Manifest V3 Service Worker 限制在文档中明确说明。
4. `npm test` 和 `npm run check` 通过。

## 任务

- [x] 在 profile 宿主窗口关闭后台节流。
- [x] 更新 README 与总规范中的行为和限制说明。
- [x] 运行 `npm test` 和 `npm run check`。
- [ ] 在桌面环境手动最小化并观察目标插件行为。

状态：已实现并完成自动化验证；窗口级手动验证需要实际桌面运行目标插件。
