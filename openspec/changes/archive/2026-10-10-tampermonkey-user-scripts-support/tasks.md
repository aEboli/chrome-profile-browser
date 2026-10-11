## 1. 兼容性识别

- [x] 1.1 明确公共扩展状态中的 `userScripts` 权限字段和 Electron 引擎条件。
- [x] 1.2 为 manifest 权限识别增加针对性测试。

## 2. 提示与指引

- [x] 2.1 在扩展面板中显示独立的用户脚本 API 兼容性提示。
- [x] 2.2 提供外部 Chromium 授权和 Tampermonkey 手动备份/导入指引。
- [x] 2.3 保持面板加载错误与 API 兼容性提示互不覆盖。

## 3. 验证

- [x] 3.1 运行新增扩展兼容性测试及相关 renderer 测试。
- [x] 3.2 运行 `npm run check`、`npm test`、`git diff --check` 和 OpenSpec 严格校验。
- [x] 3.3 通过 DOM 回归核对提示位置、授权版本说明、手动脚本迁移指引和 profile 数据边界。
