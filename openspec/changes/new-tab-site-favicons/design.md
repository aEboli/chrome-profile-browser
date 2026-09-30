# 设计

- 复用现有 profile-scoped `browser-shell:get-page-favicon` IPC，由主进程使用当前环境会话请求网站根路径 favicon。
- renderer 以入口 URL 为缓存键，合并并发请求，只缓存有效的 data image；图片加载事件控制真实图标与文字回退的显示。
- DOM 节点断开后不写入图标，网络失败被视为可恢复的显示回退，不阻断新标签页交互。
