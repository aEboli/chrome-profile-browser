## Why

密码簿记录平铺显示，查找同一网站的多个账号不够直观；网页登录重复提交相同网站和账号时，现有保存提示也没有明确说明将更新已有密码。

## What Changes

- 按 HTTP(S) origin 折叠密码簿记录，点击网站行展开账号；没有有效地址的记录按服务名归组。
- 让密码簿环境选择、搜索和添加按钮在桌面宽度内保持同一行，并在窄屏下调整布局。
- 对相同环境、origin 和账号的网页登录记录显示“更新”提示，确认后更新现有记录。
- 调整网页登录保存提示和密码候选弹窗，使其与浏览器壳的深色主题一致。

## Capabilities

### Modified Capabilities

- `password-book`: 增加网站分组和展开行为。

## Impact

- `src/renderer/index.html`、`src/renderer/renderer.js`、`src/renderer/styles.css`：密码簿分组、展开和工具栏布局。
- `src/renderer/browser-shell.js`、`src/renderer/browser-shell.css`、`src/main/browser-password-preload.js`：重复账号判断及弹窗样式。
- `openspec/spec.md`、密码簿规范和现有密码簿变更记录：同步行为要求。
- `test/password-book-ui.test.js`：覆盖新增页面和提示行为。
