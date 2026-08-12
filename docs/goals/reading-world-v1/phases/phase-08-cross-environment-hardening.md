# PHASE-08 跨环境、性能、安全与可访问性硬化

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-08
- 状态：就绪待执行
- 阶段目标：在约定规模和桌面/移动环境中证明正式功能达到性能、兼容、安全、隐私与可访问性门。
- 稳定输入：PHASE-01 至 07 的正式候选、固定 500 本/大文件样本、目标浏览器与设备矩阵。
- 依赖：PHASE-07 完成且 GATE-02 通过。
- 本阶段改动边界：性能和兼容修复、a11y、安全/隐私加固、实验功能隔离、AI/Provider 降级与验证脚本。
- 本阶段不做：不新增功能，不降压力规模，不用模拟截图替代目标环境，不开展公开部署。
- 定向检查：`node scripts/verify-reading-world.mjs --phase 08 --output docs/goals/reading-world-v1/reports/phase-08-hardening.json`；性能固定为书架、导入首屏、阅读器三页，各冷启动 5 次与暖启动 5 次，取每场景 p75；本地等价基线为 4 倍 CPU 降速、下行 1.6Mbps/上行 750Kbps/RTT 150ms、390x844，真实 Android/iOS 结果单独记录不得互相冒充。
- 主线门禁：所有正式功能矩阵通过；AI/网络/Provider 失败不伤核心；无白屏、遮挡、横溢出、焦点/触控缺陷、伪成功或数据泄漏。
- 活体验收：每个目标环境完成导入、阅读、离线、恢复、备份还原与适用的双端同步；记录性能与人工体验量表。
- 失败处理：按环境和根因形成差异化修复，不用浏览器特判掩盖契约问题；关键环境不可用则阻塞而非冒充覆盖。
- 回滚方式：性能/兼容修复独立切片；失败回退到最近阶段绿灯，不改写此前证据。
- 人工检查点：五项体验每项至少 4/5，无阻断或高风险残余问题。
- 阶段完成条件：`reports/phase-08-hardening.json`、`reports/phase-08-environments.md`、`reports/phase-08-experience.md`、`reviews/phase-08-independent.md` 与 EVID-12/13/15/19~24 候选产物可复算；目标环境缺失明确阻塞对应承诺。
- 下一入口：PHASE-09 / TASK-0901 冻结候选并收敛实现提交 A。

## 工作项
- TASK-0801：生成可复算压力数据，运行 500 本、1 万章、200MB TXT、500MB EPUB 的性能与内存基线。
- TASK-0802：完成桌面四浏览器和 Android/iOS/PWA 核心旅程矩阵，修复差异并把型号、OS、浏览器版本、真实/等价类别写入 `reports/phase-08-environments.md`。
- TASK-0803：完成 a11y、安全、隐私、AI/Provider 降级、依赖和泄漏扫描及否定清单。
- TASK-0804：独立质量审查和人工体验评分，写入 `reports/phase-08-experience.md` 与 `reviews/phase-08-independent.md`，收敛残余风险与候选判定。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0801 | 大型临时数据和性能报告 | verify_before_repeat | 固定生成种子与版本，重跑前清理测试目录并核对机器负载 |
| TASK-0802 | 浏览器/设备数据和同步测试库 | compensate | 使用专用测试库和设备，结束后撤销测试设备并清卷 |
| TASK-0803 | 扫描报告与隔离故障注入 | replay_safe | 记录规则版本、命令和退出码；不得触碰真实凭证 |
| TASK-0804 | 审查与人工记录 | human_required | 绑定候选提交和环境；源码变化后评分失效必须重做 |
