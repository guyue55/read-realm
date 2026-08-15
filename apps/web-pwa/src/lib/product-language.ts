export interface ProductTerm {
  label: string;
  plain: string;
}

export const PRODUCT_LANGUAGE = {
  brand: {
    label: "墨问",
    plain: "我的阅读世界",
  },
  navigation: {
    library: { label: "书架", plain: "书架" },
    publicLibrary: { label: "藏经阁", plain: "公共藏书" },
    search: { label: "搜索", plain: "搜索书籍" },
    importBook: { label: "导入", plain: "导入书籍" },
    notes: { label: "笔记", plain: "笔记与书签" },
    settings: { label: "设置", plain: "设置" },
  },
  actions: {
    importBook: { label: "纳书入阁", plain: "导入书籍" },
    continueReading: { label: "继续展卷", plain: "继续阅读" },
    writeNote: { label: "落墨", plain: "写笔记" },
    searchBook: { label: "寻书", plain: "搜索书籍" },
    browseNotes: { label: "笺注", plain: "笔记与书签" },
    syncData: { label: "云阁同步", plain: "同步数据" },
    deleteBook: { label: "删除书籍", plain: "删除书籍及本地章节" },
  },
  states: {
    online: { label: "在线", plain: "网络连接可用" },
    offline: { label: "离线", plain: "当前离线，仍可阅读已缓存内容" },
  },
} as const satisfies {
  brand: ProductTerm;
  navigation: Record<string, ProductTerm>;
  actions: Record<string, ProductTerm>;
  states: Record<string, ProductTerm>;
};
