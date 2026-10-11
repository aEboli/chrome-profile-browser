## Why

外部 Chromium 当前要求用户手动选择可执行文件。用户希望外部环境优先使用本机已安装的 Google Chrome，并自动搜寻其安装位置，减少首次配置步骤。

## What Changes

- 外部 Chromium 路径为空时，自动搜寻本机稳定版 Google Chrome。
- 有效的手动路径优先；手动路径非空但无效时明确报错，不静默切换到另一个浏览器。
- 在设置页显示自动发现的 Chrome 路径；发现结果仅作运行时回退，不覆盖手动路径配置。
- 未找到 Chrome 时保留手动选择入口，并给出明确提示。

## Capabilities

### Modified Capabilities

- `external-engine-selection`：外部环境支持自动发现 Google Chrome，同时保留手动可执行文件配置。

## Impact

- 修改 `src/main/engine-runtime.js` 增加跨平台 Chrome 路径发现与外部路径解析。
- 修改 `src/main/main.js` 的环境保存校验、外部模式设置校验、公共引擎状态和启动路径解析。
- 修改 `src/renderer/index.html` 与 `src/renderer/renderer.js` 展示自动发现结果。
- 增加路径搜索优先级、手动路径优先、找不到浏览器和界面状态的回归测试。
- 更新 `openspec/specs/external-engine-selection/spec.md` 及 `openspec/spec.md`。

## Explicit Boundaries

- 只搜索已安装的 Google Chrome 稳定版，不下载、安装或更新浏览器。
- 搜索仅在未保存手动路径时运行；非空手动路径无效时保留明确错误，不回退到系统 Chrome。
- 自动发现结果不写入 `settings.enginePath`，以便每次启动可重新搜索；各环境仍自行保存 `electron` 或 `external` 模式。
- 手动选择的外部可执行文件仍由所有外部环境共用。
