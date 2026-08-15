"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  FolderTree,
  Search,
  Settings2,
  Tags,
  Upload,
  Users,
} from "lucide-react";
import {
  PUBLIC_LIBRARY_CATEGORIES,
  type PublicLibraryCategoryId,
  type PublicLibraryTagId,
} from "@reader/shared-types";
import { AppShell } from "@/components/AppShell";
import { BookCover } from "@/components/BookCover";
import {
  PublicLibraryCatalogStaleError,
  publicLibraryApiClient,
  type PublicLibraryBook,
  type PublicLibraryFacet,
} from "@/features/public-library/public-library-client";
import { publicLibraryJoinService } from "@/features/public-library/dexie-public-library-local";
import { PublicLibraryImportDialog } from "@/features/public-library/PublicLibraryImportDialog";
import { PublicLibraryCatalogEditorDialog } from "@/features/public-library/PublicLibraryCatalogEditorDialog";
import { normalizeShareToken } from "@/lib/api";
import { useVirtualRouter } from "@/lib/route-store";

type CatalogView = "books" | "maintainers" | "categories" | "tags";

const views = [
  { id: "books", label: "书籍", icon: BookOpen },
  { id: "maintainers", label: "维护者", icon: Users },
  { id: "categories", label: "分类", icon: FolderTree },
  { id: "tags", label: "标签", icon: Tags },
] as const;

