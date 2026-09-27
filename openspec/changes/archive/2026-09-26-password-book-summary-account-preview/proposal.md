## Why

密码簿的网站分组收起时只显示网站地址和展开箭头。用户需要展开每个网站才能确认账号、查看密码或判断账号数量。

## What Changes

- 收起的网站行显示该组第一个账号、对应的掩码密码和账号数量。
- 密码沿用现有的悬停/聚焦显隐机制；离开或失焦后立即清空并恢复掩码。
- 保持点击网站行展开分组的现有行为，并为窄屏调整摘要字段布局。

## Capabilities

### Modified Capabilities

- `password-book`: 在收起的网站行预览首个账号和掩码密码，并显示账号数量。

## Impact

- `src/renderer/renderer.js`、`src/renderer/styles.css`：网站摘要行和窄屏布局。
- `test/password-book-ui.test.js`：覆盖首账号预览、受控密码显示和账号数量。
- `openspec/specs/password-book/spec.md`、`openspec/spec.md`：同步密码簿行为。
