## ADDED Requirements

### Requirement: 快捷入口显示网站图标

新标签页的每个 HTTP(S) 快捷入口 MUST 优先显示该网站通过当前浏览器环境获取的 favicon；图标请求失败、返回非图片或图片无法渲染时 MUST 显示配置中的文字图标回退，且入口导航行为 MUST 保持可用。

#### Scenario: 网站图标可用

- **WHEN** 新标签页渲染一个 HTTP(S) 快捷入口且网站提供可读取的 favicon
- **THEN** 入口显示该网站 favicon，并继续打开原配置地址

#### Scenario: 网站图标不可用

- **WHEN** 快捷入口的 favicon 请求失败、返回非图片或图片加载失败
- **THEN** 入口显示配置中的文字图标，布局和打开行为保持可用
