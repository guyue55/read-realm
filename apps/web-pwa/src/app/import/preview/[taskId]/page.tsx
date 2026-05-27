"use client";

import { useEffect, useState } from "react";
import { db, type ImportTask } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import { QualityBadge, analyzeChapterQuality } from "@/components/QualityBadge";
import { AppShell } from "@/components/AppShell";
import { BookCover } from "@/components/BookCover";

export default function PreviewPage({
  params,
}: {
  params: { taskId: string };
}) {
  const [task, setTask] = useState<ImportTask | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    db.importTasks.get(params.taskId).then((t) => {
      if (t) setTask(t);
      else setError("任务未找到或已过期");
    });
  }, [params.taskId]);

  const handleConfirm = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await db.transaction(
        "rw",
        [db.books, db.chapters, db.importTasks],
        async () => {
          await db.books.add(task.bookMetadata);
          await db.chapters.bulkAdd(task.chapters);
          await db.importTasks.delete(task.id);
        },
      );
      router.push("/library");
    } catch (e) {
      setError(`保存失败: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!task) return;
    if (!confirm("确定放弃此次导入吗？")) return;
    await db.importTasks.delete(task.id);
    router.push("/import");
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

  if (!task) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ui-bg)] p-8">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[rgba(95,125,82,0.18)] border-t-[var(--ui-accent)]" />
      </div>
    );
  }

  const issueCount = task.chapters.filter((chapter) =>
    analyzeChapterQuality(chapter.content, chapter.title),
  ).length;

  return (
    <AppShell
      title="解析预览"
      subtitle={`共 ${task.chapters.length} 章 · ${issueCount} 个质量提醒`}
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
              title={task.bookMetadata.title}
              className="h-[144px] w-[96px]"
            />
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-xl font-bold text-[var(--ui-text)]">
                {task.bookMetadata.title}
              </h2>
              <p className="mt-2 text-sm text-[var(--ui-muted)]">
                {task.bookMetadata.format.toUpperCase()} 上传
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[rgba(80,65,45,0.05)] p-2">
                  <p className="text-[var(--ui-quiet)]">章节</p>
                  <p className="mt-1 font-bold">{task.chapters.length}</p>
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
        </aside>

        <section className="ui-card overflow-hidden rounded-[18px]">
          <div className="grid grid-cols-[minmax(0,1fr)_96px_92px] border-b border-[var(--ui-border)] bg-white/55 px-4 py-3 text-xs font-semibold text-[var(--ui-muted)]">
            <span>章节</span>
            <span>字数</span>
            <span>质量</span>
          </div>

          <div className="reader-scrollbar max-h-[calc(100vh-190px)] overflow-y-auto p-2">
            {task.chapters.map((ch) => {
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
                    <span className="truncate font-medium text-[var(--ui-text)]">
                      {ch.title}
                    </span>
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
          </div>
        </section>
      </div>
    </AppShell>
  );
}
