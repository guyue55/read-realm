/**
 * 集中化的 i18n 字典，包含所有中文 UI 字符串。
 * 用于 MVP 本地执行版本的 UI 国际化。
 */
export const strings = {
  shelf: {
    title: "我的阅读世界",
    importTitle: "导入本地书籍 (.txt, .epub)",
    loadingParser: "加载解析器...",
    readingFile: "读取文件中...",
    parsingFile: "正在解析...",
    parseSuccess: "解析成功！章节数：{count}",
    savingChapters: "正在保存章节...",
    syncingCloud: "同步到云端...",
    saveSuccess: '已成功保存 "{title}" 到书架！',
    searchPlaceholder: "搜索本地书架，或按回车搜索...",
    globalSearch: "搜索",
    searchingGlobal: "正在搜索云端数据库...",
    foundResults: "找到 {count} 条结果。",
    searchFailed: "搜索失败，请确认本地 API 服务是否启动。",
    libraryTitle: "我的书架",
    sortBy: "排序：",
    sortTitle: "书名",
    sortRecent: "时间",
    read: "阅读",
    delete: "删除",
    deleteConfirm: '确认删除 "{title}" 吗？',
    deleting: '正在删除 "{title}"...',
    deleteSuccess: '已成功删除 "{title}"。',
    noMatches: "未找到匹配的本地书籍。",
    emptyLibrary: "书架空空如也，导入一本书开始阅读吧！",
    globalResultsTitle: "搜索结果",
    notInLibrary: "不在书架",
    foundInCloud: "云端结果",
    settings: "设置",
  },
  reader: {
    loading: "正在加载章节...",
    backToShelf: "← 返回书架",
    aiSummary: "伴读",
    bookmark: "书签",
    bookmarkAdded: "已添加书签",
    toc: "目录",
    bookmarks: "书签",
    noBookmarks: "暂无书签",
    chapterCount: "共 {count} 章节",
    bookmarkCount: "共 {count} 个书签",
    noPreview: "无预览内容",
    fontSize: "字号",
    background: "背景",
    pageMode: "翻页模式",
    scroll: "上下滚动",
    pagination: "左右翻页",
    progress: "进度",
    settings: "设置",
    nightMode: "夜间",
    aiAssistant: "AI 阅读助手",
    summaryTitle: "本章总结",
    summarizing: "正在分析本章内容...",
    aiPrompt: "点击工具栏的 AI 按钮生成总结",
    quickQuestions: "快捷提问",
    aiInputPlaceholder: "问问 AI 助手...",
    send: "发送",
    aiError: "伴读失败，请检查后端服务是否启动。",
    aiNotConfigured:
      "AI 服务未配置。请在设置中配置你的 API 密钥，或联系管理员配置服务端 AI。",
    questionCharacters: "解释本章的关键人物关系",
    questionPlots: "这章有哪些重要的情节伏笔？",
    chapterIndexLabel: "第 {index} 章",
    prevChapter: "上一章",
    nextChapter: "下一章",
    startOfBook: "已是第一章",
    endOfBook: "已是最后一章",
    openSettings: "打开设置",
    themeNames: {
      paper: "纸张",
      sepia: "暖黄",
      green: "护眼",
      warmGray: "暖灰",
      dark: "深色",
    },
    uiModeLabel: "UI 主题",
    uiModeDefault: "默认 (丰富)",
    uiModeSimple: "简洁",
    fontFamilyLabel: "字体",
    fontFamilyKaiti: "楷体",
    fontFamilySongti: "宋体",
    fontFamilyHeiti: "黑体",
    lineHeightLabel: "行间距",
    paragraphSpacingLabel: "段落间距",
    letterSpacingLabel: "字间距",
    loadChapterFailed: "加载新章节失败，请检查网络",
    bookNotFound: "书籍不存在或已被物理移除",
    noChapters: "此藏书尚无章节内容或加载失败",
    autoFlipAtBottomLabel: "触底自动切章",
  },
  settings: {
    title: "阅读设置",
    subtitle: "这些设置会应用到阅读页，并在刷新或打开其他书籍后保留。",
    backToShelf: "返回书架",
    theme: "主题",
    themeHint: "选择适合当前环境的阅读背景。",
    previewTitle: "预览",
    previewText: "一页安静的文字，应该像灯下摊开的纸，也可以像夜里柔和的屏幕。",
    saved: "已保存",
  },
  network: {
    offlineToast: "设备当前离线；已下载内容和本地导入仍可使用。",
    onlineToast: "设备网络已恢复；云端服务将在实际操作时重新核验。",
    offlineLabel: "离线模式",
    onlineLabel: "在线模式",
    offlineImportHint:
      "设备当前离线，不能解析网络地址；仍可导入本机 TXT 或 EPUB 文件。",
    offlineSearchHint: "设备当前离线，不能检索云端；以下结果仅来自本地书架。",
    offlineDownloadHint: "设备当前离线，暂时不能下载云端正文。",
    offlineAiHint: "设备当前离线，暂时不能使用在线 AI 服务。",
  },
  sync: {
    title: "私人云同步",
    syncedDesc: "上次同步完成；下次操作仍会重新核验云端状态。",
    diffDesc: "设备已联网，可以尝试核对本机与私人云数据。",
    offlineDesc: "设备当前离线，私人云操作暂不可用；本机内容不受影响。",
    syncBtn: "立即双向同步",
    syncing: "正在双向同步中...",
    syncSuccess: "本次同步完成，并已重新读取云端书目。",
    syncFailed: "同步未完成，请检查私人云服务后重试。",
    uploading: "正在备份「{title}」至云端... {progress}%",
    downloading: "正在拉取「{title}」到本地... {progress}%",
    localOnly: "本地专享",
    cloudOnly: "云端可用",
    bothSynced: "已备份",
    backupBtn: "备份",
    downloadBtn: "拉取",
    offloadBtn: "释放",
    offloadSuccess:
      "已删除《{title}》的本机章节正文；书目、进度和已核验云端副本保留。",
    offloadConfirm:
      "确认删除《{title}》的本机章节正文以释放空间吗？书目与进度会保留，之后可从已核验的私人云副本重新下载。",

    // 自动同步与设置控制
    syncSettingsTitle: "私人云同步设置",
    autoSyncStartupLabel: "启动时尝试同步",
    autoSyncStartupDesc:
      "进入书架时核对本机与私人云数据；服务不可用时保留本机内容。",
    autoSyncProgressLabel: "阅读翻页自动备份",
    autoSyncProgressDesc: "阅读时延迟 3 秒备份进度，减少频繁写入。",

    // 进度防丢安全网
    progressRollbackBtn: "恢复本地历史阅读进度",
    progressRollbackSuccess: "已恢复到本地保存的第 {chapter} 章。",
    progressRollbackEmpty: "本机没有可恢复的历史阅读进度。",

    // 安全卸载校验
    offloadNoCloudError:
      "尚未核验这本书的私人云副本，不能删除本机正文。请先备份并核验。",
    offloadCountMismatchError:
      "私人云章节数（{cloudCount} 章）与本机（{localCount} 章）不一致，不能删除本机正文。",

    // 多端共享
    shareTitle: "私人云同步（旧版）",
    shareDesc:
      "同一访问口令会访问同一组私人云数据。当前旧同步不是端到端加密，服务器会保存明文正文；请只用于你信任的服务。",
    shareKeyLabel: "私人云访问口令",
    shareKeyPlaceholder: "输入访问口令，例如：松风阅心-1008",
    shareGenerateBtn: "生成访问口令",
    shareBindBtn: "保存访问口令",
    shareClearBtn: "移除此设备的口令",
    shareBindSuccess: "访问口令已保存，正在核对云端书目。",
    shareClearSuccess: "已从本设备移除访问口令；本机书架未删除。",
    shareCopySuccess: "访问口令已复制，请像密码一样保管。",
  },
};

