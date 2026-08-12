# PHASE-07 端到端加密私有同步

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-07
- 状态：就绪待执行
- 阶段目标：在服务端只见密文的前提下，交付可恢复、可撤销、冲突不丢数据的可选双端同步与单机 Docker 自托管。
- 稳定输入：GATE-01 通过的数据/备份/PWA 契约、Web Crypto 能力、NestJS/SQLite/Blob 当前边界、REV-0001 威胁边界。
- 依赖：PHASE-06 完成且 GATE-01 通过。
- 本阶段改动边界：sync/crypto 协议与领域服务、设备授权、API/Repository 密文存储、同步 UI、Dockerfile/compose、备份恢复和测试。
- 本阶段不做：不建多用户账号、官方托管云、PostgreSQL/Redis/Kubernetes；不默认同步全文；不在服务端持有解密密钥。
- 定向检查：先运行 `node scripts/verify-reading-world.mjs --phase 07 --output docs/goals/reading-world-v1/reports/phase-07-encrypted-sync.json`；风险门按顺序运行同一检查器的 `--experiment EXP-04`、仅失败后 `--experiment EXP-05`、仅再次失败后 `--experiment EXP-06`，各自输出 EVID-30/31/32 指定路径；检查器内部使用 `corepack pnpm --filter web-pwa exec playwright test e2e/gate-02.spec.ts --grep EXP-0X`，并运行 crypto/protocol/API、Docker 与明文探针。
- 主线门禁：默认只同步轻量数据；全文逐书明确开启；服务端库/Blob/日志/构建无明文或密钥；丢恢复码风险明确。
- 活体验收：两隔离设备通过恢复码或设备授权加入，执行轻量/全文同步、离线双写、冲突恢复、设备撤销、恢复包和 Docker 挂载备份还原。
- 失败处理：同步失败保留本地写入和队列；冲突保留副本；无法解密不覆盖密文；三次差异化 GATE-02 失败进入设计复核。
- 回滚方式：同步默认关闭；协议 envelope 版本化；旧客户端只读兼容；可移除远端绑定而保留本地数据和导出包。
- 人工检查点：恢复码保管、不可恢复警告、逐书上传预览、冲突和设备撤销流程可理解。
- 阶段完成条件：`reports/phase-07-threat-model.md`、`reports/phase-07-encrypted-sync.json`、实际执行的 `gate-02-attempt-0X.json`、`reviews/phase-07-gate-02.md` 与 EVID-09/10/11/18/21 可复算；第三次失败自动熔断。
- 下一入口：PHASE-08 / TASK-0801 建立完整压力与浏览器矩阵。

## 工作项
- TASK-0701：形成威胁模型，选用已验证密码原语并冻结密钥、设备、envelope、同步操作和冲突契约，写入 `reports/phase-07-threat-model.md`。
- TASK-0702：实现设备端密钥、恢复码/设备加入、撤销、轻量同步和逐书密文全文。
- TASK-0703：实现离线队列、幂等与冲突副本；后端只存密文并增加明文/日志探针。
- TASK-0704：提供本机与单机 Docker 自托管、挂载目录备份恢复；严格按 EXP-04→05→06 条件完成 GATE-02，审查写入 `reviews/phase-07-gate-02.md`。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0701 | 协议/威胁模型写入 | replay_safe | 版本化协议，任何原语或范围变化触发方向复核 |
| TASK-0702 | 密钥、设备和同步数据写入 | compensate | 仅用测试密钥与隔离库；重试前撤销测试设备并清测试密文 |
| TASK-0703 | 离线队列、服务器密文与日志 | verify_before_repeat | 核对 op ID/vector/version 后重放，冲突不覆盖历史 |
| TASK-0704 | Docker 容器、卷和备份文件 | verify_before_repeat | 先检查容器/卷/端口，使用命名测试卷；不得推送镜像或部署外部主机 |
