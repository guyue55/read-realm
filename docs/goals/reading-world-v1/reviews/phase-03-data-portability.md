# PHASE-03 数据可携带性审查

- Goal ID：GOAL-READING-WORLD-V1
- 控制修订：REV-0002
- 审查状态：PASS
- 审查范围：TASK-0301~0304；不审查 PHASE-04 阅读器体验、PHASE-05 UI 质感、同步、部署或 Goal 终局完成。

## 已闭合的产品机制

1. TXT 200MB、EPUB 500MB、单本 1 万章使用内容寻址 fixture、Worker/流式处理与 UI 活体回放；配额、Worker 终止、目录权限失效均保留原输入/任务并给出重试动作。
2. 原生 macOS/Chrome 目录选择、撤权、重新授权已在隔离目录人工回放；撤权后不伪成功，重新授权后恢复正文。
3. 完整备份包使用版本、公开 schema、manifest、逐项 byteLength/SHA-256 与确定性内容 ID；选择文件先预览且零写入，支持空库副本恢复和显式冲突合并，失败补偿回滚并回读。
4. 书签笔记支持 UTF-8 Markdown/JSON 人读导出；活体检查只包含书名、章节、位置、摘录、笔记和时间，不包含本机路径或凭据。
5. URL 来源要求显式权利确认，只接受不含账号密码的 HTTP(S) 公开链接；后端仅在浏览器 CORS/网络拓扑失败时兜底，登录、付费、验证码、动态渲染和反爬直接停止。
6. 来源检查默认关闭；手动或用户启用后的到期检查只写书名/章节数差异预览，不覆盖本地书名、目录和章节正文。

## 人工可理解性判断

- 导入预览、失败恢复、备份影响、冲突选项、旧格式警告和来源边界均使用直接结果/下一步文案，不把“已解析”“已检查”表述成已入库或已覆盖。
- TASK-0301 原生权限记录见 [task-0301-native-folder-permission.md](task%2D0301-native-folder-permission.md)。
- 本审查尚不评价整体视觉圆润度、字体/图标、翻页、章节切换、阅读进度或手机长读舒适度；这些按总控留在 PHASE-04/05/08，不能用本阶段结果外推。

## 复算门

- 唯一命令：`node scripts/verify-reading-world.mjs --phase 03 --output docs/goals/reading-world-v1/reports/phase-03-import-portability.json`。
- 通过条件：所有命令 exit 0、报告 `summary.passed=true`、records 哈希闭合、`trackedMutationCount=0`、容量 fixture/端口/进程补偿完成，且报告绑定本审查与检查器所在 clean 提交。
- 若任一条件失败，本审查保持候选并按失败项回到对应 TASK；不得生成 EVID-03/04/05/16 FINAL 或推进 PHASE-04。

## 当前结论

`PASS`。完整阶段复算绑定 clean@`c8abb3547eb52afac5037889be68d2bf4a98801a`，14/14 检查通过、14/14 records SHA-256 独立匹配、`trackedMutationCount=0`；容量临时目录已清理，3100/4100 无监听。上一份 11/12 失败报告保存在 `reports/history/phase-03-import-portability-attempt-01/`，不被当前通过结论覆盖。

本结论只允许生成 EVID-03/04/05/16 并收束 PHASE-03；不证明 PHASE-04~09、视觉/阅读人工体验、同步、部署或 Goal 完成。