export type Strings = typeof strings;

/**
 * 把 shared-types 中的 `AppErrorCode` 翻译成可读中文文案。
 * 解析、网络、AI、同步等链路抛出的 Error.message 若刚好是 AppErrorCode，
 * UI 层用 `describeAppError(err)` 就能拿到一句友好提示；否则原样返回 message。
 */
const APP_ERROR_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: "文件超出本地处理上限，请尝试拆分后再导入。",
  UNSUPPORTED_FORMAT: "暂不支持该格式，目前仅支持 TXT 与 EPUB。",
  ENCODING_DETECT_FAILED:
    "无法识别文本编码，请尝试转码为 UTF-8 或 GBK 后再导入。",
  CHAPTER_PARSE_FAILED: "章节切分失败，原文档可能没有规范的章节结构。",
  EPUB_PARSE_FAILED: "EPUB 解析失败，文件可能已损坏或加密。",
  URL_CORS_BLOCKED:
    "目标站点拒绝跨域抓取，可尝试改用后端兜底解析或导出原文后再导入。",
  URL_DYNAMIC_RENDER_REQUIRED: "页面依赖前端渲染，静态抓取拿不到正文。",
  SOURCE_RATE_LIMITED: "源站访问过于频繁，请稍后再试。",
  AI_QUOTA_EXCEEDED: "AI 配额已用尽，请检查账户余额或更换密钥。",
  SYNC_CONFLICT: "云端与本地数据冲突，请在设置中手动选择保留版本。",
  STORAGE_QUOTA_EXCEEDED: "本地存储空间不足，可在书阁中释放部分书籍后再试。",
  NETWORK_OFFLINE: "网络不可用，请检查后再试。",
  TASK_TIMEOUT: "任务执行超时，已自动中止。",
  TASK_CANCELLED: "任务已被取消。",
  FORCED_WORKER_TERMINATION:
    "后台解析引擎已中断。请先点击“立即重试”；若再次失败，请重新选择原文件。",
};

const BROWSER_ERROR_MESSAGES: Record<string, string> = {
  QuotaExceededError:
    "本地存储空间不足。请释放浏览器空间或删除不需要的本地缓存，然后使用原草稿重试。",
  NotAllowedError:
    "本地目录权限已拒绝或失效。请重新选择并授权原目录，任务草稿会继续保留。",
};

export function describeAppError(err: unknown): string {
  if (err instanceof Error) {
    const browserMessage = BROWSER_ERROR_MESSAGES[err.name];
    if (browserMessage) return browserMessage;
    const mapped = APP_ERROR_MESSAGES[err.message];
    return mapped ?? err.message;
  }
  if (typeof err === "string") {
    return APP_ERROR_MESSAGES[err] ?? err;
  }
  return "未知错误，请稍后再试。";
}
