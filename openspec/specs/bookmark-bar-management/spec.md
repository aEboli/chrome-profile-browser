# bookmark-bar-management Specification

## Purpose
收藏栏让用户识别、分组并维护按浏览器 profile 保存的网站。网站图标、嵌套文件夹和右键菜单让常用页面保持易辨认、易访问，并支持完整的日常整理操作。

## Requirements

### Requirement: 收藏链接显示网站图标
收藏栏中的网站链接 MUST 显示该网页提供的网站图标；尚无已保存图标时 MUST 尝试使用网站根路径的 `/favicon.ico`，加载失败时 MUST 保留可辨认的默认图标。

#### Scenario: 网页提供图标
- **WHEN** 网页图标事件提供一个有效图标地址且该页面已收藏
- **THEN** 收藏栏显示该图标，且同一 profile 下次打开时仍能显示

#### Scenario: 网页没有图标
- **WHEN** 收藏没有可用的网页图标
- **THEN** 收藏栏尝试加载该网站的 `/favicon.ico`，失败后显示默认图标且布局保持完整

### Requirement: 收藏栏空白处可创建收藏和文件夹
用户 MUST 能在收藏栏空白区域打开上下文菜单，并可将当前 HTTP(S) 页面添加为收藏或新建文件夹。文件夹 MUST 能容纳收藏链接及其他文件夹。

#### Scenario: 在根目录新建文件夹
- **WHEN** 用户在收藏栏根目录的空白处选择“新建文件夹”并输入名称
- **THEN** 文件夹出现在收藏栏中并保存到当前 profile

#### Scenario: 在文件夹中创建内容
- **WHEN** 用户展开文件夹并在其内容区域创建收藏或文件夹
- **THEN** 新内容属于该文件夹且只在该文件夹中显示

#### Scenario: 空白页添加收藏
- **WHEN** 当前标签没有有效 HTTP(S) 页面且用户打开收藏栏上下文菜单
- **THEN** 添加当前页面的操作不可用，创建文件夹仍可用

### Requirement: 收藏链接和文件夹提供右键管理操作
收藏链接的上下文菜单 MUST 提供在当前标签或新标签打开、编辑标题与 HTTP(S) 地址、删除操作。文件夹 MUST 可展开，并提供新建内容、重命名和删除操作。

#### Scenario: 编辑收藏链接
- **WHEN** 用户编辑收藏并提交有效标题和 HTTP(S) 地址
- **THEN** 收藏栏更新该链接并将修改持久化到当前 profile

#### Scenario: 拒绝无效地址
- **WHEN** 用户提交无效或非 HTTP(S) 收藏地址
- **THEN** 收藏保持原值并显示错误

#### Scenario: 删除收藏链接
- **WHEN** 用户从链接上下文菜单选择删除
- **THEN** 该链接从收藏栏和当前 profile 中移除

#### Scenario: 删除非空文件夹
- **WHEN** 用户确认删除含收藏或子文件夹的文件夹
- **THEN** 该文件夹及其全部后代从收藏栏和当前 profile 中移除

### Requirement: 收藏和文件夹按 profile 持久化
收藏链接、文件夹层级和网站图标 MUST 按浏览器 profile 持久化。已有仅含链接的收藏数据 MUST 作为根目录收藏加载，不得丢失。

#### Scenario: 重启后恢复文件夹
- **WHEN** 用户重启同一 profile 的浏览器
- **THEN** 收藏标题、地址、图标和文件夹层级保持不变

#### Scenario: 不同 profile 相互隔离
- **WHEN** 用户在一个 profile 创建或删除收藏内容
- **THEN** 其他 profile 的收藏内容不变
