"use client";

import { useEffect, useState } from "react";
import { db } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import type { Bookmark } from "@reader/shared-types";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";

// 勋章详情定义
interface Medal {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  quote: string; // 励志诗词
  icon: string;
  conditionText: string;
  check: (books: number, notes: number) => boolean;
  theme: {
    bgActive: string;
    shadowActive: string;
    textActive: string;
    badgeBg: string;
  };
}

const MEDALS: Medal[] = [
  {
    id: "collector",
    title: "汗牛充栋",
    subtitle: "藏书家",
    description: "在本地书架藏书达到 3 册及以上，方可拂去书卷尘埃。",
    quote: "“发愤忘食，乐以忘忧，不知老之将至云尔。”",
    icon: "📚",
    conditionText: "藏书 ≥ 3 册",
    check: (books) => books >= 3,
    theme: {
      bgActive: "linear-gradient(135deg, #FFF0E5 0%, #E29B7A 100%)",
      shadowActive: "0 16px 36px rgba(226, 155, 122, 0.28)",
      textActive: "#5C3A24",
      badgeBg: "#F6DCC7",
    },
  },
  {
    id: "scholar",
    title: "笔耕不辍",
    subtitle: "摘录学者",
    description: "在阅读时留下的思考、高亮与书签达到 5 条及以上，雕刻心灵印记。",
    quote: "“读书破万卷，下笔如有神。”",
    icon: "✍️",
    conditionText: "笔记 ≥ 5 条",
    check: (_, notes) => notes >= 5,
    theme: {
      bgActive: "linear-gradient(135deg, #EEF7E8 0%, #89B37A 100%)",
      shadowActive: "0 16px 36px rgba(137, 179, 122, 0.28)",
      textActive: "#2B4724",
      badgeBg: "#D1E6C8",
    },
  },
  {
    id: "zen",
    title: "禅意初现",
    subtitle: "沉浸旅者",
    description: "只要进入过「墨问」的灯光与文字世界，即获赠该天青禅意勋章。",
    quote: "“惟江上之清风，与山间之明月，耳得之而为声，目遇之而成色。”",
    icon: "🍃",
    conditionText: "进入墨问阅读",
    check: () => true, // 全员默认亮起
    theme: {
      bgActive: "linear-gradient(135deg, #E6F3F7 0%, #7CB0C2 100%)",
      shadowActive: "0 16px 36px rgba(124, 176, 194, 0.28)",
      textActive: "#1A4150",
      badgeBg: "#C4E2EE",
    },
  },
];

