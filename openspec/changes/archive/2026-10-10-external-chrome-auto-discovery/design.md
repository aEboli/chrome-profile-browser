## 背景

每个环境现在独立保存 `engineMode`，外部 Chromium 可执行文件仍由全局 `settings.enginePath` 提供。路径为空时，profile 保存和启动目前都会失败，设置页也没有说明本机是否已安装 Chrome。

## 设计决策

1. 增加 `discoverChromeExecutable()` 和外部路径解析函数。非空 `settings.enginePath` 先按现有规则验证并使用；为空时才自动搜索。
2. 搜索稳定版 Google Chrome 的标准安装位置，并按确定顺序返回首个有效可执行文件：
   - Windows：`Program Files`、`Program Files (x86)`、当前用户 `LocalAppData`。
   - macOS：`/Applications/Google Chrome.app`、当前用户 `~/Applications/Google Chrome.app`。
   - Linux：依次搜索 `PATH` 中的 `google-chrome-stable` 和 `google-chrome`。
3. 自动发现路径作为运行时回退，不写入 `settings.enginePath`。主进程公共引擎状态额外标记自动发现结果，设置页显示路径及其自动发现状态；手动路径输入继续显示已保存值。
4. 每环境外部模式的保存校验与启动使用相同解析规则。默认模式设为外部时，手动路径为空但已发现 Chrome 的情况下允许保存；没有候选时提示安装 Chrome 或手动选择可执行文件。
5. 非空手动路径无效时继续返回路径校验错误，不使用自动候选替代，避免用户指定的浏览器被静默替换。
6. 使用注入的文件系统、平台、环境变量和路径实现测试候选优先级，不启动真实外部浏览器。

## 交互

- 设置页外部路径输入保留手动选择功能。
- 找到 Chrome 且没有手动路径时，旁边显示自动发现的完整路径和“外部环境将使用此 Chrome”的状态。
- 没找到 Chrome 时，显示提示并保留“选择文件”入口。
- 用户手动配置路径后，自动发现提示隐藏，外部环境使用该路径。

## 风险与处理

- 系统级和用户级 Chrome 可能同时安装；按固定优先级搜索，用户仍可手动指定另一条路径。
- 自动发现路径可能在用户移动 Chrome 后失效；由于该结果不持久化，下次应用启动会重新搜索。
- 非标准安装位置可能无法自动发现；设置页仍允许手动选择。
- 自动发现只返回路径，不改变任何 profile 的 `engineMode`，也不迁移浏览器数据。

## 验证

- 定向测试覆盖 Windows/macOS/Linux 候选路径、候选优先级、手动路径优先、非空无效路径不回退和找不到 Chrome。
- 主进程回归覆盖外部模式设置、profile 保存及启动使用同一自动发现规则。
- 渲染回归覆盖检测结果展示和手动路径入口。
- 运行定向测试、完整测试、`npm run check`、`git diff --check` 和 OpenSpec 严格校验。
