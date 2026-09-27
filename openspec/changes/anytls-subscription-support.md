# AnyTLS 订阅支持

## 目的

- 识别 v2rayN 常见的 AnyTLS URI 和 Clash `proxies` 节点。
- 使用随项目提供的 sing-box 生成可校验的 AnyTLS outbound；不把 AnyTLS 误交给当前不支持它的 Xray-core。
- 从 AnyTLS 订阅中的流量、重置、到期和官网提示名称提取订阅统计，并把提示行排除在可选节点之外。

## 行为

- AnyTLS URI 使用 userinfo 作为密码，支持 `sni`、`alpn`、`insecure` 和常见 TLS 参数；AnyTLS 强制启用 TLS。
- AnyTLS 节点导入后固定使用 sing-box，节点表不提供 Xray 切换项；旧状态即使记录了 Xray，也会在启动时改用 sing-box。
- AnyTLS 提示名称与现有订阅元数据规则一致，四类信息不会写入节点列表或连接选择器。
- 订阅的真实节点数量只统计过滤提示行后的节点。

## 可验证成功标准

1. AnyTLS URI 和 Clash 对象解析为 `supported`，核心为 `singbox`，并保留密码、TLS、SNI 和证书校验字段。
2. sing-box `check -c` 接受生成的 AnyTLS 配置；Xray 配置生成明确拒绝 AnyTLS。
3. `剩余流量`、`距离下次重置剩余`、`套餐到期`、`官网` 等 AnyTLS 名称被识别为订阅元数据，不出现在节点列表，统计值可显示。
4. `npm test`、`npm run check` 通过。

状态：已实现并完成自动化验证。
