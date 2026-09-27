# 内置代理核心

本目录记录当前 Windows x64 构建使用的官方核心版本、来源和校验值。发行构建会从官方 release 下载未改动的二进制并按 SHA-256 校验；本机开发目录可以保留下载后的可执行文件，但可执行文件不提交到 Git。

| 核心 | 版本 | 来源 | SHA-256 | 许可证 |
| --- | --- | --- | --- | --- |
| Xray-core | v26.3.27 | [官方 release](https://github.com/XTLS/Xray-core/releases/tag/v26.3.27) | `d004c39288ce9ada487c6f398c7c545f7d749e44bdfdd59dbc9f865afba4e1ad` | [MPL-2.0](./Xray-LICENSE.txt) |
| sing-box | v1.14.1 | [官方 release](https://github.com/SagerNet/sing-box/releases/tag/v1.14.1) | `5197f16d492d93202dc623622149a6ed040f8eca263128f91d603f2b901baa89` | [GPL-3.0](./sing-box-LICENSE.txt) |

随 Xray 压缩包提供的 Wintun 许可证也保存在 [`wintun-LICENSE.txt`](./wintun-LICENSE.txt)。v2rayN 仅作为订阅与节点交互参考，项目保留其许可证文本 [`v2rayN-LICENSE.txt`](./v2rayN-LICENSE.txt)，没有复制它的 .NET 图形界面。

跨平台发布时需要为对应平台增加核心目录，并重新记录版本、来源、哈希和第三方许可证。
