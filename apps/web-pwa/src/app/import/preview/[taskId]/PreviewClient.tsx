"use client";

import { useEffect, useState } from "react";
import { db, type ImportTask } from "@reader/storage-core";
import { useVirtualRouter } from "@/lib/route-store";
import { QualityBadge, analyzeChapterQuality } from "@/components/QualityBadge";
import { AppShell } from "@/components/AppShell";
import { BookCover } from "@/components/BookCover";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function PreviewPage({
  params,
}: {
  params: { taskId: string };
}) {
  const [task, setTask] = useState<ImportTask | null>(null);
  const [draft, setDraft] = useState<ImportTask | null>(null);
  const [error, setError] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [visibleCount, setVisibleCount] = useState(60);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDanger: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isDanger: false,
    onConfirm: () => {},
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace(`/#${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const router = useVirtualRouter();

  useEffect(() => {
    db.importTasks.get(params.taskId).then((t) => {
      if (!t) {
        setError("任务未找到或已过期");
        return;
      }
      const clonedTask = {
        ...t,
        bookMetadata: { ...t.bookMetadata },
        chapters: t.chapters.map((chapter) => ({ ...chapter })),
      };
      setTask(t);
      setDraft(clonedTask);
    });
  }, [params.taskId]);

  // 增量懒加载：当用户向下滚动快接近底部 200px 时，自动追加载入 50 章，避免千章巨制 DOM 树爆炸
  useEffect(() => {
    if (!draft || draft.chapters.length <= visibleCount) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(draft.chapters.length, prev + 50)
          );
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    const anchor = document.getElementById("lazy-load-anchor");
    if (anchor) observer.observe(anchor);

    return () => {
      if (anchor) observer.unobserve(anchor);
    };
  }, [draft, visibleCount]);

  const handleConfirm = async () => {
    if (!task || !draft) return;
    if (!draft.bookMetadata.title.trim()) {
      setValidationMessage("书名不能为空");
      return;
    }
    if (draft.chapters.some((chapter) => !chapter.title.trim())) {
      setValidationMessage("章节标题不能为空");
      return;
    }
    setValidationMessage("");
    setSaving(true);
    try {
      await db.transaction(
        "rw",
        [db.books, db.chapters, db.importTasks],
        async () => {
          // 提取轻量级 ToC 目录元数据，冗余保存到 books 表，以便进入阅读器时一帧内 2ms 极速拉取
          const toc = draft.chapters.map((ch) => ({
            index: ch.index,
            title: ch.title,
          }));
          const bookWithToc = {
            ...draft.bookMetadata,
            title: draft.bookMetadata.title.trim(),
            author: draft.bookMetadata.author?.trim() || undefined,
            toc,
          };
          await db.books.add(bookWithToc);
          await db.chapters.bulkAdd(draft.chapters);
          await db.importTasks.delete(task.id);
        },
      );
      router.push("/library");
    } catch (e) {
      setError(`保存失败: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  const updateBookField = (field: "title" | "author", value: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            bookMetadata: { ...current.bookMetadata, [field]: value },
          }
        : current,
    );
  };

  const updateChapterTitle = (chapterIndex: number, title: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.index === chapterIndex ? { ...chapter, title } : chapter,
            ),
          }
        : current,
    );
  };

  const handleDiscard = () => {
    if (!task) return;
    setConfirmState({
      isOpen: true,
      title: "放弃书籍导入",
      message: "确定放弃此次导入吗？未保存的书籍元数据及已解析章节将被彻底移除，不可撤销。",
      isDanger: true,
      onConfirm: async () => {
        await db.importTasks.delete(task.id);
        router.push("/import");
      }
    });
  };

  if (error) {
    return (
      <AppShell title="解析失败" subtitle="导入任务未能完成">
        <div className="ui-card mx-auto max-w-md rounded-[16px] p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF0EC] text-[var(--ui-danger)]">
            !
          </div>
          <h2 className="mb-2 text-xl font-bold">解析失败</h2>
          <p className="mb-6 text-sm leading-6 text-[var(--ui-muted)]">
            {error}
          </p>
          <button
            onClick={() => router.push("/import")}
            className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-6 py-2 text-sm font-semibold text-white"
          >
            返回导入页
          </button>
        </div>
      </AppShell>
    );
  }

  if (!task || !draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ui-bg)] p-8">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[rgba(95,125,82,0.18)] border-t-[var(--ui-accent)]" />
      </div>
    );
  }

  const issueCount = draft.chapters.filter((chapter) =>
    analyzeChapterQuality(chapter.content, chapter.title),
  ).length;

  return (
    <AppShell
      title="解析预览"
      subtitle={`共 ${draft.chapters.length} 章 · ${issueCount} 个质量提醒`}
      rightNodes={
        <>
          <button
            onClick={handleDiscard}
            className="ui-focus-ring hidden rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white sm:inline-flex"
          >
            放弃
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="ui-focus-ring rounded-full bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#527047] disabled:opacity-50"
          >
            {saving ? "保存中..." : "加入书架"}
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="ui-card h-fit rounded-[18px] p-5">
          <div className="flex gap-4">
            <BookCover
              title={draft.bookMetadata.title}
              className="h-[144px] w-[96px]"
            />
            <div className="min-w-0 flex-1">
              <label className="block text-xs font-semibold text-[var(--ui-muted)]">
                书名
              </label>
              <input
                value={draft.bookMetadata.title}
                onChange={(event) => updateBookField("title", event.target.value)}
                className="ui-focus-ring mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-white/80 px-3 py-2 text-sm font-bold text-[var(--ui-text)]"
              />
              <label className="mt-3 block text-xs font-semibold text-[var(--ui-muted)]">
                作者
              </label>
              <input
                value={draft.bookMetadata.author || ""}
                onChange={(event) => updateBookField("author", event.target.value)}
                placeholder="未识别"
                className="ui-focus-ring mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-white/80 px-3 py-2 text-sm text-[var(--ui-text)] placeholder:text-[var(--ui-quiet)]"
              />
              <p className="mt-2 text-sm text-[var(--ui-muted)]">
                {draft.bookMetadata.format.toUpperCase()} 上传
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[rgba(80,65,45,0.05)] p-2">
                  <p className="text-[var(--ui-quiet)]">章节</p>
                  <p className="mt-1 font-bold">{draft.chapters.length}</p>
                </div>
                <div className="rounded-lg bg-[rgba(80,65,45,0.05)] p-2">
                  <p className="text-[var(--ui-quiet)]">质量</p>
                  <p className="mt-1 font-bold text-[var(--ui-accent)]">
                    {issueCount ? `${issueCount} 项` : "通过"}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-[14px] bg-[rgba(248,246,240,0.76)] p-4 text-sm leading-6 text-[var(--ui-muted)]">
            章节结构会先在这里检查。确认导入后，才会写入本地书架和正文缓存。
          </div>
          {validationMessage && (
            <div className="mt-3 rounded-lg border border-[#F2B8A2] bg-[#FFF6F1] px-3 py-2 text-sm font-semibold text-[var(--ui-danger)]">
              {validationMessage}
            </div>
          )}
        </aside>

        <section className="ui-card overflow-hidden rounded-[18px]">
          <div className="grid grid-cols-[minmax(0,1fr)_96px_92px] border-b border-[var(--ui-border)] bg-white/55 px-4 py-3 text-xs font-semibold text-[var(--ui-muted)]">
            <span>章节</span>
            <span>字数</span>
            <span>质量</span>
          </div>

          <div className="reader-scrollbar max-h-[calc(100vh-190px)] overflow-y-auto p-2">
            {draft.chapters.slice(0, visibleCount).map((ch) => {
              const quality = analyzeChapterQuality(ch.content, ch.title);
              return (
                <div
                  key={ch.index}
                  className={`grid grid-cols-[minmax(0,1fr)_96px_92px] items-center gap-2 rounded-xl px-3 py-3 text-sm transition-colors hover:bg-[var(--ui-accent-soft)] ${
                    quality ? "bg-[#FFF6F1]" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-8 shrink-0 text-right font-mono text-xs text-[var(--ui-warm)]">
                      {ch.index + 1}
                    </span>
                    <input
                      value={ch.title}
                      onChange={(event) =>
                        updateChapterTitle(ch.index, event.target.value)
                      }
                      className="ui-focus-ring min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 font-medium text-[var(--ui-text)] transition-colors focus:border-[var(--ui-border)] focus:bg-white/90"
                    />
                  </div>
                  <span className="text-xs text-[var(--ui-muted)]">
                    {ch.content.length} 字
                  </span>
                  {quality ? (
                    <QualityBadge
                      issueType={quality.issueType}
                      severity={quality.severity}
                    />
                  ) : (
                    <span className="text-xs font-semibold text-[var(--ui-accent)]">
                      优秀
                    </span>
                  )}
                </div>
              );
            })}

            {/* 丝滑增量加载锚点占位元素 */}
            {draft.chapters.length > visibleCount && (
              <div
                id="lazy-load-anchor"
                className="flex items-center justify-center py-6 gap-2 text-xs text-[var(--ui-quiet)]"
              >
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(95,125,82,0.18)] border-t-[var(--ui-accent)]" />
                <span>拂拭卷轴，正在载入后续章节...</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        isDanger={confirmState.isDanger}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </AppShell>
  );
}
