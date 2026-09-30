# Chrome Profile Browser

一个本地优先的 Chromium profile 与代理节点工作台。它使用 Electron 自带的 Chromium 内核，按 profile 隔离 Cookie、缓存和站点存储；也可以在设置里指定用户已经自行审计的 Chromium 可执行文件。

[![Test and Release](https://github.com/aEboli/chrome-profile-browser/actions/workflows/release.yml/badge.svg)](https://github.com/aEboli/chrome-profile-browser/actions/workflows/release.yml)
[![最新发行版](https://img.shields.io/github/v/release/aEboli/chrome-profile-browser?display_name=tag&sort=semver)](https://github.com/aEboli/chrome-profile-browser/releases)

每个 profile 都有独立的 Cookie、缓存、站点存储、插件和代理配置。应用适合需要隔离多个浏览环境、切换代理节点，或在自有/获授权站点上进行兼容性与自动化测试的桌面用户。

## 快速开始

1. 从 [GitHub Releases](https://github.com/aEboli/chrome-profile-browser/releases) 下载与你的系统匹配的安装包。
2. 启动后新建一个 profile，在设置中选择直连、普通代理节点或 Xray/sing-box 核心节点。
3. 在 profile 中打开目标网址；需要网页自动化时，从浏览器工具栏打开网页助手，并先检查当前页面再执行动作。

首次使用建议创建空白 profile，不要直接导入主账号的 Cookie、密码或钱包。

## 文档导航

- [快速开始](#快速开始)
- [版本号规则](#版本号规则)
- [主要能力](#主要能力)
- [安装与首次运行](#安装与首次运行)
- [平台支持](#平台支持)
- [核心与数据目录](#核心与数据目录)
- [开发与本地打包](#开发与本地打包)
- [GitHub Actions 发行流程](#github-actions-发行流程)
- [连接与引擎限制](#连接与引擎限制)
- [安全与边界](#安全与边界)
- [许可证与第三方组件](#许可证与第三方组件)

## 版本号规则

当前版本为 `0.1.133`。产品版本使用 `大版本.小版本.更新号`：大版本示例为 `1.0.000`，小版本示例为 `0.1.000`，小功能更新号每次增加 `0.010`（例如 `0.0.100` → `0.0.110`、`0.0.230` → `0.0.240`），普通更新号每次增加 `0.001`。每次只递增一个层级；递增大版本或小版本时，所有下级归零，例如 `0.6.116` → `0.7.000`。

版本更新使用以下命令，命令会同步 `package.json`、`package-lock.json`、README 和应用界面版本。npm 的标准 `version` 字段保留无前导零的兼容值，产品展示值保存在 `appVersion` 中。

```text
npm run version:patch    # 普通更新，+0.001
npm run version:feature  # 小功能更新，+0.010
npm run version:minor    # 小版本，次版本 +1、更新号归 000
npm run version:major    # 大版本，主版本 +1、下级归 0
npm run version:check    # 检查版本字段是否一致
```

## 主要能力

### Profile、标签页与数据

- 多个持久化 profile；每个 profile 独立保存 Cookie、缓存、站点存储、代理、插件和浏览器设置。
- Chrome 风格顶部多标签、启动网址、可配置搜索模板、站点图标和新标签页外观；新窗口会进入同一标签栏。
- Chrome/Edge/Chromium 书签来源发现，以及 Chromium JSON、HTML 书签文件的选择性导入；书签栏支持文件夹、拖放排序、快捷打开和去重。
- 按环境隔离的密码本，支持站点分组、按需显示密码和受控的网页登录字段自动填充。
- 本地 JSON 数据存储；可以从应用内打开数据目录查看实际路径。

### 节点、订阅与核心

- 系统直连、HTTP/HTTPS/SOCKS5 节点，以及 VMess、VLESS、Trojan、Shadowsocks、AnyTLS。
- 导入 HTTP(S) 订阅、base64 URI 列表和常见 Clash YAML；订阅刷新成功后替换该来源的节点，失败时保留上一份成功配置。
- 识别订阅流量、到期和重置信息；节点表支持分组、搜索、地址/IP 列和批量 TCP/协议握手检查。
- 核心节点按 profile 启动独立的本地 SOCKS5。Windows x64 发行包内置官方 Xray-core 与 sing-box，其他平台可以在设置中下载并校验官方核心或选择本地核心。
- 应用会提醒代理核心和外部 Chromium 的官方更新，不会静默替换正在使用的进程。

### 扩展与桌面体验

- 支持加载未打包扩展，以及 ZIP/CRX、Chrome Web Store 详情页或扩展 ID 安装；每个 profile 可单独启停和固定扩展。
- 扩展详情展示版本、简介和 manifest 权限；支持 `action`、`browser_action`、`side_panel` 和 options 页面入口。
- 支持 F5、F12、可配置快捷键和鼠标手势；环境最小化或隐藏时尽量保持页面计时器运行，关闭环境后回收托管核心。
- 配置中心支持系统托盘驻留、运行环境提示和快速恢复。

### 网页助手

- 右侧对话栏可以观察当前页面、读取标签与表格、管理标签、导航网页，并执行 CSS 选择器或坐标驱动的点击、填写、选择、拖拽、滚轮、键盘和文本输入。
- 通过系统选择器明确授权后，可以列出目录、读取文本文件，并将授权文件上传到当前页面的 `input[type=file]`；授权只在当前 profile 运行期间有效。
- 支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和 Google Gemini；可获取模型列表、测试连通性，配置上下文预算、输出长度、温度、思考等级和步骤数。步骤为 `0` 时持续执行。
- JEV 可在 Agent 配置中独立开关。开启后网页任务会在每批动作后判断是否完成并给出置信度与理由；关闭后不会请求 JEV，也不会向 Agent 暴露 JEV 判断工具。
- 模型、JEV 和可安全重试的页面操作支持指数退避重试；用户可以停止等待，结果不确定的点击、提交和上传会先重新观察。
- 通过 `window.browserAgent` 和 shell preload bridge 暴露受控观察、动作、标签与文件接口，不执行任意网页脚本。

### 授权测试身份

- 每个 profile 可以持久化一个 UUID，并按精确 HTTP(S) origin 白名单添加 `X-CPB-Test-Identity` 请求头，仅适用于内置 Electron 引擎。
- 该功能用于自有或获授权的兼容性测试，不等同于浏览器指纹伪装，也不会修改 User-Agent、Canvas、WebGL、TLS 或 WebRTC。

## 连接与引擎限制

- 默认运行模式使用 Electron 自带的 Chromium。该模式的默认 User-Agent 沿用 Electron 的构建，可能包含 `Electron/<version>`；本项目不会把它伪装成纯 Chrome，也不修改 Canvas、WebGL 或 TLS 指纹。
- 设置中填写外部 Chromium 可执行文件后，环境会在独立窗口启动该程序；路径必须是绝对文件路径（macOS 可选择 `.app`，应用会解析其中的可执行文件）。Electron 与外部 Chromium 使用不同的数据目录，Cookie、缓存和登录状态不会自动迁移；切换引擎前必须停止所有运行中的环境。
- 订阅解析器会识别 HTTP、HTTPS、SOCKS5（含 `socks5h` 输入）以及 VMess、VLESS、Trojan、Shadowsocks、AnyTLS。普通节点直接传给 Chromium；核心节点先由本机 Xray 或 sing-box 监听回环 SOCKS5，再传给 Chromium，AnyTLS 固定由 sing-box 承载。节点检查使用独立的 TCP/协议握手逻辑，检查结果不代表目标站点一定可用。
- HTTP 代理凭据可由 Electron 的代理认证回调尝试提供；Chromium 对 SOCKS5 用户名/密码认证的兼容性有限。指定外部 Chromium 时，应用不会自动填充代理凭据，建议使用无认证的本地代理或在代理客户端侧完成认证。
- Electron 模式的代理规则包含 Chromium 的 `<local>` 绕过项，因此本地主机名等匹配该规则的地址可能绕过所选节点。`直连`同样只表示使用系统默认网络路径，不等于绑定某个指定公网 IP；固定出口需要操作系统路由、VPN 或本地代理配合。
- 选择外部 Chromium 时，应用负责启动独立用户数据目录、启动网址、已激活插件、`--proxy-server`、`--disable-quic` 和 `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` 参数；不会把它嵌入应用窗口。Electron 模式会对宿主及每个页面 guest 设置同等 WebRTC 策略，但最终行为仍取决于浏览器版本和代理是否支持 WebRTC UDP。
- 桌面应用使用统一的单实例锁。开发、安装和带不同 `--user-data-dir` 的调试启动不会创建第二个应用主进程，重复启动会唤起已有配置中心；GPU、网络服务和 renderer 等 Chromium 子进程仍可能同时存在，这是浏览器正常的多进程结构。
- 授权测试身份只对环境配置中列出的精确 origin 添加 `X-CPB-Test-Identity`，不修改 User-Agent、Client Hints、Canvas、WebGL、Audio、字体、屏幕、硬件参数、TLS 或 WebRTC；外部 Chromium 不支持该请求头注入。
- Electron 44 对包含 `<webview>` 的窗口关闭存在阻塞风险。停止环境或关闭环境窗口时会先移除页面 guest，再在有界等待内销毁外层窗口；若 Electron 没有及时关闭，应用退出时仍会统一回收。
- 正常停止、窗口关闭和应用退出会回收托管的 Chromium/代理核心；如果主进程被强制终止或崩溃，下一次启动不会自动接管已经脱离内存跟踪的外部进程，需手动关闭残留进程后再启动同一环境。

## 安全与边界

本项目不是反爬或风控绕过工具，不修改 Canvas/WebGL/TLS。应用集成 Xray-core 与 sing-box 的配置和进程管理能力，不嵌入 v2rayN 的 .NET 图形界面；v2rayN、Xray-core 和 sing-box 的许可证、版权声明仍以各自官方仓库及 [`vendor/cores`](vendor/cores) 中的文本为准。Windows x64 内置核心的版本、来源和 SHA-256 记录在 [`vendor/cores/README.md`](vendor/cores/README.md)，在线更新只访问对应官方 release。`直连`指系统默认网络路径，不等于绑定指定公网 IP。

节点用户名和密码优先使用操作系统提供的 Electron `safeStorage` 加密后保存。若系统密钥环不可用，应用会为保证本地功能降级为明文保存；请保护操作系统账户、数据目录和 `state.json`，不要把该文件提交到公共仓库。

Agent Token 与 JEV Key 不会返回到 renderer 公共状态；在独立 Agent 配置页或对话页 Agent 设置中输入新密钥时会先询问是否长期保留，确认后使用 `safeStorage` 保存，拒绝则不写入状态文件。Agent 思考等级提供 `Off`、`Minimal`、`Low`、`Medium`、`High`、`XHigh`、`Max` 七档，模型不支持所选等级时会自动退到相邻可用等级。主进程负责向所选 Agent 协议和 JEV provider 发起请求；应用不按固定时长或请求/响应字节数终止请求，模型列表、连通性检查、聊天和 JEV 请求都可取消。对话没有固定消息条数限制，上下文仍按配置预算裁剪并在接近预算时压缩。模型列表和连通性检查均由主进程完成，不持久化临时 Token。已有节点 IP 会异步查询公开 IP 的国家信息，私有地址和查询失败会保留未解析提示；节点服务器 IP 不代表代理出口 IP。

请只在自有或获授权的站点上做隐私、兼容性和自动化测试。测试第三方 Chromium 内核时，先使用空白 profile、非管理员账户或虚拟机，不要导入主账号 Cookie、密码或钱包。

网页助手的页面读取和操作同样只应在自有或获授权的站点上使用。它不会替用户确认页面中的付款、登录或其他敏感操作；输入明确的选择器指令前请先核对当前页面和目标元素。使用本地文件工具时，必须先在系统选择器中明确选择文件或文件夹；授权 ID、路径和内容不写入状态文件，profile 停止后立即失效。文件数量、目录遍历、文本读取和上传批次不设置应用层上限；二进制文件仍只返回元数据，文件上传只匹配当前网页的 `input[type=file]`。

检测到人机验证时，网页助手会在观察结果中提示页面状态。Agent 仍使用受控的 Electron `<webview>` 合成输入，不是实体鼠标或键盘；应用不会调用操作系统全局输入接口。

虚拟输入协议只发送到内置 Electron 引擎的当前活动页面视图：普通网页使用 `<webview>`，内置 `about:newtab` 使用受控的新标签页区域；不模拟操作系统级鼠标，也不控制其他窗口。选择外部 Chromium 引擎时该 bridge 不可用。模型动作应使用以下结构化接口（动作会再次校验，不能传入脚本）：

```js
await window.browserAgent.observe();
await window.browserAgent.execute({ type: 'click', x: 420, y: 260 });
await window.browserAgent.execute({ type: 'keypress', keys: ['Control', 'L'] });
await window.browserAgent.execute({ type: 'type', text: 'example.com' });
await window.browserAgent.openTab({ url: 'https://example.com' });
await window.browserAgent.tabs();
await window.browserAgent.chooseFiles({ multiple: true });
await window.browserAgent.uploadFiles({ selector: 'input[type=file]', fileIds: ['agent-file-id'] });
window.browserAgent.capabilities(); // browser-agent.v1、动作列表和坐标空间
```

支持的动作包括 `screenshot`、`mouse_move`、`click`、`mouse_down`、`mouse_up`、`scroll`、`drag`、`keypress`、`key_down`、`key_up`、`type` 和 `wait`；另外可通过 `tabs`、`openTab`、`switchTab`、`closeTab`、`navigate` 和 `tabControl` 管理当前 profile 的标签。`chooseFiles`、`chooseDirectory`、`listFiles`、`readFile` 和 `uploadFiles` 只处理用户通过系统选择器授权的本地文件。网页动作没有固定文本长度、数值范围、动作数量、按键数或拖拽点数上限；坐标仍需位于当前页面 viewport，类型、有限数值、非空批次和动作/按键白名单仍会校验。接入 JEV 时应复用这些接口，不要绕过动作白名单。授权文件的数量、目录遍历、文本读取和上传批次没有应用层上限。当前协议层会把 Responses 的 `function_call` 与工具结果转换成配对的 `function_call_output`，并在裁剪上下文时保留完整工具调用组。

`scroll.deltaY` 约定正数向下、负数向上，执行器会转换 Electron/Chromium 的底层滚轮符号。

## 安装与首次运行

正式安装包发布在 [GitHub Releases](https://github.com/aEboli/chrome-profile-browser/releases)：

| 平台 | 推荐文件 | 说明 |
| --- | --- | --- |
| Windows x64 | `chrome-profile-browser-<版本>-win-x64-installer.exe`（NSIS） | 支持选择安装目录，会创建开始菜单/桌面快捷方式。 |
| Windows x64 | `chrome-profile-browser-<版本>-win-x64-portable.exe` | 免安装启动；profile 数据仍写入系统用户数据目录。 |
| macOS Intel | `chrome-profile-browser-<版本>-mac-x64.dmg` 或 `.zip` | 适用于 Intel Mac。 |
| macOS Apple Silicon | `chrome-profile-browser-<版本>-mac-arm64.dmg` 或 `.zip` | 适用于 Apple Silicon Mac。 |

首次运行发行包时：

1. Windows 未配置代码签名证书，SmartScreen 可能显示“未知发布者”；请从 GitHub Release 下载并核对发布页的资产名称后再允许运行。
2. macOS 当前发行包未配置 Apple Developer 签名和公证。首次打开 DMG/ZIP 中的应用时，如果 Gatekeeper 阻止启动，请在“系统设置 → 隐私与安全性”中确认打开，或使用右键“打开”。
3. macOS 包不内置 Windows 代理核心。首次使用 Xray-core 或 sing-box 节点时，在设置页选择官方 release 下载并校验对应的 macOS x64/arm64 核心，也可以指定本机已经审计的核心路径。
4. 应用不会自动迁移其他浏览器的 Cookie、缓存或登录状态。建议先创建空白 profile，再导入自有或获授权的测试账号。

## 平台支持

| 能力 | Windows x64 | macOS x64 | macOS arm64 |
| --- | --- | --- | --- |
| Electron 内置 Chromium | 支持 | 支持 | 支持 |
| 独立 profile 与标签页 | 支持 | 支持 | 支持 |
| HTTP/HTTPS/SOCKS5 节点 | 支持 | 支持 | 支持 |
| Xray-core / sing-box 节点 | 随包内置，可在线更新 | 设置页下载或选择本地核心 | 设置页下载或选择本地核心 |
| 外部 Chromium `.exe`/`.app` | 支持 | 支持 | 支持 |
| GitHub Release 安装包 | NSIS、portable | DMG、ZIP | DMG、ZIP |

Linux 目前没有随仓库发布的安装包；源代码仍保留 Linux 路径识别和核心下载逻辑，使用前请自行验证 Electron 与系统依赖。

## 核心与数据目录

- Windows x64 发行包包含 Xray-core 与 sing-box；GitHub Actions 会在 Windows runner 上按 [`vendor/cores/README.md`](vendor/cores/README.md) 的版本从官方 release 下载并校验核心，再复制到安装目录的 `resources/vendor/cores`。本机开发时如果 `vendor/cores/win32-x64` 缺少可执行文件，请在设置页下载官方核心或放入已经审计的本地核心。
- macOS 和其他平台通过设置页下载官方核心，下载地址、SHA-256 校验和平台架构由应用根据当前系统选择；核心不会静默替换正在使用的进程。
- 应用状态、profile、订阅和运行时核心下载目录位于 Electron 的 `app.getPath('userData')` 下。请在应用内使用“打开数据目录”查看实际位置，不要把其中的 `state.json`、Cookie 或 profile 目录提交到 Git。
- `vendor/cores/README.md` 记录当前内置核心的来源、版本、哈希和许可证；更新二进制时必须同步更新该文件。

## 开发与本地打包

```powershell
npm install
npm test
npm run check
npm start
npm run dist:dir       # 生成 Windows x64 未安装目录
npm run dist:win       # 生成 Windows x64 NSIS 安装包和 portable 包
npm run dist:mac:x64   # 在 macOS 上生成 Intel DMG 和 ZIP
npm run dist:mac:arm64 # 在 macOS 上生成 Apple Silicon DMG 和 ZIP
npm run dist:mac       # 在当前 macOS 架构生成 DMG 和 ZIP
```

需要 Node.js 22 或更高版本。`npm run check` 会检查 `src/` 和 `scripts/` 下的 JavaScript 语法，并校验 `package.json`、`package-lock.json` 与 README 中的版本号一致；`npm test` 使用 Node 内置测试运行器执行 `test/`。

具体行为规范见 [`openspec/spec.md`](openspec/spec.md)。打包配置见 [`electron-builder.yml`](electron-builder.yml)，产物写入 `release/`（该目录已被 Git 忽略）。portable 是免安装启动包，默认仍使用系统用户数据目录，不会把 profile 数据自动放到 exe 同目录。外部 Chromium 不随安装包提供，仍需用户在设置中选择本机可执行文件。

## GitHub Actions 发行流程

仓库的 [`release.yml`](.github/workflows/release.yml) 在 Pull Request 和 `main` 推送时执行检查；推送 `v*` 标签时会在三个 runner 上打包：

- `windows-latest`：Windows x64 NSIS 安装包和 portable 包；
- `macos-15-intel`：macOS Intel x64 DMG 和 ZIP；
- `macos-latest`：macOS Apple Silicon arm64 DMG 和 ZIP。

发布新版本的推荐步骤：

```powershell
npm run version:patch       # 或 version:feature / version:minor / version:major
npm run check
npm test
$version = (Get-Content package.json -Raw | ConvertFrom-Json).appVersion
git add -A
git commit -m "release: v$version"
git tag "v$version"
git push origin main --follow-tags
```

标签必须与 `package.json` 的 `appVersion` 对应。工作流完成后会自动创建同名 GitHub Release 并上传 Windows、macOS Intel 和 macOS arm64 资产；没有证书时仍会保持未签名发行，签名和公证可通过仓库 Secrets 配置 electron-builder 的官方环境变量。

## 许可证与第三方组件

仓库当前未声明项目级开源许可证。除 [`vendor/cores`](vendor/cores) 中列明的 Xray-core、sing-box、Wintun 和 v2rayN 许可证文本外，源代码的复制、修改和再分发请先取得版权所有者许可。第三方组件的许可证和来源以各自官方仓库为准。
