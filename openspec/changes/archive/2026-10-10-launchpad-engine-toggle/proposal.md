## Why

启动器环境卡片已经显示每个环境当前配置的 Chromium 内核，但该标识目前只是只读文本。用户希望从卡片上直接点击切换该环境使用的内核，不必打开环境编辑窗口。

## What Changes

- 将启动器卡片上的“内置 Chromium / 外部 Chromium”标识改为可访问的切换按钮。
- 点击后立即保存该环境的内核模式，只影响该环境下次启动。
- 运行中的环境不能热切换；对应按钮禁用并说明需先停止环境。
- 使用只修改环境 `engineMode` 的主进程操作，避免连带覆盖连接、备注或其他环境配置。
- 外部模式沿用当前共享 Chrome 手动路径与自动发现规则；不可用时保持原模式并提示原因。
- 不启动、停止或重启环境，不更改新环境的全局默认内核。

## Capabilities

### Modified Capabilities

- `external-engine-selection`：启动器环境卡片可直接切换该环境下次启动所用内核。

## Impact

- 修改 `src/main/preload.js` 与 `src/main/main.js`，增加只更新环境内核模式的 IPC 操作及运行状态/外部 Chrome 校验。
- 修改 `src/renderer/renderer.js`、`src/renderer/index.html` 与 `src/renderer/styles.css`，将卡片模式标识渲染为独立操作按钮并提供状态反馈。
- 增加 IPC 生命周期和启动器交互回归测试。
- 更新 `openspec/specs/external-engine-selection/spec.md` 与 `openspec/spec.md`。

## Explicit Boundaries

- 点击只更改已停止环境的下次启动设置，不热切换正在运行的 Chromium 进程。
- 不自动关闭或重新启动环境。
- 不更改全局新环境默认内核，也不更改共享外部 Chrome 路径。
- 点击失败时保留原模式并展示具体错误。
