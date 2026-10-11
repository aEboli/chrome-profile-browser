## Context

浏览器壳的扩展入口通过 IPC 调用主进程。主进程读取 manifest 面板路径，在当前 Electron profile session 中加载 `chrome-extension://<id>/<action page>` 到独立 `BrowserWindow`。Tampermonkey BETA 的 manifest 声明 `userScripts`；本机已安装记录为 5.6.6242，当前保存的引擎模式为 Electron。

Electron 44.4.3 的官方扩展 API 文档只承诺列出的 API 子集，列表不包含 `chrome.userScripts`。Chrome 对该 API 还要求用户显式授权：Chrome 138 及以上使用扩展详情页的“允许用户脚本”开关，更早版本使用扩展页的开发者模式开关；浏览器壳不提供这些 Chrome 内部页面。

## Decisions

1. 保持扩展 action popup 的现有窗口语义。截图已显示 Tampermonkey popup，标签路由不是该问题的修复点。
2. 将 `userScripts` 作为 manifest 声明的能力信号，只用于给出兼容性说明，不据此授予或伪造权限。
3. 在 Electron 模式展示“面板已打开，但内置引擎未声明支持用户脚本 API”的状态，并说明外部 Chromium 的授权位置。
4. 外部 Chromium 仍由用户在现有引擎设置中明确选择。切换引擎会使用不同的浏览器 profile 数据目录，因此不自动搬运扩展数据库、Cookie、密码或其他浏览数据。
5. 用户若要迁移 Tampermonkey 脚本，需在原扩展可用的管理页面导出，再在外部 Chromium 中导入；应用只提供指引，不读取脚本内容。

## Risks / Trade-offs

- 提示说明的是 Electron 声明的支持边界，不能证明每个第三方扩展必然失败；措辞应避免把未声明支持写成确定的运行时检测结果。
- 外部 Chromium 的设置页可启用该权限，但外部 profile 是独立目录；用户需主动导入 Tampermonkey 备份。
- 外部 Chromium 模式不提供内置浏览器壳的扩展浮层和标签工具栏；扩展操作使用 Chromium 自带界面。

## Validation

- 单元测试覆盖 `userScripts` 权限识别和无该权限时不提示。
- Renderer 测试覆盖提示与面板打开失败状态的独立展示。
- Renderer 回归用例检查授权指引、手动脚本迁移说明和不复制 profile 数据的边界；不操作用户当前 profile。
