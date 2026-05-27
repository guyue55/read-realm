你的补充非常关键，我建议把项目定位从“小说阅读器”提升为：

**个人小说聚合阅读平台：支持本地上传、链接解析、免费搜索聚合、章节净化、跨端沉浸式阅读，并预留 AI 增强层。**

下面是按你的约束重新梳理后的产品与技术方案。

---

## 1. 搜索小说：坚持免费优先，但要做“可插拔搜索层”

搜索来源建议分三类，不直接把某个来源写死：

### A. 搜索引擎方式

这是最通用的免费方案，可以支持：

```text id="esc9el"
书名 + 作者
书名 + 最新章节
书名 + txt
书名 + epub
site:某站点 书名
```

但要注意：  
**搜索引擎结果只适合“发现入口”，不适合直接当内容源。** 因为结果页结构变化、反爬限制、重复站点、广告页、采集站污染都很多。

建议设计成：

```text id="y3dme5"
用户搜索关键词
  -> 搜索引擎/免费接口返回候选站点
  -> 前端展示候选结果
  -> 用户选择某个链接
  -> 进入链接解析流程
```

### B. 小说源/书源规则

这个方向可以参考 **Legado / 阅读** 的设计。Legado 支持自定义书源，通过规则抓取网页数据，并支持搜索、发现、本地 TXT/EPUB、净化替换、高度自定义阅读界面等能力。这个模式非常适合你的项目，因为它把“搜索与解析规则”插件化，而不是硬编码在主程序里。([github.com](https://github.com/gedoor/legado))

你的系统可以设计一个类似的“书源规则协议”：

```json id="uizplm"
{
  "name": "示例书源",
  "searchUrl": "https://example.com/search?q={{keyword}}",
  "searchListSelector": "...",
  "bookNameSelector": "...",
  "authorSelector": "...",
  "bookUrlSelector": "...",
  "tocSelector": "...",
  "chapterTitleSelector": "...",
  "chapterContentSelector": "...",
  "nextPageSelector": "..."
}
```

后期可以支持用户导入/导出书源规则，但默认不内置高风险来源，避免法律和维护问题。

### C. 免费接口

免费接口可以作为辅助，但不建议作为核心依赖。原因是小说类免费接口通常稳定性、版权、限流、数据质量都不可控。更合理的方式是做成：

```text id="sjuv0f"
SearchProvider 接口
  - Google/Bing/Brave/Serp 免费额度
  - 自建搜索聚合
  - 用户自定义接口
  - 书源规则搜索
```

产品上表现为一个“搜索来源管理器”。

---

## 2. 前端优先解析：可行，但要分层处理

你的判断是对的：为了体验和后端压力，能在前端解析的尽量前端解析。但要注意浏览器限制，尤其是跨域、编码、压缩包、大文件、反爬页面。

建议分为三层：

| 场景 | 优先处理位置 | 原因 |
|---|---:|---|
| 用户上传 TXT / EPUB / HTML / MD | 前端 | 文件已在本地，隐私好，速度快 |
| 用户上传 PDF / DOCX / MOBI / AZW3 | 前端尝试，后端兜底 | 格式复杂，前端库支持不均 |
| 粘贴网页链接 | 前端尝试，后端代理兜底 | 受 CORS、编码、动态渲染影响 |
| 搜索引擎结果解析 | 后端优先 | 防止暴露接口 key，便于缓存 |
| 章节批量抓取 | 后端队列优先 | 前端不适合长任务、并发和重试 |
| AI 处理 | 后端优先，本地模型可选 | 成本、隐私、模型能力都要统一管控 |

---

## 3. 上传文件解析：目录、章节、正文是核心体验

这块必须认真做，否则阅读体验会非常差。建议把上传文件处理成统一的内部结构：

```ts id="wupkno"
type Book = {
  id: string
  title: string
  author?: string
  sourceType: 'upload' | 'url' | 'search' | 'manual'
  format: 'txt' | 'epub' | 'pdf' | 'html' | 'docx' | 'mobi' | 'azw3'
  cover?: string
  metadata: Record<string, any>
  chapters: Chapter[]
}

type Chapter = {
  id: string
  index: number
  title: string
  content: string
  wordCount: number
  sourceUrl?: string
  hash: string
}
```

### TXT 解析

TXT 是小说用户最常见的格式，也最容易出问题。

需要重点处理：

1. 编码识别：UTF-8、GBK、GB18030、Big5。
2. 章节标题识别。
3. 目录页识别与跳过。
4. 正文章节切分。
5. 重复章节检测。
6. 广告、站点水印、乱码清理。
7. 超大 TXT 分片解析，避免浏览器卡死。

章节标题规则建议支持：

```text id="dc0p8b"
第1章
第一章
第001章
正文 第一章
卷一 第一章
Chapter 1
番外一
楔子
序章
终章
后记
```

可以做成多策略评分，而不是单纯正则命中：

```text id="sj31tp"
章节候选行评分 =
  是否短行
+ 是否包含“第X章”
+ 是否包含“卷/章/节/回/篇”
+ 是否前后有空行
+ 是否不像正文
- 是否过长
- 是否包含广告词
```

### EPUB 解析

EPUB 应尽量在前端处理。`epub.js` 是浏览器端渲染 EPUB 的常用 JS 库，提供渲染、分页、阅读进度持久化等基础能力。([github.com](https://github.com/futurepress/epub.js/))

但你的项目不只是“打开 EPUB”，还要统一目录、章节、AI、搜索、推荐，所以建议不要完全依赖 epub.js 的 UI，而是：

```text id="nwmn1n"
epub.js / 自研 EPUB parser
  -> 读取 OPF / NCX / nav.xhtml
  -> 提取 spine 顺序
  -> 提取章节 HTML
  -> 转成统一 Chapter
  -> 进入你的阅读器渲染层
```

### PDF 解析

PDF 不适合作为小说阅读主格式，但用户一定会上传。前端可用 Mozilla PDF.js。PDF.js 是基于 HTML5 的 PDF 查看/解析平台，由 Mozilla 社区维护。([github.com](https://github.com/mozilla/pdf.js/))

建议 PDF 分两种模式：

```text id="6t2sp6"
阅读模式：直接 PDF.js 渲染
提取模式：尝试抽取文本 -> 切章 -> 转为小说阅读格式
```

不要一开始追求完美 PDF 转小说，因为 PDF 的文本顺序、页眉页脚、双栏、扫描版 OCR 都会造成大量问题。

### DOCX / MOBI / AZW3

这些可以后端兜底。Calibre 的 `ebook-convert` 支持大量输入格式，包括 AZW、AZW3、CBZ、CBR、CHM、DOCX、EPUB、FB2、HTML、MOBI、ODT、PDF、RTF、TXT 等。([manual.calibre-ebook.com](https://manual.calibre-ebook.com/faq.html))

建议后端转换策略：

```text id="0awzlg"
原始文件
  -> 后端沙箱
  -> calibre 转 EPUB 或 HTML
  -> 解析为统一章节结构
  -> 删除临时文件
```

---

## 4. 在线小说链接解析：要做成“发现目录 + 拉取章节 + 内容净化”

粘贴链接阅读的流程建议这样设计：

```text id="4nwgq9"
用户粘贴小说页 URL
  -> 判断页面类型
      1. 详情页
      2. 目录页
      3. 章节页
      4. 普通文章页
  -> 提取书名、作者、封面、简介
  -> 提取目录
  -> 用户确认加入书架
  -> 懒加载章节内容
  -> 阅读时预取下一章
```

### 页面类型识别

可以用规则 + 启发式：

```text id="jmlb3c"
如果页面有大量章节链接 -> 目录页
如果正文长度很长且有上一章/下一章 -> 章节页
如果有简介、作者、目录入口 -> 详情页
否则 -> 普通文章页
```

Mozilla Readability 可以作为通用正文提取兜底。它是 Firefox 阅读模式所使用的 Readability 库的独立版本，可通过 npm 使用。([github.com](https://github.com/mozilla/readability))

但小说页面不能只靠 Readability，因为小说需要：

```text id="kiry7z"
书名
作者
简介
目录
章节标题
上一章
下一章
正文
分页正文
```

所以最佳方案是：

```text id="s0i8rd"
书源规则解析优先
  -> 站点适配器
  -> 通用启发式解析
  -> Readability 兜底正文提取
```

### 章节内容净化

需要内置“净化管线”：

```text id="7fgnhu"
HTML 清理
  -> 去 script/style/iframe
  -> 去广告节点
  -> 段落归一化
  -> 全角/半角处理
  -> 空行压缩
  -> 水印句去除
  -> 重复段落检测
  -> 标题修正
```

可配置净化规则：

```json id="auva01"
{
  "removeTextPatterns": [
    "本章未完，点击下一页继续阅读",
    "请收藏本站",
    "最新网址",
    "手机用户请浏览"
  ],
  "removeSelectors": [
    ".ad",
    "#ads",
    ".recommend",
    "script",
    "style"
  ]
}
```

---

## 5. 阅读体验：这是核心竞争力

你提到很多知名小说网站阅读体验已经很强，这个产品要赢，至少要覆盖这些能力。

### 基础阅读能力

必须有：

```text id="brjfo7"
字体大小
字体族
行高
段距
页边距
背景色
夜间模式
护眼模式
横屏/竖屏
滚动/分页
仿真翻页/覆盖翻页/滑动翻页
进度条
章节目录
书签
笔记
高亮
阅读历史
自动保存进度
多端同步
离线缓存
```

Koodo Reader 支持 EPUB、PDF、MOBI、AZW3、TXT、FB2、漫画压缩包、MD、DOCX、HTML/XML 等多种格式，并支持 Windows、macOS、Linux、Android、iOS 和 Web，这说明多格式 + 多端是成熟阅读器的常见方向。([github.com](https://github.com/koodo-reader/koodo-reader))

Readest 也是一个值得参考的开源项目，它基于 Next.js 和 Tauri，目标是支持 macOS、Windows、Linux、Android、iOS 和 Web，并提供沉浸式阅读体验。([github.com](https://github.com/readest/readest))

### 小说阅读专属能力

普通电子书阅读器不一定做得好，但小说用户很看重：

```text id="sragqi"
自动订阅更新
章节更新提醒
断章检测
缺章检测
重复章检测
章节顺序修复
多来源换源
章节标题标准化
净化广告
屏蔽错别字/敏感替换
简繁转换
人名替换
滚动速度控制
听书/TTS
```

Legado 已经支持替换净化、简繁转换、界面高度自定义、多翻页模式、本地 TXT/EPUB、自定义书源等能力，这些非常适合作为你的小说体验 benchmark。([github.com](https://github.com/gedoor/legado))

---

## 6. AI 功能：建议分成“阅读增强”“内容处理”“创作辅助”三层

你提到的 AI 场景方向是对的，但不要一开始做成泛泛的聊天机器人。小说场景里，AI 应该直接嵌入阅读链路。

### A. 阅读增强

适合第一阶段做：

```text id="q5ziba"
章节摘要
前情提要
人物关系
世界观设定整理
术语表
伏笔记录
时间线梳理
长时间未读后的续读提醒
```

例如用户打开第 581 章时，可以显示：

```text id="naa0om"
上一阶段剧情：
- 主角进入秘境
- 女主身份暴露
- 反派获得残卷
- 当前冲突是宗门围杀
```

这个功能对长篇网文非常有价值。

### B. 内容优化

你说的“精炼、去除注水”可以做，但要谨慎设计。建议不要直接覆盖原文，而是提供模式：

```text id="tidebd"
原文模式
精简模式
剧情速读模式
去水版
白话版
设定整理版
```

“去水”可以针对：

```text id="tpernb"
重复心理描写
重复战斗描写
无效感叹
套路化寒暄
广告/作者废话
上一章重复内容
```

但要保留一个原则：**不篡改原文，生成的是衍生阅读视图。**

推荐内部结构：

```ts id="ulqw72"
type AIView = {
  chapterId: string
  type: 'summary' | 'compressed' | 'polished' | 'timeline' | 'characters'
  content: string
  model: string
  createdAt: string
}
```

### C. 推荐系统

推荐可以先不用大模型，先做规则 + 向量：

```text id="unbluc"
用户阅读历史
收藏/弃书/完读率
题材标签
主角类型
节奏偏好
世界观偏好
章节平均长度
爽点密度
```

AI 可以用于生成更细的标签：

```text id="q76huh"
修仙
凡人流
无系统
杀伐果断
慢热
群像
女强
权谋
克苏鲁
赛博修仙
```

然后推荐理由不是简单“猜你喜欢”，而是：

```text id="wcwv21"
推荐原因：
你最近读完了 3 本“凡人流 + 慢热 + 无系统”的修仙文，这本同样偏重资源积累和境界推进，但节奏更快。
```

### D. 写小说辅助

后期可以做成创作工作台：

```text id="3dqdkt"
大纲生成
人物卡
世界观设定
章节细纲
冲突设计
爽点设计
伏笔回收
章节续写
文风统一
错别字检查
注水检测
节奏评分
```

这个方向可以和“读者视角数据”结合：阅读器知道用户在哪些章节停留、跳读、弃书，这些数据反过来可以帮助创作者优化节奏。

---

## 7. 推荐技术架构

### 前端

建议：

```text id="47x88k"
Web/PWA：Next.js / React / Vue
移动端：优先 PWA + Capacitor，后期再原生
桌面端：Tauri
小程序：独立适配轻量阅读端
```

如果你想复用最大化：

```text id="3zsjxr"
核心阅读引擎：TypeScript package
解析引擎：TypeScript package
Web/PWA：调用核心包
Tauri：调用核心包
Capacitor App：调用核心包
小程序：裁剪版核心包
```

### 后端

建议模块：

```text id="diz49i"
用户系统
书架系统
文件存储
搜索聚合
链接解析代理
章节抓取队列
格式转换服务
AI 服务
同步服务
缓存服务
```

### 存储

```text id="38hdac"
PostgreSQL：用户、书籍、章节元数据
Redis：搜索缓存、章节缓存、任务队列
对象存储：上传文件、封面、导出文件
SQLite/IndexedDB：前端离线缓存
向量库：AI 推荐、语义搜索、人物/设定检索
```

---

## 8. 最小可行版本 MVP

我建议不要一开始做全平台，先做 Web/PWA。

### MVP 版本功能

```text id="ghd6er"
1. 用户上传 TXT / EPUB
2. 自动解析目录和章节
3. 基础阅读器
4. 书架
5. 阅读进度
6. 夜间模式 / 字体 / 行距 / 背景
7. 粘贴小说链接，尝试解析正文
8. 手动修正章节标题
9. IndexedDB 离线缓存
10. AI 章节摘要
```

这个版本能验证核心体验。

### 第二阶段

```text id="el68r7"
1. 搜索引擎聚合
2. 书源规则系统
3. 多来源换源
4. 章节更新检测
5. 高级净化规则
6. 账号同步
7. 移动端适配
8. AI 人物关系 / 前情提要
```

### 第三阶段

```text id="nq443x"
1. Android/iOS
2. 微信小程序
3. Tauri 桌面端
4. AI 去水版阅读
5. 小说推荐
6. 创作工作台
7. 导出 EPUB/TXT
8. 插件市场/书源市场
```

---

## 9. 我建议的核心原则

第一，**搜索只做发现，不承诺内容永久可用**。  
第二，**上传文件要做到极致，尤其 TXT/EPUB**。  
第三，**在线链接解析必须有目录、章节、正文三层质量评估**。  
第四，**前端优先，但后端要有代理、转换、队列兜底**。  
第五，**AI 不要做噱头，要嵌入阅读体验：摘要、前情、人物、去水、推荐、创作**。  
第六，**书源规则插件化，否则维护成本会爆炸**。  
第七，**版权与合规边界要清晰：用户自用、用户上传、用户输入链接、用户配置来源。**

我建议下一步可以直接进入一份更具体的 **《小说阅读平台 PRD + 技术架构设计》**，把模块、数据表、前端页面、解析流程、AI 功能和 MVP 排期全部拆出来。