export default function PublicLibraryPage() {
  const router = useVirtualRouter();
  const [queryInput, setQueryInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [view, setView] = useState<CatalogView>("books");
  const [categoryId, setCategoryId] = useState<PublicLibraryCategoryId | "">(
    "",
  );
  const [tagId, setTagId] = useState<PublicLibraryTagId | "">("");
  const [maintainerId, setMaintainerId] = useState("");
  const [page, setPage] = useState(1);
  const [books, setBooks] = useState<PublicLibraryBook[]>([]);
  const [facets, setFacets] = useState<PublicLibraryFacet[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [joiningId, setJoiningId] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<PublicLibraryBook | null>(
    null,
  );
  const [maintenanceAvailable, setMaintenanceAvailable] = useState(false);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRef = useRef<HTMLElement | null>(null);
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
    setBooks([]);
    setFacets([]);
    setLoadError("");
    const request =
      view === "books"
        ? publicLibraryApiClient.list({
            q: appliedQuery,
            categoryId: categoryId || undefined,
            tagId: tagId || undefined,
            maintainerId: maintainerId || undefined,
            page,
            pageSize: 24,
            snapshotRevision: page > 1 ? catalogSnapshotRef.current : undefined,
          })
        : publicLibraryApiClient.listFacets({
            view,
            q: appliedQuery,
            page,
            pageSize: 24,
            snapshotRevision: page > 1 ? catalogSnapshotRef.current : undefined,
          });
    void request
      .then((result) => {
        if (generation !== requestGeneration.current) return;
        if (page === 1) catalogSnapshotRef.current = result.snapshotRevision;
        if (view === "books") {
          setBooks(result.items as PublicLibraryBook[]);
          setFacets([]);
        } else {
          setBooks([]);
          setFacets(result.items as PublicLibraryFacet[]);
        }
        setTotalPages(result.totalPages);
        setState("ready");
        setLoadError("");
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
        setFacets([]);
        setState("error");
        setLoadError("藏经阁暂时无法连接；已加入书架的书仍可离线阅读。");
      });
  }, [appliedQuery, categoryId, maintainerId, page, reloadNonce, tagId, view]);

  const beginCatalogTransition = () => {
    requestGeneration.current += 1;
    setState("loading");
    setBooks([]);
    setFacets([]);
    setLoadError("");
    setMessage("");
  };

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
        aria-hidden={importOpen || Boolean(editingBook) || undefined}
        inert={importOpen || Boolean(editingBook) || undefined}
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
            <div
              aria-label="藏经阁视图"
              className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1"
              role="tablist"
            >
              {views.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    aria-selected={view === item.id}
                    className={`ui-focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold ${
                      view === item.id
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                        : "border-[var(--color-border)] bg-white/70 text-[var(--color-muted)]"
                    }`}
                    key={item.id}
                    onClick={() => {
                      if (view === item.id) return;
                      beginCatalogTransition();
                      catalogSnapshotRef.current = undefined;
                      setView(item.id);
                      setPage(1);
                    }}
                    role="tab"
                    type="button"
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                beginCatalogTransition();
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
                  placeholder={
                    view === "books"
                      ? "按书名、作者或维护者检索"
                      : "检索当前视图"
                  }
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
            {view === "books" && (
              <div
                aria-label="馆藏分类"
                className="mt-4 flex gap-2 overflow-x-auto pb-1"
                role="group"
              >
                <button
                  aria-pressed={!categoryId}
                  className={`ui-focus-ring min-h-11 rounded-full border px-4 text-xs font-semibold ${
                    !categoryId
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-white/70 text-[var(--color-muted)]"
                  }`}
                  onClick={() => {
                    if (!categoryId && !tagId && !maintainerId) return;
                    beginCatalogTransition();
                    catalogSnapshotRef.current = undefined;
                    setCategoryId("");
                    setTagId("");
                    setMaintainerId("");
                    setPage(1);
                  }}
                  type="button"
                >
                  全部
                </button>
                {PUBLIC_LIBRARY_CATEGORIES.map((item) => (
                  <button
                    aria-pressed={categoryId === item.id}
                    className={`ui-focus-ring min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold ${
                      categoryId === item.id
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                        : "border-[var(--color-border)] bg-white/70 text-[var(--color-muted)]"
                    }`}
                    key={item.id}
                    onClick={() => {
                      if (categoryId === item.id && !tagId && !maintainerId)
                        return;
                      beginCatalogTransition();
                      catalogSnapshotRef.current = undefined;
                      setCategoryId(item.id);
                      setTagId("");
                      setMaintainerId("");
                      setPage(1);
                    }}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {view === "books" && (tagId || maintainerId) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                <span>当前筛选：</span>
                {tagId && (
                  <button
                    className="ui-focus-ring min-h-11 rounded-full border border-[var(--color-border)] px-4"
                    onClick={() => {
                      beginCatalogTransition();
                      setTagId("");
                      setPage(1);
                    }}
                    type="button"
                  >
                    清除标签筛选
                  </button>
                )}
                {maintainerId && (
                  <button
                    className="ui-focus-ring min-h-11 rounded-full border border-[var(--color-border)] px-4"
                    onClick={() => {
                      beginCatalogTransition();
                      setMaintainerId("");
                      setPage(1);
                    }}
                    type="button"
                  >
                    清除维护者筛选
                  </button>
                )}
              </div>
            )}
          </section>

          {message && (
            <p
              className="mt-4 rounded-2xl border border-[var(--color-border)] bg-white/75 p-4 text-sm"
              role="alert"
            >
              {message}
            </p>
          )}
          {loadError && (
            <p
              className="mt-4 rounded-2xl border border-[var(--color-border)] bg-white/75 p-4 text-sm"
              role="alert"
            >
              {loadError}
            </p>
          )}
          {state === "loading" ? (
            <p
              className="py-16 text-center text-sm text-[var(--color-muted)]"
              role="status"
            >
              正在整理馆藏…
            </p>
          ) : state === "error" ? (
            <div className="ui-card mt-5 rounded-[var(--radius-card)] py-12 text-center">
              <p className="text-sm text-[var(--color-muted)]">
                当前视图没有载入，私人书架与已加入正文不受影响。
              </p>
              <button
                className="ui-focus-ring mt-4 min-h-11 rounded-full border border-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-primary)]"
                onClick={() => {
                  beginCatalogTransition();
                  setReloadNonce((value) => value + 1);
                }}
                type="button"
              >
                重新载入
              </button>
            </div>
          ) : state === "ready" &&
            (view === "books" ? books.length === 0 : facets.length === 0) ? (
            <div className="ui-card mt-5 rounded-[var(--radius-card)] py-16 text-center">
              <BookOpen
                aria-hidden="true"
                className="mx-auto h-7 w-7 text-[var(--color-muted)]"
              />
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                当前视图暂时没有匹配内容
              </p>
            </div>
          ) : view === "books" ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {books.map((book) => (
                <article
                  className="ui-card flex min-w-0 gap-4 rounded-[var(--radius-card)] p-4"
                  data-public-library-book
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
                    <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
                      {book.maintainerLabel || "本阁维护者"}
                      {book.tags?.length
                        ? ` · ${book.tags.map((tag) => tag.label).join(" / ")}`
                        : ""}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <button
                        className="ui-focus-ring inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--color-primary)] px-4 text-xs font-semibold text-[var(--color-primary)] disabled:opacity-50"
                        disabled={Boolean(joiningId)}
                        onClick={() => void joinBook(book)}
                        type="button"
                      >
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {joiningId === book.id ? "正在完整加入" : "加入书架"}
                      </button>
                      {maintenanceAvailable && (
                        <button
                          aria-label={`整理《${book.title}》目录`}
                          className="ui-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"
                          onClick={(event) => {
                            editButtonRef.current = event.currentTarget;
                            setEditingBook(book);
                          }}
                          type="button"
                        >
                          <Settings2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {facets.map((facet) => (
                <button
                  className="ui-card ui-focus-ring flex min-h-24 min-w-0 items-center justify-between gap-4 rounded-[var(--radius-card)] p-5 text-left"
                  data-public-library-facet
                  key={facet.id}
                  onClick={() => {
                    beginCatalogTransition();
                    catalogSnapshotRef.current = undefined;
                    if (view === "categories") {
                      setCategoryId(facet.id as PublicLibraryCategoryId);
                      setTagId("");
                      setMaintainerId("");
                    } else if (view === "tags") {
                      setCategoryId("");
                      setTagId(facet.id as PublicLibraryTagId);
                      setMaintainerId("");
                    } else {
                      setCategoryId("");
                      setTagId("");
                      setMaintainerId(facet.id);
                    }
                    setView("books");
                    setPage(1);
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate [font-family:var(--font-display)] text-base font-semibold">
                      {facet.label}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--color-muted)]">
                      点击查看馆藏
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--color-primary)]">
                    {facet.bookCount}
                  </span>
                </button>
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
                onClick={() => {
                  beginCatalogTransition();
                  setPage((value) => value - 1);
                }}
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
                onClick={() => {
                  beginCatalogTransition();
                  setPage((value) => value + 1);
                }}
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
      <PublicLibraryCatalogEditorDialog
        book={editingBook}
        fallbackFocus={editButtonRef}
        onClose={() => setEditingBook(null)}
        onSaved={(updated) => {
          setEditingBook(null);
          catalogSnapshotRef.current = undefined;
          setPage(1);
          setReloadNonce((value) => value + 1);
          setMessage("目录信息已更新，正文包保持不变。");
          setBooks((current) =>
            current.map((book) => (book.id === updated.id ? updated : book)),
          );
        }}
      />
    </>
  );
}