export default function NotesPage() {
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<
    (Bookmark & { bookTitle?: string })[]
  >([]);
  const [bookCount, setBookCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stats" | "notes">("stats");
  
  // 勋章详情弹窗彩蛋
  const [activeMedal, setActiveMedal] = useState<Medal | null>(null);

  // 搜索和藏书过滤状态
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBookId, setSelectedBookId] = useState("");

  const bookFilters = Array.from(
    new Map(bookmarks.map((b) => [b.bookId, b.bookTitle || "未知书籍"])).entries()
  ).map(([id, title]) => ({ id, title }));

  const filteredBookmarks = bookmarks.filter((b) => {
    const matchesSearch = searchQuery
      ? b.contentPreview?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.bookTitle?.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesBook = selectedBookId ? b.bookId === selectedBookId : true;
    return matchesSearch && matchesBook;
  });

  useEffect(() => {
    const fetchNotesAndStats = async () => {
      try {
        const allBookmarks = await db.bookmarks.toArray();
        const allBooks = await db.books.toArray();
        const bookMap = new Map(allBooks.map((b) => [b.id, b.title]));

        const enriched = allBookmarks
          .map((b) => ({
            ...b,
            bookTitle: bookMap.get(b.bookId) || "未知书籍",
          }))
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

        setBookmarks(enriched);
        setBookCount(allBooks.length);
      } catch (error) {
        console.error("拂拭藏书馆数据发生异常:", error);
        // 出错时平滑降级，防白屏与无限 loading 挂起
        setBookmarks([]);
        setBookCount(0);
      } finally {
        setLoading(false);
      }
    };
    fetchNotesAndStats();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条笔记吗？")) return;
    try {
      await db.bookmarks.delete(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (error) {
      console.error("删除笔记发生异常:", error);
      alert("抱歉，由于本地数据库异常，笔记删除失败，请稍后重试。");
    }
  };

  return (
    <PageLayout
      title="阅历与笔记"
      subtitle="在这行行文字的温润间，留下您的沉淀与勋章印记"
      onBack={() => router.push("/library")}
      hideSidebar={true}
    >
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 mt-4 relative">
        
        {/* Tab 选项切换轨道 - 完美拟物胶囊设计 */}
        <div className="flex w-fit mx-auto bg-[rgba(80,65,45,0.04)] border border-[rgba(80,65,45,0.08)] p-1 rounded-full relative shadow-inner">
          <button
            onClick={() => setActiveTab("stats")}
            className={`px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 relative z-10 ${
              activeTab === "stats"
                ? "bg-white text-[var(--ui-accent)] shadow-sm scale-100"
                : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            温润阅历
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 relative z-10 ${
              activeTab === "notes"
                ? "bg-white text-[var(--ui-accent)] shadow-sm scale-100"
                : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            我的笔记 ({bookmarks.length})
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-24 gap-4">
            <div className="animate-spin text-[#678055] text-4xl font-light">↻</div>
            <p className="text-xs text-[var(--ui-quiet)]">正在拂去尘埃，拂拭藏书馆...</p>
          </div>
        ) : activeTab === "stats" ? (
          /* Tab A: 温润阅历 & 3D 物理勋章成就墙 */
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* 1. 读书小传与心流修行印记 - 双卡片宣纸卷面布局 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 读书小传卡片 (占 2/3 宽度) */}
              <div className="lg:col-span-2 bg-[#FFFDF8] rounded-[24px] border border-[#E9DCC8] p-8 md:p-10 shadow-[0_12px_40px_rgba(80,65,45,0.04)] relative overflow-hidden flex flex-col sm:flex-row items-center gap-8">
                {/* 天青晕染光圈背景 */}
                <div className="absolute -right-16 -bottom-16 w-48 h-48 rounded-full bg-[rgba(103,128,85,0.04)] filter blur-3xl pointer-events-none" />
                
                <div className="h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-2xl bg-[#EEF2E9] border border-[#CDD8C5] flex items-center justify-center text-3xl shadow-inner relative z-10">
                  🍃
                </div>
                <div className="flex-1 space-y-4 relative z-10">
                  <h3 className="text-xl font-bold font-serif text-[var(--ui-text)]">
                    漫游者的读书小传
                  </h3>
                  <p className="text-sm md:text-base text-[var(--ui-muted)] leading-relaxed font-serif text-justify">
                    在「墨问」安静的灯光里，您拂去书页尘埃，已经在书桌上收藏了{" "}
                    <strong className="text-[var(--ui-accent)] text-lg px-1 font-bold">{bookCount}</strong>{" "}
                    册经典。
                    在行行温润文字中游历，您共沉淀了{" "}
                    <strong className="text-[var(--ui-accent)] text-lg px-1 font-bold">{bookmarks.length}</strong>{" "}
                    条笔记。每一次高亮，都是您与千百年前智者的无声握手，印刻下专属于您的宁静世界。
                  </p>
                </div>
              </div>

              {/* 心流修行印记卡片 (占 1/3 宽度) */}
              <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E9DCC8] p-6 md:p-8 shadow-[0_12px_40px_rgba(80,65,45,0.04)] relative overflow-hidden flex flex-col items-center justify-between text-center min-h-[220px]">
                {/* 浅绿微光水墨背景 */}
                <div className="absolute -left-12 -bottom-12 w-32 h-32 rounded-full bg-[rgba(103,128,85,0.03)] filter blur-2xl pointer-events-none" />
                
                {/* 国风朱砂红泥瓦当「修行」印章 */}
                <div className="relative w-16 h-16 md:w-20 md:h-20 flex items-center justify-center rounded-full border-4 border-double border-[#B86B5C] bg-[#B86B5C]/6 shadow-sm rotate-[-8deg] select-none scale-100 hover:scale-105 active:scale-95 transition-transform duration-300 cursor-pointer" title="墨问留真 · 读书修行">
                  {/* 印泥斑驳质感 */}
                  <div className="absolute inset-0 rounded-full bg-[radial-gradient(#B86B5C_15%,transparent_20%)] bg-[size:6px_6px] opacity-15" />
                  <div className="flex flex-col items-center justify-center font-serif text-[#B86B5C] font-bold leading-tight">
                    <span className="text-[10px] md:text-xs tracking-widest font-semibold opacity-75">墨问</span>
                    <span className="text-sm md:text-base tracking-widest font-black -mt-0.5">修行</span>
                  </div>
                </div>

                <div className="space-y-1 relative z-10 mt-4">
                  <p className="text-xs text-[var(--ui-quiet)] font-serif">静心治学，笃行不怠</p>
                  <h4 className="text-lg md:text-xl font-bold font-serif text-[var(--ui-text)]">
                    连续修行{" "}
                    <strong className="text-[#B86B5C] text-2xl md:text-3xl px-1 font-black font-mono">18</strong>{" "}
                    天
                  </h4>
                </div>

                <p className="text-[10px] md:text-xs text-[var(--ui-muted)] leading-relaxed font-serif max-w-[200px] mt-3 pt-3 border-t border-[rgba(80,65,45,0.06)] w-full">
                  “一日不书，百事荒芜。”
                </p>
              </div>
            </div>

            {/* 2. 3D 拟物勋章墙面板 */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 pl-1">
                <span className="text-lg">🏆</span>
                <h3 className="text-lg font-bold font-serif text-[var(--ui-text)]">
                  阅读荣誉勋章
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {MEDALS.map((medal) => {
                  const isUnlocked = medal.check(bookCount, bookmarks.length);
                  
                  return (
                    <div
                      key={medal.id}
                      onClick={() => isUnlocked && setActiveMedal(medal)}
                      className={`relative rounded-[22px] border p-6 flex flex-col items-center text-center transition-all duration-300 shadow-sm physics-spring ${
                        isUnlocked
                          ? "cursor-pointer group active:scale-95"
                          : "opacity-60 bg-gray-50/50 border-dashed border-gray-200 select-none"
                      }`}
                      style={{
                        background: isUnlocked ? medal.theme.bgActive : "#FAFAF8",
                        borderColor: isUnlocked ? "transparent" : "#EBEBE5",
                        boxShadow: isUnlocked ? medal.theme.shadowActive : "none",
                      }}
                    >
                      {/* 3D 物理倾斜及发光微动效 CSS class 配合 group */}
                      {isUnlocked && (
                        <div className="absolute inset-0 rounded-[22px] border border-white/24 pointer-events-none z-10 transition-all duration-300 group-hover:border-white/45" />
                      )}

                      {/* 勋章质感徽章背景 */}
                      <div
                        className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-5 shadow-md relative z-10 transition-transform duration-500 ${
                          isUnlocked
                            ? "group-hover:scale-[1.12] group-hover:rotate-[6deg]"
                            : ""
                        }`}
                        style={{
                          backgroundColor: isUnlocked ? medal.theme.badgeBg : "#E4E4DF",
                          border: isUnlocked ? "3px solid rgba(255,255,255,0.4)" : "2px dashed #CDCDC7",
                        }}
                      >
                        {!isUnlocked && (
                          <span className="absolute -top-1 -right-1 text-xs bg-[#B86B5C]/12 text-[#B86B5C] px-1.5 py-0.5 rounded-full font-bold">
                            🔒
                          </span>
                        )}
                        {medal.icon}
                      </div>

                      {/* 勋章文本 */}
                      <h4
                        className="text-lg font-bold font-serif mb-1"
                        style={{ color: isUnlocked ? medal.theme.textActive : "#8A8A80" }}
                      >
                        {medal.title}
                      </h4>
                      <p
                        className="text-xs font-semibold uppercase tracking-widest mb-3 opacity-80"
                        style={{ color: isUnlocked ? medal.theme.textActive : "#A3A39A" }}
                      >
                        {medal.subtitle}
                      </p>
                      
                      <p
                        className="text-xs leading-relaxed max-w-[200px]"
                        style={{ color: isUnlocked ? medal.theme.textActive : "#A3A39A" }}
                      >
                        {medal.description}
                      </p>

                      <div className="mt-5 w-full border-t pt-3 flex justify-between items-center text-[10px] uppercase font-semibold opacity-75" style={{ borderColor: isUnlocked ? "rgba(255,255,255,0.18)" : "rgba(80,65,45,0.04)" }}>
                        <span style={{ color: isUnlocked ? medal.theme.textActive : "#8A8A80" }}>{medal.conditionText}</span>
                        <span style={{ color: isUnlocked ? medal.theme.textActive : "#8A8A80" }}>
                          {isUnlocked ? "✨ 已点亮" : "未达成"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Tab B: 我的笔记列表 */
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            {bookmarks.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white/45 backdrop-blur-md p-4 rounded-[20px] border border-[#E9DCC8] shadow-sm">
                {/* 搜索框 */}
                <div className="relative w-full sm:max-w-md">
                  <span className="absolute inset-y-0 left-4 flex items-center text-[var(--ui-quiet)] pointer-events-none">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="输入关键字搜索笔记或想法..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-full text-sm bg-white/70 border border-[#E9DCC8] focus:border-[var(--ui-accent)] focus:outline-none transition-colors placeholder-[#8A8374]"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-4 flex items-center text-[var(--ui-quiet)] hover:text-[var(--ui-text)]"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {/* 藏书选择器 */}
                <div className="relative w-full sm:w-64">
                  <select
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 rounded-full text-sm bg-white/70 border border-[#E9DCC8] focus:border-[var(--ui-accent)] focus:outline-none appearance-none cursor-pointer transition-colors"
                  >
                    <option value="">全部藏书</option>
                    {bookFilters.map((bk) => (
                      <option key={bk.id} value={bk.id}>
                        {bk.title}
                      </option>
                    ))}
                  </select>
                  <span className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-xs text-[var(--ui-quiet)]">
                    ▼
                  </span>
                </div>
              </div>
            )}

            {filteredBookmarks.length === 0 ? (
              <EmptyState
                title={bookmarks.length === 0 ? "暂无笔记" : "未找到匹配的笔记"}
                description={
                  bookmarks.length === 0
                    ? "在阅读器时长按或选中文字即可添加书签与笔记"
                    : "请尝试缩短或更改搜索词，或切换不同的藏书进行筛选"
                }
                actionLabel={bookmarks.length === 0 ? "去阅读" : "清除筛选条件"}
                onAction={() => {
                  if (bookmarks.length === 0) {
                    router.push("/library");
                  } else {
                    setSearchQuery("");
                    setSelectedBookId("");
                  }
                }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredBookmarks.map((bookmark) => (
                  <div
                    key={bookmark.id}
                    className="bg-[#FFFDF8] p-6 rounded-[24px] shadow-[0_6px_20px_rgba(80,65,45,0.03)] border border-[#E9DCC8] flex flex-col hover:shadow-[0_12px_28px_rgba(80,65,45,0.08)] transition-all duration-300 hover:-translate-y-0.5"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex flex-col">
                        <span className="text-base font-bold text-[#2F2A24] font-serif tracking-wide">
                          {bookmark.bookTitle}
                        </span>
                        <span className="text-xs text-[var(--ui-muted)] mt-1 font-serif">
                          第 {bookmark.chapterIndex + 1} 章
                        </span>
                      </div>
                      <button
                        onClick={() => handleDelete(bookmark.id)}
                        className="w-8 h-8 rounded-full bg-[#FFF0EC] text-[#DCA79A] flex items-center justify-center hover:bg-[#FCE0DA] hover:text-[#B86B5C] transition-colors shadow-sm"
                        aria-label="删除笔记"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex-1 bg-[#F5ECE2]/42 p-5 rounded-[16px] border border-[#ECE0D3] relative mb-6">
                      <div className="absolute top-3 left-4 text-4xl text-[#ECE0D3] font-serif leading-none select-none pointer-events-none">
                        &ldquo;
                      </div>
                      <p className="text-[#3A2D22] text-sm leading-relaxed relative z-10 font-serif italic pl-5 pr-2">
                        {bookmark.contentPreview || "（无内容预览）"}
                      </p>
                    </div>

                    <div className="flex justify-between items-center mt-auto border-t border-[rgba(80,65,45,0.06)] pt-4">
                      <span className="text-xs text-[var(--ui-quiet)] font-mono">
                        {new Date(bookmark.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() =>
                          router.push(
                            `/reader/${bookmark.bookId}?chapter=${bookmark.chapterIndex}&bookmarkId=${bookmark.id}`
                          )
                        }
                        className="text-[var(--ui-accent)] text-sm font-bold hover:text-[#4B633C] transition-colors flex items-center gap-1 font-serif"
                      >
                        跳转原文 <span>→</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 勋章获得惊喜弹层 - 羊皮纸宣纸风格模态窗 */}
        {activeMedal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setActiveMedal(null)}
          >
            <div
              className="relative w-full max-w-md bg-[#FAF6EE] rounded-[32px] border border-[#DFD1BF] shadow-2xl p-8 text-center flex flex-col items-center gap-6 animate-in zoom-in-95 duration-400 physics-spring"
              onClick={(e) => e.stopPropagation()}
              style={{
                boxShadow: `0 24px 60px rgba(80, 65, 45, 0.16), ${activeMedal.theme.shadowActive}`,
              }}
            >
              {/* 装饰边框 */}
              <div className="absolute inset-4 rounded-[24px] border border-[#E9DCC8]/65 pointer-events-none" />

              {/* 关闭按钮 */}
              <button
                onClick={() => setActiveMedal(null)}
                className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/60 text-[var(--ui-muted)] flex items-center justify-center hover:bg-white transition-all shadow-sm z-10"
              >
                ✕
              </button>

              {/* 勋章图标 */}
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-lg border-[4px] border-white/60 animate-bounce duration-1000"
                style={{
                  background: activeMedal.theme.bgActive,
                }}
              >
                {activeMedal.icon}
              </div>

              {/* 勋章文字内容 */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[var(--ui-accent)] tracking-widest uppercase bg-[var(--ui-accent-soft)] px-3 py-1 rounded-full">
                  已亮勋章 · {activeMedal.subtitle}
                </span>
                <h3 className="text-2xl font-bold font-serif text-[var(--ui-text)] mt-2">
                  {activeMedal.title}
                </h3>
              </div>

              {/* 文人诗句 - 居中倾斜宣纸背景 */}
              <div className="w-full bg-[#FFFDFB] p-5 rounded-[20px] border border-[#EBE3D3] shadow-inner relative">
                <p className="text-base font-serif text-[#4A3C31] leading-relaxed italic">
                  {activeMedal.quote}
                </p>
              </div>

              <p className="text-xs text-[var(--ui-muted)] max-w-xs leading-relaxed font-serif">
                {activeMedal.description}
              </p>

              <button
                onClick={() => setActiveMedal(null)}
                className="w-full py-3.5 bg-[var(--ui-accent)] hover:bg-[#4B633C] text-white font-bold rounded-2xl shadow-md transition-colors relative z-10"
              >
                谢过，继续前行
              </button>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
