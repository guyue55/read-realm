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
    aiSummary: "AI 总结",
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
    aiError: "AI 总结失败，请检查后端服务是否启动。",
    aiNotConfigured: "AI 服务未配置。请在设置中配置你的 API 密钥，或联系管理员配置服务端 AI。",
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
    offlineToast: "已断开网络，已自动启用离线阅读与导入模式",
    onlineToast: "网络已恢复，云端服务同步就绪",
    offlineLabel: "离线模式",
    onlineLabel: "在线模式",
    offlineImportHint: "⚠️ 当前处于离线状态，URL 解析暂不可用。建议一键导入本地 TXT 或 EPUB 书籍，支持 100% 离线解析。",
    offlineSearchHint: "⚠️ 当前处于离线状态，云端搜索暂不可用。已自动为您检索本地书架。",
    offlineDownloadHint: "当前处于离线状态，暂无法同步云端书籍，网络恢复后即可畅快拉取。",
    offlineAiHint: "当前处于离线状态，暂无法连接 AI 云端服务。网络恢复后即可展卷为您分析本章概要。",
  },
  sync: {
    title: "云同步中心",
    syncedDesc: "您的本地藏书与云端处于同步最新状态",
    diffDesc: "发现本地与云端存在数据微澜，建议立即双向同步",
    offlineDesc: "🌧️ 当前处于离线状态，同步中心已静默暂缓工作",
    syncBtn: "立即双向同步",
    syncing: "正在双向同步中...",
    syncSuccess: "🍃 书阁已纳天光，双向同步圆满！",
    syncFailed: "💡 同步通道繁忙，请确认云端服务是否启动",
    uploading: "正在备份「{title}」至云端... {progress}%",
    downloading: "正在拉取「{title}」到本地... {progress}%",
    localOnly: "本地专享",
    cloudOnly: "云端可用",
    bothSynced: "已备份",
    backupBtn: "备份",
    downloadBtn: "拉取",
    offloadBtn: "释放",
    offloadSuccess: "🍃 已物理释放「{title}」本地空间，保留云端索引。",
    offloadConfirm: "确定要物理释放「{title}」的本地章节内容吗？\n（该操作将清除本地缓存并节省空间，您随时可以从云端一键重新拉取）",
    
    // 自动同步与设置控制
    syncSettingsTitle: "同步管理与首选项",
    autoSyncStartupLabel: "启动时自动云同步",
    autoSyncStartupDesc: "冷启动进入书阁时，自动检测两端差异并默默双向对撞",
    autoSyncProgressLabel: "阅读翻页自动备份",
    autoSyncProgressDesc: "翻开书本翻阅时，在后台以 3 秒防抖自动将进度备份至云阁",
    
    // 进度防丢安全网
    progressRollbackBtn: "🍃 找回本地历史阅读痕迹",
    progressRollbackSuccess: "🍃 已成功唤醒上一次本地阅读痕迹（已恢复至：第 {chapter} 章）",
    progressRollbackEmpty: "💡 当前藏书在本地暂无历史覆盖备份，无法回弹",
    
    // 安全卸载校验
    offloadNoCloudError: "💡 无法物理释放：此藏书尚未在云端创建索引，请先点击「备份」",
    offloadCountMismatchError: "💡 无法物理释放：检测到云阁中的章节数（{cloudCount}章）与本地（{localCount}章）不匹配，请先执行「备份」覆盖更新云端，以免数据丢失！",

    // 多端共享
    shareTitle: "墨问密阁 · 多端共享",
    shareDesc: "在不同设备和浏览器中输入同一「展卷秘钥」，即可打破浏览器壁垒，共享属于您的密阁藏书与阅读心流进度。",
    shareKeyLabel: "密阁展卷秘钥 / 共享令牌",
    shareKeyPlaceholder: "请输入共享秘钥，例如：松风阅心-1008",
    shareGenerateBtn: "感念天机 · 生成秘钥",
    shareBindBtn: "一键绑定并同步",
    shareClearBtn: "断开共享",
    shareBindSuccess: "✨ 秘钥绑定成功！正在拉取专属密阁藏书...",
    shareClearSuccess: "🍃 已断开共享，自动恢复为独立单机书阁。",
    shareCopySuccess: "📋 秘钥已复制到剪贴板，快去其他设备上绑定吧！",
  },
};

export type Strings = typeof strings;

/**
 * 🏮 把 shared-types 中的 `AppErrorCode` 翻译成可读中文文案。
 * 解析、网络、AI、同步等链路抛出的 Error.message 若刚好是 AppErrorCode，
 * UI 层用 `describeAppError(err)` 就能拿到一句友好提示；否则原样返回 message。
 */
const APP_ERROR_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: "文件超出本地处理上限，请尝试拆分后再导入。",
  UNSUPPORTED_FORMAT: "暂不支持该格式，目前仅支持 TXT 与 EPUB。",
  ENCODING_DETECT_FAILED: "无法识别文本编码，请尝试转码为 UTF-8 或 GBK 后再导入。",
  CHAPTER_PARSE_FAILED: "章节切分失败，原文档可能没有规范的章节结构。",
  EPUB_PARSE_FAILED: "EPUB 解析失败，文件可能已损坏或加密。",
  URL_CORS_BLOCKED: "目标站点拒绝跨域抓取，可尝试改用后端兜底解析或导出原文后再导入。",
  URL_DYNAMIC_RENDER_REQUIRED: "页面依赖前端渲染，静态抓取拿不到正文。",
  SOURCE_RATE_LIMITED: "源站访问过于频繁，请稍后再试。",
  AI_QUOTA_EXCEEDED: "AI 配额已用尽，请检查账户余额或更换密钥。",
  SYNC_CONFLICT: "云端与本地数据冲突，请在设置中手动选择保留版本。",
  STORAGE_QUOTA_EXCEEDED: "本地存储空间不足，可在书阁中释放部分书籍后再试。",
  NETWORK_OFFLINE: "网络不可用，请检查后再试。",
  TASK_TIMEOUT: "任务执行超时，已自动中止。",
  TASK_CANCELLED: "任务已被取消。",
};

export function describeAppError(err: unknown): string {
  if (err instanceof Error) {
    const mapped = APP_ERROR_MESSAGES[err.message];
    return mapped ?? err.message;
  }
  if (typeof err === "string") {
    return APP_ERROR_MESSAGES[err] ?? err;
  }
  return "未知错误，请稍后再试。";
}
