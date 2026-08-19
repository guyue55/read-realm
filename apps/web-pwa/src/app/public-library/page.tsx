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
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatePanel } from "@/components/ui/StatePanel";
import { StatusNotice } from "@/components/ui/StatusNotice";
import { useAppToast } from "@/components/ui/AppToast";
import {
  PublicLibraryCatalogStaleError,
  publicLibraryApiClient,
  type PublicLibraryBook,
  type PublicLibraryFacet,
} from "@/features/public-library/public-library-client";
import {
  getBatchLocalStatesForPublicBooks,
  publicLibraryJoinService,
  type PublicBookLocalState,
} from "@/features/public-library/dexie-public-library-local";
import { PublicLibraryImportDialog } from "@/features/public-library/PublicLibraryImportDialog";
import { PublicLibraryCatalogEditorDialog } from "@/features/public-library/PublicLibraryCatalogEditorDialog";
import { PublicLibraryBookDetailModal } from "@/features/public-library/PublicLibraryBookDetailModal";
import {
  parsePublicLibraryRouteContext,
  serializePublicLibraryRouteContext,
  type PublicLibraryCatalogView,
} from "@/features/public-library/public-library-route-context";
import { normalizeShareToken } from "@/lib/api";
import { ROUTE_CONTEXT_EVENT, useVirtualRouter } from "@/lib/route-store";
import { Check, Compass } from "lucide-react";

const views = [
  { id: "books", label: "书籍", icon: BookOpen },
  { id: "maintainers", label: "维护者标识", icon: Users },
  { id: "categories", label: "分类", icon: FolderTree },
  { id: "tags", label: "标签", icon: Tags },
] as const;

