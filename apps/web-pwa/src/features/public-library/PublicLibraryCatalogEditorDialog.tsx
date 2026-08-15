"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  PUBLIC_LIBRARY_CATEGORIES,
  PUBLIC_LIBRARY_TAGS,
  type PublicLibraryCategoryId,
  type PublicLibraryTagId,
} from "@reader/shared-types";
import { ReaderDialogSurface } from "@/components/reader/ReaderDialogSurface";
import { normalizeShareToken } from "@/lib/api";
import type { PublicLibraryBook } from "./public-library-client";
import {
  PublicLibraryMaintenanceClient,
  PublicLibraryMaintenanceError,
} from "./public-library-maintenance-client";

export function PublicLibraryCatalogEditorDialog({
  book,
  fallbackFocus,
  onClose,
  onSaved,
}: {
  book: PublicLibraryBook | null;
  fallbackFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSaved: (book: PublicLibraryBook) => void;
}) {
  const [categoryId, setCategoryId] =
    useState<PublicLibraryCategoryId>("other");
  const [tagIds, setTagIds] = useState<PublicLibraryTagId[]>([]);
  const [collectionPath, setCollectionPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!book) return;
    setCategoryId(book.categoryId ?? "other");
    setTagIds(book.tags?.map((tag) => tag.id) ?? []);
    setCollectionPath(book.collectionPath ?? "");
    setMessage("");
  }, [book]);

  if (typeof document === "undefined") return null;

  const toggleTag = (tagId: PublicLibraryTagId) => {
    setTagIds((current) => {
      if (current.includes(tagId)) return current.filter((id) => id !== tagId);
      if (current.length >= 5) {
        setMessage("首版每本最多选择 5 个固定标签。");
        return current;
      }
      return [...current, tagId];
    });
  };

  const save = async () => {
    if (!book || saving) return;
    const key = normalizeShareToken(
      window.localStorage.getItem("reader-share-token"),
    );
    if (!key) {
      setMessage("请先在书架设置私有云密钥。");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const updated = await new PublicLibraryMaintenanceClient(
        key,
      ).updateCatalog(book.id, {
        metadataVersion: book.metadataVersion ?? 1,
        categoryId,
        tagIds,
        collectionPath: collectionPath.trim(),
      });
      onSaved(updated);
    } catch (error) {
      setMessage(
        error instanceof PublicLibraryMaintenanceError &&
          error.code === "catalog_metadata_stale"
          ? "这本书的目录信息刚被修改，请重新载入后再编辑。"
          : "目录信息未能保存，正文与既有目录均未改变。",
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <ReaderDialogSurface
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#2c2621]/40 backdrop-blur-sm sm:items-center sm:p-5"
      fallbackFocus={() => fallbackFocus.current}
      label="整理馆藏目录"
      onClose={() => {
        if (!saving) onClose();
      }}
      open={Boolean(book)}
    >
      <section className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:rounded-[28px]">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--color-primary)]">
              目录覆盖层
            </p>
            <h2 className="mt-1 truncate [font-family:var(--font-display)] text-xl font-semibold">
              {book?.title ?? "整理馆藏"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
              只调整分类、标签和阁内路径，不会重写正文包。
            </p>
          </div>
          <button
            aria-label="关闭目录编辑"
            className="ui-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <label className="text-sm font-semibold" htmlFor="catalog-category">
            固定分类
          </label>
          <select
            className="ui-focus-ring mt-2 min-h-11 w-full rounded-2xl border border-[var(--color-border)] bg-white/80 px-4 text-sm"
            id="catalog-category"
            onChange={(event) =>
              setCategoryId(event.target.value as PublicLibraryCategoryId)
            }
            value={categoryId}
          >
            {PUBLIC_LIBRARY_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">
              固定标签（最多 5 个）
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PUBLIC_LIBRARY_TAGS.map((tag) => (
                <label
                  className="ui-focus-ring flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white/70 px-3 text-sm"
                  key={tag.id}
                >
                  <input
                    checked={tagIds.includes(tag.id)}
                    className="h-5 w-5 accent-[var(--color-primary)]"
                    onChange={() => toggleTag(tag.id)}
                    type="checkbox"
                  />
                  {tag.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label
            className="mt-5 block text-sm font-semibold"
            htmlFor="catalog-path"
          >
            阁内路径
          </label>
          <input
            className="ui-focus-ring mt-2 min-h-11 w-full rounded-2xl border border-[var(--color-border)] bg-white/80 px-4 text-sm"
            id="catalog-path"
            maxLength={1024}
            onChange={(event) => setCollectionPath(event.target.value)}
            placeholder="例如：古籍/经部（可留空）"
            value={collectionPath}
          />
          {message && (
            <p
              className="mt-4 rounded-2xl border border-[var(--color-border)] bg-white/75 p-3 text-sm"
              role="alert"
            >
              {message}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t border-[var(--color-border)] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">
          <button
            className="ui-focus-ring min-h-11 min-w-11 rounded-full border border-[var(--color-border)] px-5 text-sm font-semibold"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="ui-focus-ring min-h-11 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white disabled:opacity-40"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "正在保存…" : "保存目录"}
          </button>
        </footer>
      </section>
    </ReaderDialogSurface>,
    document.body,
  );
}
