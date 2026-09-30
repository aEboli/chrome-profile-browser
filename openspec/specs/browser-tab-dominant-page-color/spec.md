# browser-tab-dominant-page-color Specification

## Purpose
TBD - created by archiving change browser-tab-dominant-page-color. Update Purpose after archive.

## Requirements

### Requirement: 网页标签显示页面可见区域主色

系统 MUST 在网页标签完成主框架加载后，从该标签当前可见页面截图中统计颜色占比，并将累计权重最大的有效颜色作为该标签的页面主色。颜色统计 MUST 忽略透明像素并对采样颜色进行有限量化，以避免少量抗锯齿像素改变结果。

#### Scenario: 大面积页面颜色同步到标签

- **WHEN** 网页标签加载一个可见区域主要为单一颜色的页面并完成主框架加载
- **THEN** 该标签的活动高亮背景和边框使用接近该主色的颜色

#### Scenario: 每个标签保留自己的页面颜色

- **WHEN** 用户在两个页面主色不同的标签之间切换
- **THEN** 每个标签显示自己最近一次有效采样的颜色，切换不使用另一个标签的颜色

### Requirement: 页面颜色采样必须可恢复

系统 MUST 在顶层导航、重新加载或页内导航后清除旧页面颜色并为新页面重新采样。异步采样结果 MUST 仅在仍对应同一标签、页面地址和加载代次时写回。

#### Scenario: 旧截图结果不覆盖新页面

- **WHEN** 页面开始新的导航后，旧页面的截图请求才返回
- **THEN** 旧请求结果被丢弃，标签不显示旧页面的主色

### Requirement: 采样失败时保持标签可用

系统 MUST 在截图能力不可用、截图为空、颜色解析失败或标签为新标签页时使用现有 favicon/主题回退色，并 MUST 保证活动标签文字与其背景保持可读对比度。

#### Scenario: 截图失败使用稳定回退

- **WHEN** 页面截图或颜色解析失败
- **THEN** 标签仍显示稳定的回退高亮，切换、关闭、拖动和标签列表操作继续可用

#### Scenario: 浅色页面使用深色文字

- **WHEN** 页面主色为浅色且被采样为有效主色
- **THEN** 活动标签使用深色文字；深色页面主色使用浅色文字
