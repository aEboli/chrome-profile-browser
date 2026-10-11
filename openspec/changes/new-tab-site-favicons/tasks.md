## 1. 规范

- [x] 1.1 在新标签页能力规范中记录 favicon 优先显示和文字回退。
- [x] 1.2 同步项目总规范。

## 2. 实现

- [x] 2.1 为手动和自动快捷入口复用 profile favicon IPC，并解析页面图标声明和 Web App Manifest。
- [x] 2.2 增加图片加载失败回退和按 URL 的请求去重缓存。

## 3. 验证

- [x] 3.1 `node --check src/renderer/browser-shell.js`。
- [x] 3.2 `npm run check`。
- [x] 3.3 `node --test test/browser-shell-tabs.test.js test/new-tab-sites.test.js`。
- [x] 3.4 `openspec validate --all --strict --no-interactive`。

## 4. 持久化缓存

- [x] 4.1 为成功获取的 favicon 增加按 profile 隔离的持久缓存，并在启动时优先显示缓存。
- [x] 4.2 在手动与自动快捷入口列表加载完成后清理已移除入口的缓存，并忽略失效的缓存图片。
- [ ] 4.3 覆盖持久化、profile 隔离、移除清理和存储不可用回退。
- [x] 4.4 运行 `node --check`、`npm run check` 和 OpenSpec 严格校验；目标测试未运行。
