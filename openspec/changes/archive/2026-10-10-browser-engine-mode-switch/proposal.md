## Why

设置页目前通过 `enginePath` 是否为空同时表达外部 Chromium 路径和当前引擎模式。切回内置 Chromium 必须清空路径，之后再切回外部引擎就要重新选择可执行文件。浏览器引擎区域也没有直观的模式切换入口。

## What Changes

- 在“浏览器引擎”设置区域增加“内置 Chromium / 外部 Chromium”分段切换按钮。
- 将当前引擎模式与外部 Chromium 路径分开保存；切回内置模式时保留外部路径和安装版本信息。
- 对旧状态文件进行兼容迁移：旧 `enginePath` 非空时推断为外部模式，否则推断为内置模式。
- 外部模式只有在存在有效 Chromium 可执行文件路径时才能保存并启动；内置模式不依赖保留的外部路径。
- 保留现有安全边界：运行中的环境存在时拒绝更改引擎或路径；浏览器内核安装成功后仍按现有行为切换到外部 Chromium。

## Capabilities

### New Capabilities

- `external-engine-selection`: 在设置页显式切换 Electron 内置 Chromium 与外部 Chromium，同时独立保留外部可执行文件路径。

### Modified Capabilities

无。

## Impact

- 修改 `src/main/store.js` 的设置默认值与旧状态迁移。
- 修改 `src/main/main.js` 的公开引擎状态、设置校验、引擎启动选择及浏览器安装写入。
- 修改 `src/renderer/index.html`、`src/renderer/renderer.js` 和 `src/renderer/styles.css`，增加分段模式控件并展示已保存模式。
- 更新 `openspec/spec.md` 的引擎行为摘要，并增加设置迁移、模式保存、运行时选择和渲染交互测试。

## Explicit Boundaries

- 切换只影响后续启动的环境；运行中的环境继续受现有“先停止再更改引擎”规则约束。
- 切回内置 Chromium 不删除外部浏览器文件、路径、版本或校验信息。
- 不迁移 Cookie、缓存、登录状态或 profile 数据；两种引擎继续使用各自的数据目录。
- 浏览器内核安装按钮继续保留当前“安装后设为外部 Chromium”的行为。

状态：实施完成；手动界面截图受桌面捕获窗口映射问题限制，定向 UI 回归已通过。
