import React from "react";
import type { Book } from "@reader/shared-types";
import { strings } from "@/lib/i18n";

export interface BookCardProps {
  book: Book;
  onRead: (id: string) => void;
  onDelete?: (id: string, title: string) => void;
  hasChaptersLocal?: boolean;
  isCloudOnly?: boolean;
  isSynced?: boolean;
  onSpaceOffload?: (book: Book) => void;
}

export function BookCard({
  book,
  onRead,
  onDelete,
  hasChaptersLocal,
  onSpaceOffload,
}: BookCardProps) {
  return (
    <div className="bg-white p-6 rounded-[20px] shadow-[0_4px_16px_rgba(80,65,45,0.06)] border border-[rgba(80,65,45,0.08)] flex flex-col justify-between hover:shadow-[0_8px_24px_rgba(80,65,45,0.12)] transition-shadow">
      <div>
        <div className="flex justify-between items-start gap-2 mb-2">
          <h3 className="font-bold text-lg line-clamp-2 text-[#2F2A24]">
            {book.title}
          </h3>
          {hasChaptersLocal !== undefined && (
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full border shrink-0 font-medium ${
                hasChaptersLocal
                  ? "bg-[#F1F6F0] text-[#4C664B] border-[#DCE8DB]"
                  : "bg-[#EBF3F6] text-[#4E7A94] border-[#D1E4EC]"
              }`}
            >
              {hasChaptersLocal ? "🌾 松墨离线" : "☁️ 密阁天青"}
            </span>
          )}
        </div>
        <div className="flex gap-2 mb-4">
          <span className="text-xs px-2 py-0.5 bg-[#E8E3DA] rounded uppercase text-[#6F665B]">
            {book.format}
          </span>
          <span className="text-xs text-[#6F665B]">
            {strings.reader.chapterCount.replace(
              "{count}",
              book.chapterCount?.toString() || "0",
            )}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onRead(book.id)}
          className="flex-1 bg-[#DDEBD6] text-[#2F2A24] py-2 rounded-full font-semibold hover:bg-[#CFE2C5] transition-colors"
        >
          {strings.shelf.read}
        </button>
        {hasChaptersLocal && onSpaceOffload && (
          <button
            onClick={() => onSpaceOffload(book)}
            className="px-3 py-2 bg-[#EBF3F6] text-[#4E7A94] rounded-full hover:bg-[#DCEBF0] transition-colors text-xs font-semibold"
            title="释放本地章节正文，按需懒加载"
          >
            释放
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(book.id, book.title)}
            className="px-3 py-2 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors text-xs font-semibold"
            title={strings.shelf.delete}
          >
            {strings.shelf.delete}
          </button>
        )}
      </div>
    </div>
  );
}

