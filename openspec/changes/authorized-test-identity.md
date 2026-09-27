# 授权测试站点的按环境测试身份

## 目的

- 为每个浏览器环境生成并持久化一个应用控制的稳定测试身份 UUID。
- 允许用户为环境填写精确的 HTTP(S) 来源白名单。
- 内置 Electron 引擎仅向白名单来源的请求添加 `X-CPB-Test-Identity` 请求头，供自有或获授权测试站点识别当前环境。

## 约束

- 测试身份是应用定义的业务标识，不伪装成硬件序列号、系统设备 ID 或标准浏览器指纹。
- 不修改 User-Agent、Client Hints、Canvas、WebGL、Audio、字体、屏幕、硬件参数、TLS 或 WebRTC 指纹。
- 来源必须是精确的 `http://` 或 `https://` origin，不接受路径、查询、通配符、凭据或跨来源匹配。
- 外部 Chromium 只支持独立用户数据目录和代理参数，不能注入该请求头；启动时必须给出明确提示。
- 请求头只在 Electron 的 profile session 中生效，`OPTIONS` 预检请求不添加该标识。

## 可验证成功标准

1. 新建环境时生成稳定 UUID；编辑或重启后 UUID 不变，旧 profile 缺失时自动补齐。
2. 无效来源、带路径来源、通配符和非 HTTP(S) 来源被拒绝；有效来源去重并规范化默认端口。
3. 白名单 origin 的 Electron 请求包含 `X-CPB-Test-Identity`，其他 origin、无白名单环境和预检请求不包含该请求头。
4. 外部 Chromium 环境不会伪称已启用测试身份，返回明确的不支持提示。
5. `npm test` 与 `npm run check` 通过；文档明确该能力不是完整浏览器指纹隔离。

## 任务

- [x] 增加身份生成、旧 profile 补齐和 origin 校验。
- [x] 在 Electron session 中按白名单注入请求头，并在外部 Chromium 中提示不支持。
- [x] 增加环境配置字段、文档和自动化测试。

状态：已实现。
