# 新标签页快捷入口网站图标

## 目的

- 让新标签页的常用网站入口与网站自身的视觉标识保持一致。
- 保留没有可用 favicon 时的稳定文字回退，不影响入口导航。

## 变更

- 手动配置和自动识别的 HTTP(S) 快捷入口都通过当前浏览器环境的 profile session 获取网站 favicon。
- 获取成功后入口显示图片图标；获取失败、返回非图片或图片无法渲染时显示快捷入口原有的文字图标。
- favicon 请求按入口 URL 去重并缓存成功结果；入口被刷新或移除后，过期请求不能写入已移除的 DOM。
- 图标获取失败不会阻断新标签页渲染、搜索、快捷入口导航或现有设置编辑。

## 影响范围

- `src/renderer/browser-shell.js`：快捷入口图标加载、缓存和回退。
- `src/renderer/browser-shell.css`：图片图标和文字回退样式。
- `openspec/specs/new-tab-display-modes/spec.md`、`openspec/spec.md`：同步快捷入口图标行为。
