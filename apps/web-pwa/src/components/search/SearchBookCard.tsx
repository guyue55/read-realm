import React from "react";
import type { Book } from "@reader/shared-types";
import { BookCover } from "@/components/BookCover";
import { strings } from "@/lib/i18n";

export interface SearchBookCardProps {
  /** 书籍元数据（本地书架命中与私人云端结果共用同一 Book 结构） */
  book: Book;
  /** 卡片来源：本地命中卡 / 私人云端结果卡 */
  variant?: "local" | "cloud";
  /** 云端书籍是否已在本地书架（展示"去阅读"而非"拉取入库"） */
  isLocal?: boolean;
  /** 云端书籍是否正在下载同步 */
  isImporting?: boolean;
  /** 下载同步进度百分比 */
  importPercent?: number;
  /** 点击"去阅读"回调 */
  onRead: (id: string) => void;
  /** 点击"拉取入库"回调（仅云端卡且未在本地时展示） */
  onImport?: (book: Book) => void;
}

/**
 * 搜索页统一书卡：本地书架命中与私人云端结果共用同一视觉语言，
 * 与书架（藏经阁）卡片风格通过 --ui-* / --color-* 令牌保持一致。
 * 颜色与圆角均取自语义令牌；卡片外层的柔和暖色投影（0 10px 30px）为
 * 刻意保留的专属设计签名，暂无对应令牌，故保留字面量。
 */
export function SearchBookCard({
  book,
  variant = "local",
  isLocal = false,
  isImporting = false,
  importPercent = 0,
  onRead,
  onImport,
}: SearchBookCardProps) {
  // 三态按钮：已入库（或本地卡）→ 去阅读；同步中 → 进度；未入库 → 拉取入库
  const showRead = variant === "local" || isLocal;
  const showImporting = variant === "cloud" && !isLocal && isImporting;
  const showImport = variant === "cloud" && !isLocal && !isImporting;
  const chapterLabel = strings.reader.chapterCount.replace(
    "{count}",
    book.chapterCount?.toString() ?? "0",
  );

  return (
    <div
      data-book-id={book.id}
      className="ui-card flex flex-col items-stretch gap-4 rounded-[var(--radius-card)] border border-white/60 bg-gradient-to-br from-white/70 to-white/40 p-4 shadow-[0_10px_30px_rgba(80,65,45,0.03)] sm:flex-row sm:items-center"
    >
      <BookCover title={book.title} className="h-[108px] w-[72px]" compact />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-[var(--ui-text)] font-reading-title">
              {book.title}
            </h3>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              {book.author || "佚名"} · {book.format.toUpperCase()}
            </p>
          </div>
          {variant === "cloud" && (
            <span className="text-xs font-semibold text-[var(--ui-muted)]">
              私人云端
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md bg-[var(--ui-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ui-accent)]">
            {variant === "cloud" ? "全本同步" : book.format.toUpperCase()}
          </span>
          <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-[var(--ui-muted)]">
            {chapterLabel}
          </span>
        </div>
      </div>

      {/* 云端一键同步批量拉取入库控制钮 */}
      <div className="w-full shrink-0 sm:w-auto">
        {showRead ? (
          <button
            type="button"
            onClick={() => onRead(book.id)}
            className="ui-focus-ring min-h-11 w-full rounded-full border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-4 py-2 text-xs font-bold text-[var(--ui-accent)] shadow-sm transition-colors hover:bg-[var(--ui-accent)] hover:text-white sm:w-auto"
          >
            去阅读
          </button>
        ) : showImporting ? (
          <div
            role="status"
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[var(--color-primary)]/25 bg-[var(--color-primary-soft)]/70 px-4 py-2 text-xs font-bold text-[var(--ui-accent)] select-none sm:w-auto"
          >
            <svg
              className="animate-spin h-3.5 w-3.5 text-[var(--ui-accent)]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>正在同步 {importPercent}%</span>
          </div>
        ) : showImport ? (
          <button
            type="button"
            onClick={() => onImport?.(book)}
            className="ui-focus-ring min-h-11 w-full rounded-full border border-[var(--ui-border)] bg-white px-4 py-2 text-xs font-bold text-[var(--ui-text)] shadow-sm transition-colors hover:border-[var(--ui-accent)] hover:bg-white hover:text-[var(--ui-accent)] sm:w-auto"
          >
            拉取入库
          </button>
        ) : null}
      </div>
    </div>
  );
}
