"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { db } from "@reader/storage-core";
import type { Bookmark } from "@reader/shared-types";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useVirtualRouter } from "@/lib/route-store";
import { filterNotes, type NoteWithBook } from "@/features/notes/notes-filter";

export default function NotesPage() {
  const router = useVirtualRouter();
  const [notes, setNotes] = useState<NoteWithBook[]>([]);
  const [query, setQuery] = useState("");
  const [bookId, setBookId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(null);

  useEffect(() => {
    if (window.location.pathname !== "/") {
      window.location.replace(`/#${window.location.pathname}${window.location.search}`);
      return;
    }
    void Promise.all([db.bookmarks.toArray(), db.books.toArray()])
      .then(([bookmarks, books]) => {
        const titles = new Map(books.map((book) => [book.id, book.title]));
        setNotes(
          bookmarks
            .map((note) => ({ ...note, bookTitle: titles.get(note.bookId) ?? "未知书籍" }))
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
        );
      })
      .catch((reason) => {
        console.error("读取笔记失败", reason);
        setError("暂时无法读取本地笔记，请刷新后重试。");
      })
      .finally(() => setLoading(false));
  }, []);

  const books = useMemo(
    () => Array.from(new Map(notes.map((note) => [note.bookId, note.bookTitle ?? "未知书籍"])).entries()),
    [notes],
  );
  const filtered = useMemo(() => filterNotes(notes, { bookId, query }), [notes, bookId, query]);

  const clearFilters = () => {
    setQuery("");
    setBookId("");
  };

  return (
    <PageLayout title="笔记" subtitle={`${notes.length} 条本地记录`} onBack={() => router.push("/library")} hideSidebar>
      <div className="mx-auto mt-4 w-full max-w-5xl space-y-5">
        <section className="ui-card rounded-lg p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <label className="relative">
              <span className="sr-only">搜索笔记</span>
              <Search aria-hidden="true" className="absolute left-3 top-3 text-[var(--ui-quiet)]" size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索摘录、批注或书名" className="ui-focus-ring h-11 w-full rounded-md border border-[var(--ui-border)] bg-white/80 pl-10 pr-3 text-sm" />
            </label>
            <label>
              <span className="sr-only">按书籍筛选</span>
              <select value={bookId} onChange={(event) => setBookId(event.target.value)} className="ui-focus-ring h-11 w-full rounded-md border border-[var(--ui-border)] bg-white/80 px-3 text-sm">
                <option value="">全部书籍</option>
                {books.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </select>
            </label>
          </div>
        </section>

        {loading ? (
          <p className="py-16 text-center text-sm text-[var(--ui-muted)]">正在读取本地笔记...</p>
        ) : error ? (
          <EmptyState title="笔记读取失败" description={error} primaryAction={{ label: "返回书架", onClick: () => router.push("/library") }} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={notes.length === 0 ? "暂无笔记" : "没有匹配的笔记"}
            description={notes.length === 0 ? "阅读时添加书签或批注，内容会保存在这台设备。" : "调整关键词或书籍筛选后再试。"}
            primaryAction={notes.length === 0 ? { label: "去阅读", onClick: () => router.push("/library") } : { label: "清除筛选", onClick: clearFilters }}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((note) => (
              <article key={note.id} className="ui-card flex min-h-56 flex-col rounded-lg p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-bold text-[var(--ui-text)]">{note.bookTitle}</h2><p className="mt-1 text-xs text-[var(--ui-muted)]">第 {note.chapterIndex + 1} 章</p></div>
                  <button aria-label="删除笔记" title="删除笔记" onClick={() => setDeleteTarget(note)} className="ui-focus-ring flex h-10 w-10 items-center justify-center rounded-md text-[var(--ui-danger)] hover:bg-[#FFF0EC]"><Trash2 aria-hidden="true" size={18} /></button>
                </div>
                <blockquote className="mt-4 flex-1 border-l-2 border-[var(--ui-warm)] pl-3 text-sm leading-6 text-[var(--ui-muted)]">{note.contentPreview || "无摘录预览"}</blockquote>
                {note.note && <p className="mt-4 rounded-md bg-[var(--ui-accent-soft)] p-3 text-sm leading-6 text-[var(--ui-text)]">{note.note}</p>}
                <div className="mt-4 flex items-center justify-between border-t border-[var(--ui-border)] pt-3 text-xs text-[var(--ui-quiet)]">
                  <time>{new Date(note.createdAt).toLocaleDateString("zh-CN")}</time>
                  <button onClick={() => router.push(`/reader/${note.bookId}?chapter=${note.chapterIndex}&bookmarkId=${note.id}`)} className="ui-focus-ring rounded-md px-2 py-1 font-semibold text-[var(--ui-accent)]">查看原文</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog isOpen={Boolean(deleteTarget)} title="删除笔记" message="确定删除这条笔记吗？此操作无法撤销。" isDanger onClose={() => setDeleteTarget(null)} onConfirm={async () => {
        if (!deleteTarget) return;
        await db.bookmarks.delete(deleteTarget.id);
        setNotes((current) => current.filter((note) => note.id !== deleteTarget.id));
        setDeleteTarget(null);
      }} />
    </PageLayout>
  );
}