export default function PublicLibraryPage() {
  const router = useVirtualRouter();
  const toast = useAppToast();
  const [initialRouteContext] = useState(() =>
    parsePublicLibraryRouteContext(
      typeof window === "undefined" ? "/public-library" : window.location.hash,
    ),
  );
  const [queryInput, setQueryInput] = useState(initialRouteContext.query);
  const [appliedQuery, setAppliedQuery] = useState(initialRouteContext.query);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [view, setView] = useState<PublicLibraryCatalogView>(
    initialRouteContext.view,
  );
  const [categoryId, setCategoryId] = useState<PublicLibraryCategoryId | "">(
    initialRouteContext.categoryId,
  );
  const [tagId, setTagId] = useState<PublicLibraryTagId | "">(
    initialRouteContext.tagId,
  );
  const [maintainerId, setMaintainerId] = useState(
    initialRouteContext.maintainerId,
  );
  const [page, setPage] = useState(initialRouteContext.page);
  const [books, setBooks] = useState<PublicLibraryBook[]>([]);
  const [facets, setFacets] = useState<PublicLibraryFacet[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState<{
    text: string;
    tone: "neutral" | "success" | "warning" | "danger";
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [joiningId, setJoiningId] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [localStates, setLocalStates] = useState<
    Map<string, PublicBookLocalState>
  >(new Map());
  const [importOpen, setImportOpen] = useState(false);
  const [previewingBook, setPreviewingBook] = useState<PublicLibraryBook | null>(
    null,
  );
  const [editingBook, setEditingBook] = useState<PublicLibraryBook | null>(
    null,
  );
  const [maintenanceAvailable, setMaintenanceAvailable] = useState(false);
  const [ingressAllowAny, setIngressAllowAny] = useState(false);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRef = useRef<HTMLElement | null>(null);
  const previewFallbackRef = useRef<HTMLElement | null>(null);
  const catalogSnapshotRef = useRef<number | undefined>(undefined);
  const catalogRestartNoticeRef = useRef(false);

  // 刷新当前可见书籍的本地书架与阅读进度状态
  const refreshLocalStates = async (targetBooks: PublicLibraryBook[]) => {
    if (!targetBooks.length) {
      setLocalStates(new Map());
      return;
    }
    try {
      const states = await getBatchLocalStatesForPublicBooks(targetBooks);
      setLocalStates(states);
    } catch (e) {
      console.warn("[PublicLibrary] 查询本地书籍状态异常:", e);
    }
  };

  useEffect(() => {
    if (window.location.pathname !== "/") {
      window.location.replace(
        `/#${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);

  useEffect(() => {
    const location = serializePublicLibraryRouteContext({
      view,
      query: appliedQuery,
      categoryId,
      tagId,
      maintainerId,
      page,
    });
    const targetHash = `#${location}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(window.history.state, "", targetHash);
    }
  }, [appliedQuery, categoryId, maintainerId, page, tagId, view]);

  useEffect(() => {
    const restoreRouteContext = () => {
      const context = parsePublicLibraryRouteContext(window.location.hash);
      requestGeneration.current += 1;
      catalogSnapshotRef.current = undefined;
      setQueryInput(context.query);
      setAppliedQuery(context.query);
      setView(context.view);
      setCategoryId(context.categoryId);
      setTagId(context.tagId);
      setMaintainerId(context.maintainerId);
      setPage(context.page);
    };
    window.addEventListener("popstate", restoreRouteContext);
    window.addEventListener(ROUTE_CONTEXT_EVENT, restoreRouteContext);
    return () => {
      window.removeEventListener("popstate", restoreRouteContext);
      window.removeEventListener(ROUTE_CONTEXT_EVENT, restoreRouteContext);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void publicLibraryApiClient
      .fetchStatus()
      .then((status) => {
        if (!cancelled) setIngressAllowAny(status.allowAny);
      })
      .catch(() => {
        if (!cancelled) setIngressAllowAny(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshMaintenanceAvailability = () => {
      setMaintenanceAvailable(
        ingressAllowAny ||
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
  }, [ingressAllowAny]);

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
          const fetchedBooks = result.items as PublicLibraryBook[];
          setBooks(fetchedBooks);
          setFacets([]);
          void refreshLocalStates(fetchedBooks);
        } else {
          setBooks([]);
          setFacets(result.items as PublicLibraryFacet[]);
        }
        setTotalPages(result.totalPages);
        setState("ready");
        setLoadError("");
        if (catalogRestartNoticeRef.current) {
          catalogRestartNoticeRef.current = false;
          setNotice({
            text: "馆藏刚刚有更新，已从第一页重新整理。",
            tone: "warning",
          });
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

  // 页面重新获焦时静默对齐本地书架状态与阅读进度
  useEffect(() => {
    const onWindowFocus = () => {
      if (books.length > 0) {
        void refreshLocalStates(books);
      }
    };
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [books]);

  const beginCatalogTransition = () => {
    requestGeneration.current += 1;
    setState("loading");
    setBooks([]);
    setFacets([]);
    setLoadError("");
    setNotice(null);
  };

  /**
   * 即刻开卷 / 继续阅读：
   * 1. 若本地已收录，直接路由进入阅读器（保留公共藏经阁来源参数 ?from=public-library）；
   * 2. 若本地尚未收录，静默完整拉取后直接进入阅读器，实现零感知秒开！
   */
  const openBook = async (book: PublicLibraryBook) => {
    if (openingId || joiningId) return;
    const localState = localStates.get(book.id);
    if (localState?.localBook) {
      router.push(`/reader/${localState.localBook.id}?from=public-library`);
      return;
    }

    setOpeningId(book.id);
    setNotice(null);
    try {
      const result = await publicLibraryJoinService.join(book.id);
      void refreshLocalStates(books);
      router.push(`/reader/${result.localBookId}?from=public-library`);
    } catch (err) {
      console.error("[PublicLibrary] 开卷失败:", err);
      setNotice({
        text: "整本正文未能完整加入，本地书架没有留下半本书。请稍后重试。",
        tone: "danger",
      });
    } finally {
      setOpeningId("");
    }
  };

  /**
   * 仅加入书架（不跳转阅读）
   */
  const joinBookOnly = async (book: PublicLibraryBook) => {
    if (joiningId || openingId) return;
    setJoiningId(book.id);
    setNotice(null);
    try {
      await publicLibraryJoinService.join(book.id);
      await refreshLocalStates(books);
      toast.showToast(`《${book.title}》已成功放入书架`, "success");
    } catch (err) {
      console.error("[PublicLibrary] 加入书架失败:", err);
      setNotice({
        text: "整本正文未能完整加入，本地书架没有留下半本书。请稍后重试。",
        tone: "danger",
      });
    } finally {
      setJoiningId("");
    }
  };

  return (
    <>
      <div>
        <AppShell
          title="藏经阁"
          subtitle={
            maintenanceAvailable
              ? "公共明文馆藏 · 匿名可浏览；上传需要维护口令"
              : "公共明文馆藏 · 匿名可浏览；上传前请在书架设置私有云访问口令"
          }
          rightNodes={
            <div className="flex items-center gap-2">
              <button
                className={`ui-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white ${
                  maintenanceAvailable
                    ? ""
                    : "cursor-not-allowed opacity-45"
                }`}
                aria-disabled={!maintenanceAvailable}
                onClick={() => {
                  if (!maintenanceAvailable) {
                    // 点击始终有反馈：未满足条件时给出引导，而非静默无反应。
                    toast.showToast(
                      "入阁需要开启无限制入阁，或在「设置 → 同步口令」填入实例维护口令（一键启动会打印）。",
                      "warning",
                    );
                    return;
                  }
                  setImportOpen(true);
                }}
                ref={importButtonRef}
                title={
                  maintenanceAvailable
                    ? "选择 TXT 文件入阁"
                    : "入阁需开启无限制模式，或在设置页填入维护口令"
                }
                type="button"
              >
                <Upload aria-hidden="true" className="h-4 w-4" />
                入阁
              </button>
              <button
                className="ui-focus-ring hidden min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold sm:inline-flex sm:items-center"
                onClick={() => router.push("/library")}
                type="button"
              >
                回书架
              </button>
            </div>
          }
        >
          <section className="ui-card rounded-[var(--radius-card)] p-4 sm:p-5">
            <SegmentedControl
              className="mb-4"
              label="藏经阁视图"
              onChange={(nextView) => {
                if (view === nextView) return;
                beginCatalogTransition();
                catalogSnapshotRef.current = undefined;
                setView(nextView);
                setPage(1);
              }}
              options={views.map((item) => ({
                icon: <item.icon aria-hidden="true" />,
                label: item.label,
                value: item.id,
              }))}
              panelId="public-library-catalog-panel"
              semantics="tabs"
              value={view}
            />
            <form
              className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                beginCatalogTransition();
                catalogSnapshotRef.current = undefined;
                setPage(1);
                setAppliedQuery(queryInput.normalize("NFKC").trim());
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
                  className="ui-focus-ring min-h-11 w-full rounded-[var(--radius-field)] border border-[var(--color-border)] bg-white/80 pl-11 pr-4 text-sm"
                  onChange={(event) => setQueryInput(event.target.value)}
                  maxLength={120}
                  placeholder={
                    view === "books"
                      ? "按书名、作者或维护者标识检索"
                      : "检索当前视图"
                  }
                  value={queryInput}
                />
              </label>
              <button
                aria-label="检索"
                className="ui-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-primary)] text-sm font-semibold text-white sm:px-5"
                type="submit"
              >
                <Search
                  aria-hidden="true"
                  className="h-[18px] w-[18px] sm:hidden"
                  strokeWidth={1.75}
                />
                <span className="hidden sm:inline">检索</span>
              </button>
            </form>
            {view === "books" && (
              <div
                aria-label="馆藏分类"
                className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:overflow-x-auto sm:pb-1"
                role="group"
              >
                <button
                  aria-pressed={!categoryId}
                  className={`ui-focus-ring min-h-11 rounded-[var(--radius-control)] border px-3 text-xs font-semibold ${
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
                    className={`ui-focus-ring min-h-11 shrink-0 rounded-[var(--radius-control)] border px-3 text-xs font-semibold ${
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
                    className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4"
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
                    className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4"
                    onClick={() => {
                      beginCatalogTransition();
                      setMaintainerId("");
                      setPage(1);
                    }}
                    type="button"
                  >
                    清除维护者标识筛选
                  </button>
                )}
              </div>
            )}
          </section>

          <div
            aria-label={`${views.find((item) => item.id === view)?.label ?? "馆藏"}内容`}
            id="public-library-catalog-panel"
            role="tabpanel"
            tabIndex={0}
          >
          {notice && (
            <StatusNotice className="mt-4" tone={notice.tone}>
              {notice.text}
              </StatusNotice>
            )}
            {state === "loading" ? (
              <StatePanel kind="loading" title="正在整理馆藏" />
            ) : state === "error" ? (
              <StatePanel
                action={
                  <button
                    className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] border border-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-primary)]"
                    onClick={() => {
                      beginCatalogTransition();
                      setReloadNonce((value) => value + 1);
                    }}
                    type="button"
                  >
                    重新载入
                  </button>
                }
                description={`${loadError || "公共馆藏暂时不可用。"} 私人书架与已经加入的正文不受影响。`}
                kind="error"
                title="当前视图未能载入"
              />
            ) : state === "ready" &&
              (view === "books" ? books.length === 0 : facets.length === 0) ? (
              <StatePanel
                action={
                  appliedQuery || categoryId || tagId || maintainerId ? (
                    <button
                      className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] border border-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-primary)]"
                      onClick={() => {
                        beginCatalogTransition();
                        catalogSnapshotRef.current = undefined;
                        setQueryInput("");
                        setAppliedQuery("");
                        setCategoryId("");
                        setTagId("");
                        setMaintainerId("");
                        setPage(1);
                      }}
                      type="button"
                    >
                      清除筛选
                    </button>
                  ) : undefined
                }
                description={
                  appliedQuery || categoryId || tagId || maintainerId
                    ? "可以修改检索词或清除当前筛选。"
                    : "这里暂时还没有可浏览的公共内容。"
                }
                kind="empty"
                title={
                  appliedQuery || categoryId || tagId || maintainerId
                    ? "没有符合当前条件的内容"
                    : view === "books"
                      ? "藏经阁暂无馆藏"
                      : "当前视图暂无内容"
                }
              />
            ) : view === "books" ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {books.map((book) => {
                  const localState = localStates.get(book.id);
                  const isLocal = Boolean(localState?.localBook);
                  const progress = localState?.progress;
                  const hasProgress = progress && progress.percentage > 0;

                  return (
                    <article
                      className="ui-card group flex min-w-0 cursor-pointer flex-col gap-3 rounded-[var(--radius-card)] p-4 transition-all hover:shadow-md"
                      data-public-library-book
                      key={book.id}
                      onClick={(event) => {
                        if (
                          (event.target as HTMLElement).closest(
                            "button, a, input, select",
                          )
                        ) {
                          return;
                        }
                        previewFallbackRef.current = event.currentTarget;
                        setPreviewingBook(book);
                      }}
                    >
                      <div className="flex min-w-0 gap-3.5">
                        <BookCover
                          className="h-24 w-16 shrink-0 transition-transform group-hover:scale-105"
                          compact
                          title={book.title}
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-[var(--color-primary)]">
                              {book.category}
                            </span>
                            {hasProgress ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                <Compass aria-hidden="true" className="h-3 w-3" />
                                第 {progress.chapterIndex + 1} 章 ({Math.round(progress.percentage)}%)
                              </span>
                            ) : isLocal ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                <Check aria-hidden="true" className="h-3 w-3" />
                                已在书架
                              </span>
                            ) : null}
                          </div>
                          <h2 className="mt-1 line-clamp-2 [font-family:var(--font-display)] text-base font-semibold group-hover:text-[var(--color-primary)]">
                            {book.title}
                          </h2>
                          <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
                            {book.author || "佚名"} · {book.chapterCount} 章
                          </p>
                          <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
                            {book.maintainerLabel || "维护来源未标注"}
                            {book.tags?.length
                              ? ` · ${book.tags.map((tag) => tag.label).join(" / ")}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      {/* 卡片底部操作栏 */}
                      <div className="mt-auto flex items-center gap-2 border-t border-[var(--color-border)]/40 pt-2.5">
                        <button
                          className="ui-focus-ring inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border)] px-2 text-xs font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            previewFallbackRef.current = event.currentTarget;
                            setPreviewingBook(book);
                          }}
                          type="button"
                        >
                          <BookOpen aria-hidden="true" className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                          预览目录
                        </button>
                        <button
                          className="ui-focus-ring inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-2 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
                          disabled={Boolean(openingId || joiningId)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openBook(book);
                          }}
                          title={hasProgress ? `继续阅读：第 ${progress.chapterIndex + 1} 章` : "即刻开卷阅读"}
                          type="button"
                        >
                          {openingId === book.id ? (
                            "准备中…"
                          ) : hasProgress ? (
                            <>
                              <Compass aria-hidden="true" className="h-3.5 w-3.5" />
                              继续阅读
                            </>
                          ) : (
                            <>
                              <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
                              即刻开卷
                            </>
                          )}
                        </button>
                        <button
                          aria-label={isLocal ? "已在书架" : "加入书架"}
                          className={`ui-focus-ring inline-flex h-10 items-center justify-center gap-1 rounded-[var(--radius-control)] border px-2.5 text-xs font-medium transition-colors ${
                            isLocal
                              ? "border-emerald-500/30 bg-emerald-50 text-emerald-700"
                              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
                          } disabled:opacity-50`}
                          disabled={isLocal || Boolean(joiningId || openingId)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void joinBookOnly(book);
                          }}
                          title={isLocal ? "已收录至本地书架" : "收录至本地书架"}
                          type="button"
                        >
                          {joiningId === book.id ? (
                            "收录中…"
                          ) : isLocal ? (
                            <>
                              <Check aria-hidden="true" className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">已入书架</span>
                            </>
                          ) : (
                            <>
                              <Download aria-hidden="true" className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">加入书架</span>
                            </>
                          )}
                        </button>
                        {maintenanceAvailable && (
                          <button
                            aria-label={`整理《${book.title}》目录`}
                            className="ui-focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]"
                            onClick={(event) => {
                              event.stopPropagation();
                              editButtonRef.current = event.currentTarget;
                              setEditingBook(book);
                            }}
                            type="button"
                          >
                            <Settings2 aria-hidden="true" className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
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
                  className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] border px-4 text-sm disabled:opacity-40"
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
                  className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] border px-4 text-sm disabled:opacity-40"
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
          </div>
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
          setNotice({
            text: "目录信息已更新，正文包保持不变。",
            tone: "success",
          });
          setBooks((current) =>
            current.map((book) => (book.id === updated.id ? updated : book)),
          );
        }}
      />
      <PublicLibraryBookDetailModal
        book={previewingBook}
        fallbackFocus={previewFallbackRef}
        onClose={() => setPreviewingBook(null)}
        onJoined={(book) => {
          void refreshLocalStates(books);
          setNotice({
            text: `《${book.title}》已收录至本地书架。`,
            tone: "success",
          });
        }}
      />
    </>
  );
}
