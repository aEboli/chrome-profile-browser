# 外部浏览器运行时与 Windows 发布

## 目的

修正外部 Chromium 启动失败反馈、引擎切换状态和已安装版本的代理核心路径，并提供可重复的 Windows x64 发布入口。

## 行为

- `enginePath` 为空时使用 Electron 内置 Chromium；非空时必须是绝对文件路径。macOS `.app` 路径解析为包内同名可执行文件。
- 保存引擎设置时，如果仍有运行中的环境，拒绝静默切换；所有环境停止后才允许切换。
- 外部 Chromium 启动等待真实 `spawn` 事件；启动阶段的错误、立即退出和超时作为 IPC 错误返回，不显示虚假的启动成功状态。
- Electron 和外部 Chromium 使用不同的 profile 数据目录。状态中显示当前引擎模式，但不尝试跨引擎复制 Cookie、缓存或登录状态。
- 代理核心异常退出时，托管的浏览器环境也执行停止清理；外部进程树在 Windows 使用 `taskkill /t`，POSIX 使用 detached process group 终止。
- 外部 Chromium 不接收代理密码、测试身份请求头或网页助手动作；这些是明确的引擎边界。
- Windows x64 构建使用 electron-builder；应用资源进入 ASAR，`vendor/cores` 通过 `extraResources` 放入 `resources/vendor/cores`，安装后不依赖源码目录。

## 可验证成功标准

1. 空引擎路径启动 Electron；有效外部路径启动独立 Chromium；不存在、相对路径和目录路径在保存时被拒绝。
2. macOS `.app` 路径解析到包内可执行文件；外部启动错误和立即退出返回明确错误。
3. 运行中环境存在时修改引擎路径失败；停止后可切换，状态显示 Electron 或外部 Chromium。
4. 代理核心异常退出会停止关联浏览器并回收核心；停止超时不会继续删除仍被占用的 profile 目录。
5. `npm test`、`npm run check` 通过；`npm run dist:dir` 生成 Windows x64 未安装目录，且其中 `resources/vendor/cores/win32-x64` 包含两个核心、版本清单和许可证文件。

状态：已实现并完成 Windows x64 打包验证。
