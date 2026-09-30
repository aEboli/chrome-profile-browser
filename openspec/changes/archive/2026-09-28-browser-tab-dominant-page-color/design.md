## Context

浏览器壳已经为每个标签维护 `accent`，并通过 `tab-active-surface` 呈现活动标签高亮。页面标签同时提供 Electron webview 的 `capturePage()`，Agent 观察流程已经使用该能力取得页面截图。

## Decisions

- 在 renderer 中直接调用标签 webview 的 `capturePage()`，不增加主进程截图 IPC。截图返回的 `NativeImage` 用 `toDataURL()` 解码到 canvas，避免跨域页面内容造成 canvas 污染。
- 将截图缩放到 48 x 32 的采样画布；忽略透明像素，按每个通道量化到 24 的桶并按 alpha 累计，选择累计权重最大的桶。这样可以让大面积白色、深色背景或纯色区域稳定胜出，同时过滤少量抗锯齿噪声。
- 为标签增加页面颜色和采样代次。页面开始加载、顶层导航或页内导航时清除页面颜色并递增代次；异步截图结果必须匹配当前标签、URL 和代次才可写回，防止旧页面结果覆盖新页面。
- 页面颜色写入现有 `accent`，因此关闭后恢复标签和标签切换面板继续复用当前颜色字段；截图失败只清除本次请求状态，保留 favicon/主题回退。
- 活动表面使用页面主色与主题表面的混合色，而不是直接覆盖整个标题栏。文字颜色根据采样颜色的相对亮度在深色和浅色之间选择，确保浅色页面和深色页面都可读。

## Sequence

1. webview 完成主框架加载或活动标签重新显示。
2. renderer 启动一次带代次的 `capturePage()` 请求。
3. NativeImage 转 data URL，在小画布中统计量化颜色桶。
4. 请求仍对应当前标签时更新 `item.pageColor`、`item.accent` 并重新渲染标签。
5. CSS 通过 `--tab-accent` 和 `--tab-text` 更新活动表面；已有动效继续由原有类控制。

## Failure Handling

- 没有 `capturePage`、NativeImage 无法解码、canvas 不可用、截图为空或请求抛错时，保持 favicon/主题回退色。
- 新标签页不发起页面截图请求。
- 页面主色只保存在 renderer 的标签对象中，不写入 profile、书签或最近关闭数据之外的新持久化位置。
