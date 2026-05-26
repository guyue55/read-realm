import React from "react";
import type { Book } from "@reader/shared-types";
import { strings } from "@/lib/i18n";

export interface BookCardProps {
  book: Book;
  onRead: (id: string) => void;
  onDelete?: (id: string, title: string) => void;
}

export function BookCard({ book, onRead, onDelete }: BookCardProps) {
  return (
    <div className="bg-white p-6 rounded-[16px] shadow-sm border border-[rgba(80,65,45,0.12)] flex flex-col justify-between hover:shadow-md transition-shadow">
      <div>
        <h3 className="font-bold text-lg mb-2 line-clamp-2 text-[#2F2A24]">
          {book.title}
        </h3>
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
        {onDelete && (
          <button
            onClick={() => onDelete(book.id, book.title)}
            className="px-3 py-2 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors"
            title={strings.shelf.delete}
          >
            {strings.shelf.delete}
          </button>
        )}
      </div>
    </div>
  );
}
