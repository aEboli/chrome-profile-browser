# 设计

## 刷新流程

1. `refreshSubscriptions` 先记录本批次的尝试时间并锁定订阅刷新状态。
2. 使用 `Promise.allSettled` 同时调用每个订阅的主进程刷新 IPC；单个失败只记录该订阅的错误，不阻断其他请求。
3. 所有 IPC 完成后只调用一次 `refreshState`，避免并发返回的旧状态覆盖后续订阅结果。
4. 从统一状态中收集成功订阅的可检查节点，复用 `checkNodes` 执行批量测速。

## 每日调度

- 调度器根据每个订阅的 `lastUpdatedAt`、持久化的 `lastRefreshAttemptAt` 和本次运行内的尝试时间计算下一次到期时间。
- 应用启动或状态同步后安排最近到期的订阅；没有订阅时不保留计时器。
- 到期时只刷新到期订阅。手动刷新和自动刷新共享 `subscriptionsRefreshing` / `batchChecking` 锁，忙碌时延后 60 秒重新检查。
- 刷新开始时持久化 `lastRefreshAttemptAt`；刷新失败不修改 `lastUpdatedAt`，但保留尝试时间，避免失败订阅在重启或同一轮事件循环中反复重试。

## 节点检查并发

批量节点检查上限统一提高到 10。单节点仍保留已有的连接复用、超时、核心清理和结果持久化逻辑，不改变检查结果含义。
