# Agent 本地文件读取与上传

## 目的

让内置 Electron profile 的网页助手在用户明确授权后读取本机文件夹和文本文件，并把授权文件设置到当前网页的文件上传控件中。

## 行为

- `browser_choose_files` 和 `browser_choose_folder` 通过系统文件选择器取得授权；授权只保存在当前 profile 运行期间。
- `browser_list_files` 列出已授权文件夹下的全部条目，并为条目返回短期授权 ID；不会把完整本地路径交给远程模型。
- `browser_read_file` 读取已授权的普通文本文件全部内容；二进制文件只返回元数据。
- `browser_upload_files` 只接受当前 profile 已授权的文件 ID，并通过 Chrome DevTools Protocol 的 `DOM.setFileInputFiles` 设置当前活动网页的 `input[type=file]` 控件。
- 文件数量、目录遍历、读取大小和上传批次不设置应用层上限；文件工具只作用于内置 Electron profile，外部 Chromium 不提供该 bridge。浏览器环境停止后，所有文件授权立即失效。

## 边界

- Agent 不能通过参数直接取得任意本地路径；每个文件或文件夹必须先经过用户可见的系统选择器。
- 文件路径、文件内容和文件夹内容不写入状态文件；完整路径不进入工具返回值和远程 Agent 上下文。
- 文件上传只允许当前 profile 的网页 guest，选择器必须匹配文件输入控件；不执行任意网页脚本。
- 文件夹遍历不设置条目数或深度上限，但符号链接不能越出用户授权的根目录，且已访问目录不会重复遍历。

## 可验证成功标准

1. Agent 可以打开系统文件/文件夹选择器，并得到短期授权 ID。
2. Agent 可以列出授权文件夹的全部条目、读取任意大小的授权文本文件，并拒绝未授权或二进制内容读取。
3. Agent 可以在当前内置网页中按 CSS 选择器把任意数量的已授权文件设置到 `input[type=file]`，错误选择器和非文件输入控件会返回可读错误。
4. profile 停止或窗口关闭后，原授权 ID 不再可用；文件路径不会进入持久化状态。

## 任务

- [x] 增加主进程文件授权、受限读取和 CDP 文件上传。
- [x] 增加浏览器 preload 与 `window.browserAgent` 文件 bridge。
- [x] 增加 Agent 工具定义、执行器和本地文件安全边界文案。
- [x] 更新产品规范与 README。

状态：已实现。
