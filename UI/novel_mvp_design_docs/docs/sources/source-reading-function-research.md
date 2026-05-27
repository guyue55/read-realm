下面这份调研我建议直接作为你小说平台的“阅读体验能力基线”。结合你前面已经明确的方向：**免费优先搜索、前端优先解析、支持上传/链接/在线获取、预留 AI 功能**，这个平台不应只做“电子书阅读器”，而应定位为：

> **个人小说聚合阅读平台：本地上传 + 链接解析 + 免费搜索发现 + 章节净化 + 多端同步 + 沉浸式阅读 + AI 阅读增强。**

你已有方案里也已经把 MVP 聚焦在 TXT/EPUB 上传、章节解析、基础阅读器、书架、阅读进度、夜间模式、字体/行距/背景、链接解析、手动修正章节、IndexedDB 离线缓存和 AI 章节摘要，这个方向是对的。

---

# 1. 调研结论：小说阅读体验的核心不是“能打开”，而是“持续读得舒服”

普通阅读器的目标是打开 EPUB/PDF/TXT；小说平台的目标是让用户每天追更、长时间阅读、跨设备续读、换源、净化广告、修复章节，并能处理各种来源质量很差的文本。

从开源和成熟阅读器看，几个能力是高频出现的：多格式、本地导入、跨平台、阅读样式自定义、笔记高亮、进度同步、TTS、目录、搜索、书签、离线、云同步。Koodo Reader 支持 EPUB、PDF、MOBI/AZW3、TXT、FB2、漫画压缩包、MD、DOCX、HTML/XML 等格式，并覆盖 Windows、macOS、Linux、Android、iOS 和 Web，还支持多种云端/协议备份同步。([github.com](https://github.com/koodo-reader/koodo-reader)) Readest 则强调沉浸式深度阅读、跨平台、EPUB/PDF、批注、笔记、分屏阅读、TTS 和云同步。([github.com](https://github.com/readest/readest))

但对中文网文/小说用户来说，还必须额外强化：**书源规则、章节更新、换源、缺章/重复章检测、广告净化、章节标题修复、断点续读、长篇前情提要**。Legado/阅读 3.0 就是这个方向的优秀参考，它支持自定义书源、搜索/发现、本地 TXT/EPUB、替换净化、高度自定义阅读界面、简繁转换、多翻页模式，并且明确“不提供内容，只是转码工具”。([github.com](https://github.com/gedoor/legado))

---

# 2. 功能分层：应该分成 9 大模块

## 2.1 书架与内容管理

书架不是简单列表，而是用户长期使用的主入口。

应该具备：

| 能力 | 说明 | 优先级 |
|---|---|---:|
| 书架列表/网格切换 | 类似 Legado 的列表/网格书架 | P0 |
| 最近阅读 | 打开 App 直接续读 | P0 |
| 阅读进度 | 当前章、百分比、上次阅读时间 | P0 |
| 分类/标签/书单 | 玄幻、都市、待看、追更中、已完结 | P1 |
| 收藏/弃书/完读状态 | 后续推荐系统的重要信号 | P1 |
| 搜索书架 | 按书名、作者、标签、来源搜索 | P0 |
| 本地/在线来源标识 | 上传、链接、搜索、书源、手动 | P0 |
| 书籍元数据编辑 | 书名、作者、封面、简介、分类 | P1 |
| 数据备份/导入导出 | WebDAV、对象存储、Google Drive、OneDrive 等 | P2 |

Koodo Reader 的同步/备份能力很值得参考，它支持 OneDrive、Google Drive、Dropbox、iCloud、MEGA、pCloud、WebDAV、SFTP、SMB、对象存储等多种方案。([github.com](https://github.com/koodo-reader/koodo-reader)) 你的项目初期不必全做，但数据结构要预留 `syncProvider` 和 `backupSnapshot`。

---

## 2.2 文件导入与格式解析

你的平台差异化之一是“自己上传小说”。这里体验必须做到非常稳定。

### P0 格式

| 格式 | 建议处理方式 | 关键难点 |
|---|---|---|
| TXT | 前端解析优先 | 编码、章节识别、乱码、广告、水印 |
| EPUB | 前端解析优先 | OPF、spine、nav/NCX、章节 HTML 清理 |
| HTML/MHTML | 前端尝试，后端兜底 | DOM 清洗、图片、编码、相对链接 |
| Markdown | 前端解析 | 标题层级转章节 |

Epub.js 是浏览器端渲染 EPUB 的成熟库，提供渲染、分页、持久化等常见电子书能力，适合前端 EPUB 支撑。([github.com](https://github.com/futurepress/epub.js/)) 但你的平台不建议完全依赖 epub.js 的 UI，而应把 EPUB 解析为统一 `Book -> Chapter[]` 结构，再进入自研阅读器。

### P1/P2 格式

| 格式 | 建议处理方式 | 说明 |
|---|---|---|
| PDF | PDF.js 直接阅读 + 尝试提取文本 | PDF 不适合小说切章，优先保留原版阅读 |
| DOCX | 前端尝试，后端兜底 | 可转 HTML/EPUB |
| MOBI/AZW3 | 后端兜底 | 前端支持复杂，建议走转换服务 |
| CBZ/CBR | 漫画/图文阅读模式 | 后期再做 |

PDF.js 是 Mozilla 支持的 HTML5 PDF 解析/渲染平台，适合 Web/PWA 中直接查看 PDF。([github.com](https://github.com/mozilla/pdf.js/)) Calibre 则适合作为后端格式转换兜底，它能查看、转换、编辑和管理主流电子书格式。([github.com](https://github.com/kovidgoyal/calibre))

---

## 2.3 TXT 小说解析：这是中文小说平台的核心难点

TXT 用户最多，问题也最多。必须做专门的解析引擎。

### 必备能力

| 能力 | 说明 |
|---|---|
| 编码识别 | UTF-8、GBK、GB18030、Big5 |
| 章节标题识别 | 第1章、第一章、第001章、卷一、楔子、序章、终章、番外 |
| 目录识别 | 有些 TXT 前面有目录，需要识别并跳过 |
| 正文章节切分 | 不能误把正文短句识别为章节 |
| 广告/水印清理 | “请收藏本站”“最新网址”“手机用户请浏览”等 |
| 重复章节检测 | 常见于下载站合并 TXT |
| 缺章检测 | 第 100 章后直接第 102 章 |
| 乱序修复 | 章节编号不连续或顺序错乱 |
| 超大文件分片 | 避免浏览器主线程卡死 |
| 手动修正 | 自动解析失败时用户可改章节边界 |

### 章节识别不要只靠正则

建议做“候选行评分”：

```text id="9zd4ym"
章节候选行评分 =
  是否短行
+ 是否包含 第X章 / 第X节 / 第X回 / 卷X / Chapter X
+ 是否前后为空行
+ 是否出现在合理位置
+ 是否编号连续
- 是否过长
- 是否包含句号、逗号过多
- 是否像正文叙述
- 是否含广告词
```

Legado 的更新记录中也能看到它持续优化 TXT 目录识别、超长章节拆分、章节刷新和书源校验，说明 TXT/章节解析确实是长期体验工程，不是一次性正则能解决的。([github.com](https://github.com/TsaiYongChuan/legado/blob/main/app/src/main/assets/updateLog.md))

---

## 2.4 在线链接解析：要从“网页正文提取”升级为“小说结构提取”

用户粘贴小说链接后，系统要判断这是：

| 页面类型 | 识别依据 | 后续动作 |
|---|---|---|
| 详情页 | 有书名、作者、简介、目录入口 | 提取元数据 + 找目录 |
| 目录页 | 大量章节链接 | 建立 TOC |
| 章节页 | 正文长、有上一章/下一章 | 提取当前章 + 反推目录 |
| 普通文章页 | 没有章节关系 | 只做临时阅读 |

Mozilla Readability 可以作为通用正文提取兜底，它是 Firefox Reader View 使用的独立库，可通过 npm 使用。([github.com](https://github.com/mozilla/readability)) 但小说解析不能只靠 Readability，因为小说需要书名、作者、目录、章节标题、正文、上一章/下一章、分页正文、章节顺序等结构化信息。

推荐解析流程：

```text id="mal0qn"
URL 输入
  -> 拉取 HTML
  -> 页面类型识别
  -> 书源规则解析优先
  -> 站点适配器
  -> 通用启发式解析
  -> Readability 兜底正文
  -> 内容净化
  -> 质量评分
  -> 加入书架 / 临时阅读
```

---

## 2.5 搜索与书源：免费优先，但必须插件化

你已经明确“原则上只使用免费的，比如搜索引擎、免费接口等方式”。这个思路正确，但搜索不能硬编码。

建议做成 `SearchProvider`：

```ts id="yvjniy"
interface SearchProvider {
  id: string
  name: string
  type: 'search_engine' | 'book_source' | 'custom_api' | 'manual'
  search(keyword: string): Promise<SearchResult[]>
}
```

来源分三类：

| 类型 | 作用 | 风险 |
|---|---|---|
| 搜索引擎 | 发现候选入口 | 结果污染、反爬、重复 |
| 书源规则 | 搜索、目录、章节解析 | 维护成本、规则失效 |
| 免费接口 | 辅助元数据/候选结果 | 稳定性、限流、合规 |

Legado 的核心价值是把“找书/看书”变成自定义书源规则系统，支持搜索、发现和抓取网页数据。([github.com](https://github.com/gedoor/legado)) 你的平台应借鉴“规则协议”，但默认不内置高风险来源，避免维护和合规问题。

---

## 2.6 阅读器本体：至少做到“可长时间舒适阅读”

这是最核心的 UI/交互模块。

### 阅读样式 P0

| 能力 | 说明 |
|---|---|
| 字体大小 | 至少 12–36px |
| 字体族 | 系统字体、宋体、黑体、楷体、自定义字体 |
| 行高 | 1.2–2.4 |
| 段距 | 段前/段后 |
| 页边距 | 上下左右独立 |
| 背景色 | 白、米黄、灰、黑、护眼色、自定义 |
| 夜间模式 | 全局阅读夜间主题 |
| 护眼模式 | 暖色、低对比 |
| 亮度控制 | App 内亮度遮罩 |
| 简繁转换 | 中文小说强需求 |
| 横竖屏 | 移动端必备 |
| 单栏/双栏 | 平板和桌面端必备 |

用户社区讨论阅读设置时，常见关注点就是字体、字号、横竖屏、单/双栏、背景色、深色模式、边距和行距。([reddit.com](https://www.reddit.com/r/ereader/comments/1d1oogz/what_is_your_goto_text_setup/)) BookFusion 等商业阅读器也把边距、行距、字体、粗斜体、颜色和跨设备同步作为核心卖点。([apps.apple.com](https://apps.apple.com/au/app/bookfusion/id1141834096))

### 翻页/滚动 P0/P1

| 模式 | 优先级 |
|---|---:|
| 上下滚动 | P0 |
| 左右分页 | P0 |
| 点击左右区域翻页 | P0 |
| 滑动翻页 | P0 |
| 仿真翻页 | P2 |
| 自动滚动 | P1 |
| 音量键翻页 | P1，Android 重点 |
| 键盘方向键/空格 | P0，Web/桌面重点 |

Legado 支持覆盖、仿真、滑动、滚动等多种翻页模式。([github.com](https://github.com/gedoor/legado)) Moon+ Reader 这类成熟 Android 阅读器也强调本地阅读、平滑滚动、多格式和强控制能力。([play.google.com](https://play.google.com/store/apps/details?hl=en&id=com.flyersoft.moonreader&utm_source=chatgpt.com))

---

## 2.7 目录、进度、导航

小说用户经常一次读几百章，导航体验极其重要。

| 能力 | 说明 | 优先级 |
|---|---|---:|
| 章节目录 | 抽屉/侧栏/弹窗 | P0 |
| 当前章节定位 | 打开目录自动滚到当前章 | P0 |
| 章节搜索 | 搜“番外”“大结局”“第100章” | P1 |
| 阅读进度条 | 全书进度 + 当前章进度 | P0 |
| 章节进度点 | 进度条上显示章节刻度 | P1 |
| 上一章/下一章 | 按钮、快捷键、手势 | P0 |
| 跳转指定章 | 章节号输入 | P1 |
| 返回上次位置 | 防误触、目录跳转后可回退 | P0 |
| 阅读时间估算 | 当前章剩余、全书剩余 | P1 |

Foliate 的阅读体验中有进度滑条、章节标记、全屏、侧边导航、多点触控等设计，这类能力很适合 Web/桌面端借鉴。([en.wikipedia.org](https://en.wikipedia.org/wiki/Foliate_%28software%29))

---

## 2.8 标注、笔记、书签

小说用户不一定像学术阅读那样大量做笔记，但长篇小说里“人物、伏笔、金句、设定”非常适合收藏。

| 能力 | 说明 | 优先级 |
|---|---|---:|
| 书签 | 当前段落/章节 | P0 |
| 高亮 | 选中文本标记 | P1 |
| 笔记 | 对高亮/章节做备注 | P1 |
| 批注列表 | 全书高亮、笔记聚合 | P1 |
| 角色/设定标记 | AI 功能前置数据 | P2 |
| 导出笔记 | Markdown/HTML/JSON | P2 |

Readest 明确支持 highlights、notes、split-screen reading、TTS 和 cloud sync，这说明深度阅读产品已经把批注和同步作为标配。([readest.com](https://readest.com/)) Reddit 上也有用户专门寻找“阅读位置和批注同步可靠”的电子书 App，说明同步稳定性是痛点。([reddit.com](https://www.reddit.com/r/androidapps/comments/ikkgwt/recommendation_of_ebook_reader_apps_with_robust/))

---

## 2.9 离线与同步

如果你的目标包括 PWA、手机浏览器、小程序、Android/iOS，那么离线和同步必须从第一版就设计数据模型。

### 本地离线

| 数据 | 建议存储 |
|---|---|
| 书籍元数据 | IndexedDB |
| 章节内容 | IndexedDB，按章存 |
| 阅读设置 | localStorage + IndexedDB |
| 阅读进度 | IndexedDB，频繁写入需节流 |
| 上传原文件 | IndexedDB / OPFS |
| 封面图片 | Cache Storage / IndexedDB |

### 云端同步

| 数据 | 同步优先级 |
|---|---:|
| 书架 | P0 |
| 阅读进度 | P0 |
| 阅读设置 | P1 |
| 书签/笔记 | P1 |
| 上传文件 | P2，看成本 |
| 章节缓存 | P2，不建议默认全同步 |
| AI 摘要/人物关系 | P2 |

Google Play Books 等成熟阅读产品长期支持跨设备接续阅读和离线阅读，这类能力对用户粘性很关键。([en.wikipedia.org](https://en.wikipedia.org/wiki/Google_Play_Books))

---

# 3. 小说平台特有能力：这是你区别于普通电子书阅读器的关键

## 3.1 章节质量检测

在线小说经常存在章节错乱、重复、缺失、广告污染。

建议每本书维护 `chapterQuality`：

```ts id="6ri7gx"
type ChapterQuality = {
  chapterId: string
  titleScore: number
  contentScore: number
  wordCount: number
  duplicateOf?: string
  missingBefore?: boolean
  orderSuspicious?: boolean
  adScore: number
  sourceUrl?: string
}
```

检测项：

| 检测项 | 规则 |
|---|---|
| 缺章 | 第 100 章后出现第 102 章 |
| 重复章 | 标题相似 + 正文 hash 相似 |
| 断章 | 正文过短、出现“下一页继续阅读” |
| 错章 | 标题和上下文不连续 |
| 广告章 | 广告词密度过高 |
| 乱码章 | 非正常字符比例高 |
| 分页未合并 | 出现 page_2、下一页等痕迹 |

---

## 3.2 多来源换源

这是网文用户非常看重的能力。

| 场景 | 换源价值 |
|---|---|
| 某源缺章 | 找其他源补齐 |
| 某源广告多 | 换更干净来源 |
| 某源更新慢 | 找最新章节 |
| 某源错字多 | 选择质量更好版本 |
| 某源失效 | 自动 fallback |

Legado 更新记录中提到过“单章换源”，这说明换源不一定只在整本书维度，也可以精细到单章。([github.com](https://github.com/TsaiYongChuan/legado/blob/main/app/src/main/assets/updateLog.md))

你的设计建议：

```text id="024gbh"
整本换源：替换目录和章节来源
单章换源：当前章异常时手动/自动找其他来源
混合来源：主源 + 补章源
来源评分：速度、完整性、广告率、更新频率
```

---

## 3.3 内容净化

净化要做成管线：

```text id="82l8pm"
HTML 清理
  -> script/style/iframe 移除
  -> 广告节点移除
  -> 正文提取
  -> 分页正文合并
  -> 段落归一化
  -> 空行压缩
  -> 水印句删除
  -> 重复段落删除
  -> 标题修正
  -> 简繁转换
  -> 用户自定义替换规则
```

Legado 支持替换净化、广告内容去除、简繁转换，说明净化是中文小说阅读器的基础能力。([github.com](https://github.com/gedoor/legado)) 你的项目中应把净化规则分为：

| 规则层级 | 说明 |
|---|---|
| 全局规则 | 通用广告词、空行、乱码 |
| 站点规则 | 某站特定 selector/text |
| 书籍规则 | 某本书特殊问题 |
| 用户规则 | 用户自定义替换、人名替换 |
| AI 辅助规则 | 自动发现疑似广告/重复段落 |

---

# 4. AI 阅读功能：不要做聊天框，要做“阅读链路增强”

你已有设计里提到 AI 阅读增强、内容处理、推荐和创作辅助，并强调“不要直接覆盖原文，而是提供衍生阅读视图”，这个原则非常重要。

## 4.1 第一阶段：低风险、高价值 AI

| 功能 | 价值 | 优先级 |
|---|---|---:|
| 当前章摘要 | 快速回顾 | P0 |
| 前情提要 | 长时间未读后恢复上下文 | P0 |
| 人物关系 | 长篇群像小说很有用 | P1 |
| 设定/术语表 | 玄幻、科幻、克苏鲁、无限流 | P1 |
| 伏笔记录 | 长篇追更神器 | P2 |
| 时间线 | 权谋、悬疑、多线叙事 | P2 |

你已有方案中提到“章节摘要、前情提要、人物关系、世界观设定整理、术语表、伏笔记录、时间线梳理、长时间未读后的续读提醒”，这正好应该作为 AI 阅读增强层。

## 4.2 第二阶段：内容优化视图

不要修改原文，而是生成并缓存 `AIView`：

| 模式 | 说明 |
|---|---|
| 原文模式 | 默认 |
| 精简模式 | 去掉明显重复和废话 |
| 剧情速读 | 保留剧情推进 |
| 去水版 | 去重复心理、重复战斗、寒暄、作者废话 |
| 白话版 | 降低阅读门槛 |
| 设定整理版 | 抽取设定/人物/组织 |

你已有方案也明确提出“原文模式、精简模式、剧情速读模式、去水版、白话版、设定整理版”，并指出“去水”应针对重复心理描写、重复战斗描写、无效感叹、套路化寒暄、广告/作者废话、上一章重复内容。

## 4.3 第三阶段：推荐与创作

推荐不要一开始完全依赖大模型。先做：

```text id="6cjm7w"
阅读历史
完读率
弃书点
阅读速度
收藏/删除
题材标签
主角类型
节奏偏好
世界观偏好
爽点密度
AI 自动标签
```

你已有方案中提到推荐可先做“规则 + 向量”，再由 AI 生成更细标签和解释性推荐理由，这比单纯“猜你喜欢”更适合小说场景。

---

# 5. 竞品/开源项目参考矩阵

| 项目/产品 | 值得借鉴 | 对你的启发 |
|---|---|---|
| Legado/阅读 3.0 | 自定义书源、替换净化、本地 TXT/EPUB、简繁转换、多翻页模式 | 小说源和净化系统的核心参考 |
| Koodo Reader | 多格式、多平台、云同步/备份 | 多格式导入和跨端能力参考 |
| Readest | Next.js + Tauri、沉浸式阅读、笔记、高亮、TTS、云同步 | Web/PWA + 桌面/移动统一体验参考 |
| KOReader | 多格式、电子墨水设备、PDF/EPUB 优化 | 高级阅读设置、低干扰阅读参考 |
| epub.js | 浏览器端 EPUB 渲染、分页、持久化 | EPUB 前端能力参考 |
| PDF.js | HTML5 PDF 渲染/解析 | PDF 直接阅读模式 |
| Calibre | 格式转换、元数据、电子书管理 | 后端格式转换兜底 |
| Mozilla Readability | 通用网页正文提取 | 链接解析兜底方案 |
| Moon+ Reader | 强控制、多格式、本地阅读 | Android 阅读交互参考 |

Legado、Koodo、Readest、KOReader、epub.js、PDF.js、Calibre 和 Readability 都可以作为技术或产品 benchmark。([github.com](https://github.com/gedoor/legado))

---

# 6. 用户意见归纳：真实用户最在意这些

结合社区讨论、成熟阅读器功能和网文使用场景，可以归纳为 12 类痛点。

## 6.1 阅读设置要足够细

用户会非常在意字体、字号、背景色、深色模式、边距、行距、单/双栏、横竖屏等细节。Reddit 上关于阅读设置的讨论就集中在字体、字号、方向、布局、背景色、边距和行距。([reddit.com](https://www.reddit.com/r/ereader/comments/1d1oogz/what_is_your_goto_text_setup/))

结论：**阅读样式不要只给 3 个预设，要允许细调。**

## 6.2 同步必须可靠

很多用户寻找电子书 App 时会特别关注阅读位置和批注同步是否稳定。([reddit.com](https://www.reddit.com/r/androidapps/comments/ikkgwt/recommendation_of_ebook_reader_apps_with_robust/))

结论：**同步失败比没有同步更伤体验。第一版可以少同步，但必须可解释、可恢复。**

## 6.3 免费、无广告、无需注册会显著提升好感

有开发者在 Reddit 发布免费阅读 App 时，特别强调“100% 免费、无广告、无需注册”。([reddit.com](https://www.reddit.com/r/ereader/comments/1puc46d/i_built_a_free_reading_app_i_genuinely_need_your/))

结论：**你的平台如果自用/私有部署/免费优先，会形成差异化。**

## 6.4 用户要的是“导入自由”

成熟阅读器普遍支持用户导入自己的书。Koodo、Moon+ Reader、Google Play Books 等都支持本地或上传阅读。([github.com](https://github.com/koodo-reader/koodo-reader))

结论：**本地上传、多格式、批量导入，是核心竞争力。**

## 6.5 在线小说用户需要“章节质量保障”

中文网文经常缺章、错章、重复章、广告章。Legado 更新记录里多次涉及目录识别、章节刷新、单章换源、正文缺字漏字、排版错乱等问题。([github.com](https://github.com/TsaiYongChuan/legado/blob/main/app/src/main/assets/updateLog.md))

结论：**章节质量检测、换源、净化，是小说平台区别于电子书阅读器的关键。**

---

# 7. 建议功能优先级

## MVP：先做“上传 + 解析 + 舒适阅读”

你的已有 MVP 基本正确：TXT/EPUB 上传、自动解析目录章节、基础阅读器、书架、阅读进度、夜间模式、字体/行距/背景、链接解析、手动修正章节、IndexedDB 离线缓存、AI 章节摘要。

我建议 MVP 明确为：

### P0

```text id="zd5ujx"
1. TXT 上传与编码识别
2. TXT 自动切章
3. EPUB 解析
4. 书架
5. 阅读器：字体、字号、行高、段距、边距、背景、夜间模式
6. 滚动/分页阅读
7. 目录导航
8. 阅读进度自动保存
9. IndexedDB 离线缓存
10. 书签
11. 链接正文解析兜底
12. 手动修正章节标题/边界
```

### P1

```text id="90le59"
1. 章节质量检测
2. 广告/水印净化
3. 搜索引擎候选发现
4. 书源规则协议 v1
5. 多端账号同步
6. 高亮/笔记
7. TTS
8. AI 当前章摘要
9. AI 前情提要
```

### P2

```text id="zlvzan"
1. 多来源换源
2. 自动更新检测
3. 单章补源
4. PDF 阅读/提取
5. DOCX/MOBI/AZW3 后端转换
6. AI 人物关系
7. AI 去水版
8. 小说推荐
9. 创作工作台
10. Android/iOS/小程序/Tauri
```

---

# 8. 推荐阅读器交互细节

## 8.1 移动端阅读界面

建议屏幕点击区域：

```text id="51cwgr"
左 25%：上一页/上一屏
中 50%：呼出菜单
右 25%：下一页/下一屏
```

底部菜单：

```text id="tienwe"
目录 / 进度 / 设置 / 夜间 / 书签 / 更多
```

顶部菜单：

```text id="d00xq2"
返回 / 书名 / 搜索 / AI / 更多
```

设置面板：

```text id="xgejcd"
字号 - / +
行距 - / +
背景主题
字体
翻页方式
亮度
简繁
自动滚动
```

## 8.2 Web/桌面端阅读界面

桌面端重点是快捷键和宽屏排版：

| 快捷键 | 功能 |
|---|---|
| ← / → | 上一页/下一页 |
| ↑ / ↓ | 滚动 |
| Space | 下一屏 |
| Esc | 退出菜单/全屏 |
| F | 全屏 |
| B | 书签 |
| T | 目录 |
| A | AI 摘要 |
| S | 搜索 |

宽屏建议支持：

```text id="gp9qy7"
单栏居中
双栏阅读
左目录 + 右正文
右侧笔记/AI 面板
沉浸全屏
```

---

# 9. 数据结构建议

## Book

```ts id="llfq3j"
type Book = {
  id: string
  title: string
  author?: string
  cover?: string
  description?: string
  sourceType: 'upload' | 'url' | 'search' | 'bookSource' | 'manual'
  sourceUrl?: string
  format?: 'txt' | 'epub' | 'pdf' | 'html' | 'docx' | 'mobi' | 'azw3'
  status?: 'reading' | 'finished' | 'dropped' | 'to_read'
  tags: string[]
  createdAt: string
  updatedAt: string
  lastReadAt?: string
}
```

## Chapter

```ts id="0h1lcg"
type Chapter = {
  id: string
  bookId: string
  index: number
  title: string
  content: string
  wordCount: number
  sourceUrl?: string
  hash: string
  qualityScore?: number
  createdAt: string
  updatedAt: string
}
```

## ReadingProgress

```ts id="occv9d"
type ReadingProgress = {
  bookId: string
  chapterId: string
  chapterIndex: number
  offset: number
  percentage: number
  updatedAt: string
  deviceId?: string
}
```

## ReaderSettings

```ts id="fnj79v"
type ReaderSettings = {
  fontFamily: string
  fontSize: number
  lineHeight: number
  paragraphSpacing: number
  marginX: number
  marginY: number
  theme: 'light' | 'sepia' | 'dark' | 'green' | 'custom'
  pageMode: 'scroll' | 'pagination'
  turnMode: 'tap' | 'swipe' | 'simulation' | 'none'
  convertChinese?: 'none' | 's2t' | 't2s'
}
```

---

# 10. 最终建议：产品原则

第一，**阅读器要极致稳定**。不要一开始追求花哨 AI，TXT/EPUB 解析、目录、进度、样式、离线必须先稳。

第二，**小说平台必须有章节质量意识**。普通电子书是“文件完整”；在线小说是“来源不稳定、章节可能坏”。缺章、重复章、断章、错章、广告章必须产品化处理。

第三，**搜索只做发现，不承诺内容可用**。你前面提到免费搜索是正确方向，但搜索引擎结果、免费接口、书源规则都应该插件化，且合规边界要清晰。

第四，**链接解析要可解释**。解析失败时告诉用户是 CORS、页面动态渲染、未识别目录、正文过短还是疑似反爬，并允许手动选择正文区域或目录区域。

第五，**AI 要嵌入阅读动作**。最有价值的不是“问 AI”，而是“打开第 581 章时自动给我前情提要、人物关系、伏笔和本章摘要”。

第六，**MVP 应优先 Web/PWA**。你已有方案中建议 Web/PWA 起步、核心阅读引擎和解析引擎做成 TypeScript package，再复用到 Tauri、Capacitor、小程序，这是合理路线。

我建议下一步直接产出一份 **《小说平台阅读器模块 PRD》**，把页面、状态流、设置项、解析流程、章节质量评分、IndexedDB 表结构和 API 逐项拆出来。
