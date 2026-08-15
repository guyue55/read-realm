"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Download, Search, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BookCover } from "@/components/BookCover";
import {
  PublicLibraryCatalogStaleError,
  publicLibraryApiClient,
  type PublicLibraryBook,
} from "@/features/public-library/public-library-client";
import { publicLibraryJoinService } from "@/features/public-library/dexie-public-library-local";
import { PublicLibraryImportDialog } from "@/features/public-library/PublicLibraryImportDialog";
import { normalizeShareToken } from "@/lib/api";
import { useVirtualRouter } from "@/lib/route-store";

const categories = ["", "文学", "经典", "思想", "技术", "其他"] as const;

export default function PublicLibraryPage() {
  const router = useVirtualRouter();
  const [queryInput, setQueryInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [category, setCategory] = useState<(typeof categories)[number]>("");
  const [page, setPage] = useState(1);
  const [books, setBooks] = useState<PublicLibraryBook[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [joiningId, setJoiningId] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [maintenanceAvailable, setMaintenanceAvailable] = useState(false);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const catalogSnapshotRef = useRef<number | undefined>(undefined);
  const catalogRestartNoticeRef = useRef(false);

  useEffect(() => {
    if (window.location.pathname !== "/") {
      window.location.replace(
        `/#${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);

  useEffect(() => {
    const refreshMaintenanceAvailability = () => {
      setMaintenanceAvailable(
        Boolean(
          normalizeShareToken(
            window.localStorage.getItem("reader-share-token"),
          ),
        ),
      );
    };
    refreshMaintenanceAvailability();
    window.addEventListener("focus", refreshMaintenanceAvailability);
    window.addEventListener("storage", refreshMaintenanceAvailability);
    return () => {
      window.removeEventListener("focus", refreshMaintenanceAvailability);
      window.removeEventListener("storage", refreshMaintenanceAvailability);
    };
  }, []);

  const requestGeneration = useRef(0);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setState("loading");
    setMessage("");
    void publicLibraryApiClient
      .list({
        q: appliedQuery,
        category: category || undefined,
        page,
        pageSize: 24,
        snapshotRevision: page > 1 ? catalogSnapshotRef.current : undefined,
      })
      .then((result) => {
        if (generation !== requestGeneration.current) return;
        if (page === 1) catalogSnapshotRef.current = result.snapshotRevision;
        setBooks(result.items);
        setTotalPages(result.totalPages);
        setState("ready");
        if (catalogRestartNoticeRef.current) {
          catalogRestartNoticeRef.current = false;
          setMessage("馆藏刚刚有更新，已从第一页重新整理。");
        }
      })
      .catch((error: unknown) => {
        if (generation !== requestGeneration.current) return;
        if (error instanceof PublicLibraryCatalogStaleError) {
          catalogSnapshotRef.current = undefined;
          catalogRestartNoticeRef.current = true;
          setPage(1);
          return;
        }
        setBooks([]);
        setState("error");
        setMessage("藏经阁暂时无法连接；已加入书架的书仍可离线阅读。");
      });
  }, [appliedQuery, category, page, reloadNonce]);

  const joinBook = async (book: PublicLibraryBook) => {
    if (joiningId) return;
    setJoiningId(book.id);
    setMessage("");
    try {
      const result = await publicLibraryJoinService.join(book.id);
      router.push(`/reader/${result.localBookId}`);
    } catch {
      setMessage("整本正文未能完整加入，本地书架没有留下半本书。请稍后重试。");
    } finally {
      setJoiningId("");
    }
  };

  return (
    <>
      <div
        aria-hidden={importOpen || undefined}
        inert={importOpen || undefined}
      >
        <AppShell
          title="藏经阁"
          subtitle={
            maintenanceAvailable
              ? "公共明文馆藏 · 加入后保存在本机"
              : "公共明文馆藏 · 入阁需先在书架设置私有云密钥"
          }
          rightNodes={
            <div className="flex items-center gap-2">
              <button
                className="ui-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!maintenanceAvailable}
                onClick={() => setImportOpen(true)}
                ref={importButtonRef}
                title={
                  maintenanceAvailable
                    ? "选择 TXT 文件入阁"
                    : "请先在书架设置私有云密钥"
                }
                type="button"
              >
                <Upload aria-hidden="true" className="h-4 w-4" />
                入阁
              </button>
              <button
                className="ui-focus-ring hidden min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold sm:inline-flex sm:items-center"
                onClick={() => router.push("/library")}
                type="button"
              >
                回书架
              </button>
            </div>
          }
        >
          <section className="ui-card rounded-[var(--radius-card)] p-4 sm:p-5">
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                catalogSnapshotRef.current = undefined;
                setPage(1);
                setAppliedQuery(queryInput.trim());
                setReloadNonce((value) => value + 1);
              }}
            >
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">检索公共馆藏</span>
                <Search
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]"
                />
                <input
                  className="ui-focus-ring min-h-11 w-full rounded-full border border-[var(--color-border)] bg-white/80 pl-11 pr-4 text-sm"
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder="按书名或作者检索"
                  value={queryInput}
                />
              </label>
              <button
                className="ui-focus-ring min-h-11 rounded-full bg-[var(--color-primary)] px-5 text-sm font-semibold text-white"
                type="submit"
              >
                检索
              </button>
            </form>
            <div
              aria-label="馆藏分类"
              className="mt-4 flex flex-wrap gap-2"
              role="group"
            >
              {categories.map((item) => (
                <button
                  aria-pressed={category === item}
                  className={`ui-focus-ring min-h-11 rounded-full border px-4 text-xs font-semibold ${
                    category === item
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-white/70 text-[var(--color-muted)]"
                  }`}
                  key={item || "all"}
                  onClick={() => {
                    catalogSnapshotRef.current = undefined;
                    setCategory(item);
                    setPage(1);
                  }}
                  type="button"
                >
                  {item || "全部"}
                </button>
              ))}
            </div>
          </section>

          {message && (
            <p
              className="mt-4 rounded-2xl border border-[var(--color-border)] bg-white/75 p-4 text-sm"
              role="alert"
            >
              {message}
            </p>
          )}
          {state === "loading" ? (
            <p
              className="py-16 text-center text-sm text-[var(--color-muted)]"
              role="status"
            >
              正在整理馆藏…
            </p>
          ) : state === "ready" && books.length === 0 ? (
            <div className="ui-card mt-5 rounded-[var(--radius-card)] py-16 text-center">
              <BookOpen
                aria-hidden="true"
                className="mx-auto h-7 w-7 text-[var(--color-muted)]"
              />
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                这一层暂时没有匹配的书
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {books.map((book) => (
                <article
                  className="ui-card flex min-w-0 gap-4 rounded-[var(--radius-card)] p-4"
                  key={book.id}
                >
                  <BookCover
                    className="h-24 w-16 shrink-0"
                    compact
                    title={book.title}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-xs font-semibold text-[var(--color-primary)]">
                      {book.category}
                    </span>
                    <h2 className="mt-1 line-clamp-2 [font-family:var(--font-display)] text-base font-semibold">
                      {book.title}
                    </h2>
                    <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
                      {book.author || "佚名"} · {book.chapterCount} 章
                    </p>
                    <button
                      className="ui-focus-ring mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--color-primary)] px-4 text-xs font-semibold text-[var(--color-primary)] disabled:opacity-50"
                      disabled={Boolean(joiningId)}
                      onClick={() => void joinBook(book)}
                      type="button"
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      {joiningId === book.id ? "正在完整加入" : "加入书架"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="馆藏分页"
              className="mt-6 flex items-center justify-center gap-3"
            >
              <button
                className="ui-focus-ring min-h-11 rounded-full border px-4 text-sm disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                type="button"
              >
                上一页
              </button>
              <span className="text-sm text-[var(--color-muted)]">
                {page} / {totalPages}
              </span>
              <button
                className="ui-focus-ring min-h-11 rounded-full border px-4 text-sm disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
                type="button"
              >
                下一页
              </button>
            </nav>
          )}
        </AppShell>
      </div>
      <PublicLibraryImportDialog
        fallbackFocus={importButtonRef}
        onClose={() => setImportOpen(false)}
        onCompleted={() => {
          catalogSnapshotRef.current = undefined;
          setPage(1);
          setReloadNonce((value) => value + 1);
        }}
        open={importOpen}
      />
    </>
  );
}
