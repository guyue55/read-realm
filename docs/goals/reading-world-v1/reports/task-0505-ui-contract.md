# TASK-0505 信息层级与共享 UI 合同

- Goal ID：GOAL-READING-WORLD-V1
- 控制修订：REV-0003
- 前置：TASK-0501~0504 与 EVID-62 已通过
- 状态：冻结；按 A → D 的最小可逆切片执行
- 完成边界：只完成 TASK-0505；不得外推 TASK-0506、PHASE-05、EVID-56/58、VPS 或 Goal complete

## 用户结果

个人书架与藏经阁以书和继续阅读为视觉主角，手机首屏不再被宣言、重复品牌或胶囊控件挤占；桌面与移动端使用同一套字体角色、Lucide 图标、触控、状态、弹层和反馈合同。用户从目录、分页、筛选或排序中进入书籍后，返回时仍回到原上下文。所有状态文案只陈述已证明的本地、源文件或云端事实。

## 不变边界

1. 保留 `AppShell + APP_NAV_ITEMS` 作为唯一主导航和六个既有入口，不新增第七入口，不建立第二套设计系统。
2. 不改 TASK-0504 已通过的公共/个人存储、凭据、扫描、同步与分页事实源；页面只组合既有领域服务。
3. 不新增推荐流、运营入口、账号、社交、勋章或假数据；硬编码示例不得冒充完整出版物或精选书源。
4. 不以动画代替层级、字体、图标、文案与状态修正；本任务不引入 GSAP。动效只允许 opacity/轻位移，并尊重 reduced motion。
5. 500 本/500 目录的 48 项书架窗口和藏经阁 24 项窗口不得回退；本任务不重写查询、同步或 reader-core。

## A · 真相与返回上下文

- 删除会把 `PRESET_BOOKLISTS` 写入个人书架的“精选/发现”路径；空架只提供“导入书籍”和“浏览藏经阁”，不得在加载态同时渲染空态。
- 统一纯状态映射：本机完整、本机仅书目、云端副本、源需授权、源缺失分别陈述；未证明有远端副本时不得显示云端状态。
- 删除、同步和危险操作必须按 typed outcome 反馈；本地未 applied 时不得继续远端删除，失败不得关闭对话框或显示成功。
- typed route 保存书架 `{folderId,page,sort,view}`、藏经阁 `{view,q,categoryId,tagId,maintainerId,page}` 与搜索 `{q,filter}`。非法值 fail-closed；返回/刷新恢复原上下文，仅目录消失或 catalog stale 时回合法页并给出持久说明。

## B · 共享交互基建

- `tokens.css` 是唯一运行时设计令牌源；移除或收敛互相矛盾的死令牌，禁止引用未定义 CSS 变量。
- 固定三档圆角：control 10px、card 16px、panel 22px；胶囊仅用于真正的短标签/单选筛选，不用于所有输入、按钮和卡片。
- 固定两档阴影：卡片低对比 paper shadow，浮层 raised shadow；避免多层 glow、厚重 blur 和 hover 漂浮。
- 所有主操作、图标按钮、分段项、弹层关闭和移动菜单双轴至少 44px；Lucide 默认 18px、stroke 1.75，emoji 不承担操作或状态图标。
- `ReaderDialogSurface` 关闭时不渲染视觉树；打开时由通用 modal isolation 隔离背景，具备初始焦点、Tab 圈定、Escape、异步失败保留和焦点归还。不得再使用原生 `confirm()`。
- 统一 `StatusNotice/StatePanel` 与 toast live region；toast 位于移动底栏和 safe area 之上，二者矩形不得相交。

## C · 信息层级与视觉语言

- AppShell 手机品牌入口为 44px；标题只出现一次。桌面侧栏保持克制，在线状态降为辅助信息。
- 书架有书时首屏直接显示“继续阅读/书架工具/书目”；空架才显示紧凑引导。大幅英雄卡不得常驻挤压书目，桌面首屏至少露出完整一行书卡，390px 首屏至少露出第一本书的标题与主要动作。
- 书卡和文件夹使用真实 button/link 语义，Enter/Space 可达；治理、同步、备份等次级动作进入一个可访问操作菜单或移动 sheet，不以小徽章堆叠。
- 藏经阁保持书籍/维护者/分类/标签四视图，但用共享分段与状态组件；副标题明确“可匿名浏览，入阁需私有云密钥”。维护者始终称“维护者标识”，不得称用户/账号。
- 字体角色固定：UI 正文使用 `--font-ui`；页面标题和书名使用 `--font-display`；`--font-accent` 只用于极少量品牌题签，不用于反馈、按钮或长正文。避免 `font-serif/font-reading-title` 绕过角色。
- 文案直白、安静、可验证；移除“微秒级、极奢、雕印、善也、密阁天青、松墨离线、Current Flow/Study”等营销或玄学表述。

## D · 单一响应式子树

- 阅读器正文与 chrome 都只挂载当前 viewport 对应的一套；TOC、AI、Settings 不得因 CSS `hidden` 同时实例化两份。
- 340↔1440 resize、设置/目录/AI 开合不丢阅读语义锚点、面板状态或焦点；AI typing/effect 每个动作只运行一次。
- Reader 全屏不强塞 AppShell；只复用共享 token、modal、toast presenter 与触控合同。

## 固定验收

1. 全新会话直达藏经阁时，所有 `open=false` dialog 均无可见/可点击/可聚焦 DOM；主页面不被遮挡。
2. 500 本第 8 页进入目录、切排序和视图、打开一本书后返回及刷新，原目录、页码、排序、视图、滚动与来源焦点恢复。
3. 藏经阁筛选后第 2 页开书/加入后返回，筛选和页码恢复；revision stale 仅回第一页并显示一次持久说明。
4. 延迟 IndexedDB 首次快照时只显示 loading；空架无 token 时所有引导均不写 books/chapters，只能进入导入或匿名藏经阁。
5. 本机完整/仅书目/云端/源需授权/源缺失状态矩阵逐项可推翻；本机不完整且无远端绝不显示云端 badge。
6. 注入 `book_not_found`、事务异常和远端删除失败：无假成功、对话框保留、远端请求只在本地 applied 后发生。
7. 340/390/768/1024/1440/1920 无横向溢出；所有关键触点至少 44×44，toast 与底栏不相交。
8. 键盘可打开书/目录/治理菜单；Dialog/Sheet 初始焦点、Tab、Escape、焦点归还与背景 inert 全通过。
9. computed style 复算 control/card/panel 三档圆角、两档阴影、字体角色和 Lucide stroke；关闭态弹层不占视觉树。
10. 340/390 与 1440 真实浏览器截图中书目优先；人工品牌、层级、状态、单手、低干扰均至少 4/5。
11. 340↔1440 切换时 TOC/AI/Settings 各最多一个实例，阅读锚点不变，AI effect 不双跑。
12. TASK-0504 production journey、500 本/文件夹窗口、阅读器分页/连续滚动与离线回归保持通过。

## 执行与重放

| 切片 | 副作用 | 重放 |
|---|---|---|
| A route/truth | URL、内存与 localStorage 视图状态 | replay_safe；只用隔离浏览器 profile，非法快照先归一化 |
| B shared UI | 共享组件与 CSS | replay_safe；逐组件迁移，不复制领域状态 |
| C hierarchy/polish | 书架与藏经阁视觉树 | replay_safe；保留旧领域 service，按视口回放 |
| D responsive reader | 阅读器 chrome 挂载 | verify_before_repeat；先固定语义锚点再 resize/开关面板 |
