## ADDED Requirements

### Requirement: 普通新窗口在 profile 标签栏打开
内置 profile MUST 将普通 `target=_blank`、Ctrl/中键、网站新标签请求和普通带尺寸 `window.open()` 请求路由到当前 profile 标签栏，不创建独立的可见原生浏览器窗口。

#### Scenario: Ctrl 或中键点击
- **WHEN** Chromium 报告明确的 `foreground-tab` 或 `background-tab` disposition
- **THEN** 目标进入当前 profile 的相应前台或后台标签，忽略窗口 features 中的普通尺寸参数

#### Scenario: 普通带窗口尺寸的新页面
- **WHEN** 页面调用带 `width` 或 `height` 参数的 `window.open()` 打开普通 HTTP(S) URL
- **THEN** 目标 URL 直接在当前 profile 新标签中打开

### Requirement: 授权弹窗保留 profile session
系统 MUST 只将被识别为 OAuth 或登录授权的弹窗作为可见 profile 弹窗打开，并保留原 session、代理认证和导航限制。窗口尺寸等普通 features 或通用命名 MUST NOT 单独触发弹窗。

#### Scenario: 授权 URL 打开
- **WHEN** 页面打开已识别的 OAuth、授权或登录 URL
- **THEN** 目标在当前 profile 的授权弹窗显示，原页面与活动标签保留

#### Scenario: 关闭 profile 环境
- **WHEN** 用户停止该 profile
- **THEN** 属于该 profile 的授权弹窗一并关闭

### Requirement: 空白新窗口后续跳转正确分流
系统 MUST 安全处理站点先打开 `about:blank`、再设置目标 URL 的窗口流程。

#### Scenario: 空白窗口跳转普通网址
- **WHEN** 通用空白窗口首次跳转到普通 HTTP(S) 文档
- **THEN** 隐藏辅助窗口将目标交给当前 profile 标签栏后关闭

#### Scenario: 空白窗口跳转授权地址
- **WHEN** 通用空白窗口首次跳转到可识别的授权地址
- **THEN** 辅助窗口显示为授权弹窗并继续导航
