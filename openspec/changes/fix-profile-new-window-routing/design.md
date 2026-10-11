## Context

profile 网页载入 Electron `<webview>`。当前 `profileWindowOpenResponse()` 先检查 `features`，任何非空尺寸或窗口参数都会允许原生 `BrowserWindow`，因此普通网站的带尺寸新窗口不进入壳层标签。`target=_blank`、Ctrl/中键和站点脚本共用 `setWindowOpenHandler()`。

Chrome 默认 profile 的 `AccountBookmarks` 与 Profile 2 的 `AccountBookmarks` 已包含用户导入但应用状态中缺失的五条 HTTP(S) 收藏。恢复操作按规范化完整 URL 去重并复用 `API` 文件夹、创建缺少的 `1688` 文件夹，原状态文件在写入前备份，不清空其他既有收藏。

## Decisions

1. 提取无副作用的 window-open 分类模块，优先将 `foreground-tab` / `background-tab` 判为标签。识别到授权端点或明确的授权 frame name 才允许可见弹窗。`width=...` 等窗口尺寸不能单独改变普通 URL 的标签语义；`noopener`/`noreferrer` 安全特性不算 popup 特性。
2. 普通真实 HTTP(S) URL 被拒绝为原生窗口，并通过 `sendProfileTabOpen()` 进入当前 profile 标签；后台 disposition 保持当前活动标签。
3. 通用空白预创建请求打开 `show:false` 的同 session 辅助窗口。其首个安全 HTTP(S) 导航被分类：普通 URL 被拦截并转入当前标签栏；授权 URL 则显示为 profile 授权弹窗并继续导航。空白辅助窗口设生命周期上限，避免悬挂。
4. 授权判定用 OAuth/authorize/auth/login/SSO 路径及已知提供商登录入口，并识别 `oauth`、`login` 等授权命名窗口。通用具名窗口也归入当前标签栏。
5. 恢复的五条书签写入前备份 `%APPDATA%\chrome-profile-browser\state.json`；恢复时按规范化后的完整 HTTP(S) URL 与既有记录去重，保留文件夹层级，不替换已有同 URL 记录。

## Risks / Trade-offs

- 站点若用非典型路径作为 OAuth 授权入口，可能会以标签打开；可在新增回归案例中根据已知站点 URL 补充精确规则。
- 空白中转窗口无法完整等价模拟网页脚本对 `window.opener`、`document.write()` 或 POST 表单的所有操作。遇到授权流程时按授权 URL/名称提升为弹窗；普通文档跳转必须路由成标签。
- 该目录已有大量未提交改动；实施只触及 window-open 决策、测试和新 OpenSpec 文件，避免覆盖其他工作。

## Validation

- 单元测试：Ctrl/中键的 foreground/background disposition 始终创建标签；普通 `_blank` 和尺寸窗口进入标签；授权 URL/名称保留弹窗；空白页普通导航转标签、授权导航升级弹窗。
- 回归测试：弹窗与标签沿用同 profile session，关闭环境会关闭弹窗。
- 数据检查：目标环境保留恢复的 5 条收藏且不新增重复链接；写入前备份仍存在。
- `npm test`、`npm run check`、`git diff --check` 和 OpenSpec 严格校验通过。
- 安全手动验收：隔离页面分别触发 Ctrl-click、普通 `target=_blank`、尺寸型 `window.open()`、OAuth 授权窗口及空白页后跳转。
