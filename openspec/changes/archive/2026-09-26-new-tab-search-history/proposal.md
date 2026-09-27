# 新标签页搜索历史

## Why

新标签页搜索框目前无法回看之前提交的关键词，常用网站入口在输入时也会持续占据视线。按环境保存最近搜索并在输入时收起入口，可以让重复搜索更快完成，并减少搜索时的界面干扰。

## What Changes

- 搜索框聚焦且为空时显示当前浏览器环境最近提交的搜索记录，每条记录带时钟图标；输入时按关键词筛选。
- 提交新搜索后，将搜索词加入历史列表并移至最前，同一词不重复，最多保留 10 条。
- 记录按浏览器环境隔离并在本机持久化，重启后仍可显示；清除该环境的浏览数据时同时清除搜索历史。
- 选择一条历史记录会使用当前搜索引擎执行搜索。
- 搜索框有非空内容时隐藏下方常用网站图标和添加入口；Banner 与搜索框保持显示。

## 能力

### 新增能力

- `new-tab-search-history`：新标签页搜索历史、建议筛选与输入时快捷网站入口显隐。

### 修改能力

- 无。

## 影响范围

- `src/main/new-tab-search-history.js`、`src/main/main.js`：搜索记录规范化、按环境持久化、受限 IPC 和清除逻辑。
- `src/main/browser-shell-preload.js`：暴露当前环境的搜索历史读取和记录方法。
- `src/renderer/browser-shell.js`：建议列表交互和新标签页搜索行为。
- `src/renderer/browser-shell.html`：增加历史记录时钟图标。
- `src/renderer/browser-shell.css`：建议列表样式及搜索输入状态下的快捷网站显隐。
- `test/`：搜索记录规范化、环境隔离、清除和新标签页交互验证。
- 归档时更新 `openspec/spec.md`，并将新增能力写入 `openspec/specs/new-tab-search-history/spec.md`。
