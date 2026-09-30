## 1. 规范

- [x] 1.1 在新标签页能力规范中记录 favicon 优先显示和文字回退。
- [x] 1.2 同步项目总规范。

## 2. 实现

- [x] 2.1 为手动和自动快捷入口复用 profile favicon IPC。
- [x] 2.2 增加图片加载失败回退和按 URL 的请求去重缓存。

## 3. 验证

- [x] 3.1 `node --check src/renderer/browser-shell.js`。
- [x] 3.2 `npm run check`。
- [x] 3.3 `node --test test/browser-shell-tabs.test.js test/new-tab-sites.test.js`。
- [x] 3.4 `openspec validate --all --strict --no-interactive`。
