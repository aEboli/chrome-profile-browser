## Why

新标签页的常用网站目前主要依赖固定默认项和手动录入，无法随着用户在浏览器环境中的实际访问习惯更新。根据本应用内的常见访问自动维护新标签页入口，可以减少重复输入并让入口更贴近当前使用习惯。

## What Changes

- 根据当前浏览器环境内成功访问的网站频次，自动更新新标签页截图红框中的常用网站入口。
- 自动识别结果按环境隔离并保存在本机；仅保存网站根地址、访问次数和最近访问时间，不读取系统或外部浏览器历史。
- 保留现有常用网站入口、手动添加流程和设置页编辑能力；手动配置的网站与自动识别结果去重显示。
- 清除该环境的浏览数据时，同时清除其自动识别记录。

## Capabilities

### New Capabilities

- `smart-new-tab-sites`: 根据本应用内的访问情况更新新标签页常用网站入口。

### Modified Capabilities

- None.

## Impact

- `src/main/new-tab-sites.js`、`src/main/main.js`：访问记录规范化、按环境持久化和受限 IPC。
- `src/main/browser-shell-preload.js`、`src/renderer/browser-shell.js`：提交成功导航记录并显示自动识别入口。
- `test/`：识别规则、环境隔离、清除行为和常用网站显示行为。
- `openspec/specs/smart-new-tab-sites/spec.md` 与 `openspec/spec.md`：归档时记录确认后的行为要求。

状态：已实现并归档。
