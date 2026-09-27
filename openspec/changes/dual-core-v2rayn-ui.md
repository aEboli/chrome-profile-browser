# 双核心与节点工作台改造

## 目的

- 将项目作为独立副本放在 `Creat world/chrome-profile-browser`，不覆盖同目录下的其他项目；
- 在节点工作台采用 v2rayN 常见的信息架构（分组、节点表格、核心选择和订阅操作），但使用本项目自己的 Electron/HTML/CSS/SVG 实现；
- 随应用提供 Windows x64 的 Xray-core 与 sing-box 可执行文件及对应许可证文本；
- 每个 profile 可以选择 Xray 或 sing-box 作为核心，核心只监听本机回环 SOCKS5 端口；
- 将界面中的文字字符图标替换为内联 SVG 图标。

## 约束

- 不复制 v2rayN 的 .NET 图形界面或其源代码；v2rayN 仅作为交互信息架构参考，并保留其 GPL-3.0 来源说明；
- 核心二进制只从 Xray-core 与 sing-box 官方 release 获取，记录版本、SHA-256 和许可证；
- 不修改 Canvas、WebGL、TLS 或浏览器指纹，不实现验证码、风控或封禁绕过；
- 迁移时不复制 `node_modules` 和 `work` 生成目录，依赖通过 `npm install` 重建。

## 验收标准

1. 新目录可以独立执行 `npm install`、`npm test`、`npm run check`；
2. 设置页显示 Xray/sing-box 两个内置核心的版本和路径，profile 启动时能按节点选择对应核心；
3. VMess、VLESS、Trojan、Shadowsocks 节点至少能生成两种核心的配置并通过各自的配置检查命令；
4. 节点页具有分组列表、筛选、订阅刷新、核心切换和状态表格；
5. 导航、操作、状态和空状态图标均来自 SVG symbol，不再依赖 Unicode 图形字符；
6. 官方许可证和版本来源记录在 `vendor/cores/README.md`。
