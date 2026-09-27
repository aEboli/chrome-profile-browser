## Why

运行中的环境编辑表单目前仍允许修改必须停机才能应用的配置，用户提交后才会收到拒绝提示。提前将这些字段显示为锁定状态并说明原因，可以避免误改，同时保留名称和启动网址的即时修改能力。

## What Changes

- 运行、启动、停止、切换连接或保存等状态下，锁定连接方式、授权测试站点来源和备注。
- 点击锁定字段时提示用户先停止环境；环境停止后恢复编辑。
- 名称和启动网址在运行时仍可编辑和保存。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-live-name-and-start-url-edit`: 明确运行及过渡状态下其他配置字段的锁定和提示行为。

## Impact

- `src/renderer/index.html`、`src/renderer/renderer.js`、`src/renderer/styles.css`：环境编辑表单的锁定状态、提示和保存值读取。
- `test/workbench-enhancements.test.js`：增加界面行为回归断言。
- `openspec/specs/profile-live-name-and-start-url-edit/spec.md`：归档时同步受保护字段的界面要求。
