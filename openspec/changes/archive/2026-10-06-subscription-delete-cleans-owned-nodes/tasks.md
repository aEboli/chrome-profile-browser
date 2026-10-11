## 1. 归属清理

- [x] 1.1 增加订阅节点归属解析与删除事务辅助函数。
- [x] 1.2 让主进程删除订阅复用归属清理，并保留运行中环境保护。
- [x] 1.3 让订阅刷新只保存实际写入节点的 ID。

## 2. 验证

- [x] 2.1 覆盖正常来源节点、历史 `nodeIds` 孤儿节点和其他订阅节点保护。
- [x] 2.2 运行 `npm test`、`npm run check`、`git diff --check`。
- [x] 2.3 运行 `openspec validate subscription-delete-cleans-owned-nodes --strict --no-interactive`。

## 3. 审查修复

- [x] 3.1 按节点记录归属删除同 ID 节点，保留其他订阅和手动记录。
- [x] 3.2 仅在节点 ID 无剩余记录时清理环境与其他订阅引用。
- [x] 3.3 运行碰撞 ID 回归测试、全量检查和严格规范校验。
- [x] 3.4 归档已完成的订阅生命周期规范。
