"use client";

import type { Book } from "@reader/shared-types";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ReaderDialogSurface } from "@/components/reader/ReaderDialogSurface";
import { useDocumentModalIsolation } from "@/components/reader/useDocumentModalIsolation";
import { PublicLibraryMaintenanceError } from "@/features/public-library/public-library-maintenance-client";
import { PersonalBookExportError } from "./personal-book-export";
import { createPersonalBookPublicationService } from "./personal-book-publication";

const CONFIRMATION =
  "将创建公共明文副本，本实例访客可读取；私人原书、进度与笔记不会公开或改动。";

function describeFailure(error: unknown) {
  if (error instanceof PersonalBookExportError) {
    switch (error.code) {
      case "private_share_token_required":
        return "需要先在同步设置绑定私有云密钥。";
      case "remote_book_not_found":
        return "私人云端没有这本书；本地正文不能替代云端存在性证明。";
      case "remote_snapshot_changed":
        return "核验期间私人云正文发生变化，未发布；请重新核验。";
      case "remote_hash_mismatch":
      case "remote_snapshot_invalid":
        return "私人云正文不完整、缺章或哈希不一致，未发布。";
      case "publication_too_large":
        return "这本书的正文超过当前 20 MiB 入阁上限。";
      default:
        return "私人云暂时不可用，未修改本地书籍，请稍后重试。";
    }
  }
  if (error instanceof PublicLibraryMaintenanceError) {
    if (error.code === "credential_rejected") {
      return "已绑定私有云，但当前密钥没有此实例的发布权限。";
    }
    if (error.code === "duplicate_metadata_conflict") {
      return "相同正文已在阁中，但书目信息不同；请稍后从目录维护调整。";
    }
    return "藏经阁暂时不可用，私人原书没有改动，请重试。";
  }
  return "发布未完成，私人原书没有改动，请重试。";
}

export function PersonalBookPublicationDialog({
  open,
  book,
  credential,
  onClose,
  fallbackFocus,
}: {
  open: boolean;
  book: Book;
  credential: string;
  onClose: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const [state, setState] = useState<
    "confirm" | "working" | "created" | "unchanged" | "failed"
  >("confirm");
  const [message, setMessage] = useState(CONFIRMATION);
  const operationRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    operationRef.current += 1;
    setState("confirm");
    setMessage(CONFIRMATION);
  }, [open, book.id]);
  useDocumentModalIsolation(open, '[data-personal-publication-dialog="true"]');

  if (!open || typeof document === "undefined") return null;

  const close = () => {
    if (state === "working") return;
    onClose();
  };

  const publish = async () => {
    if (state === "working") return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setState("working");
    setMessage("正在核验私人云端完整正文与章节哈希…");
    try {
      const result = await createPersonalBookPublicationService(
        credential,
      ).publish(book.id);
      if (operationRef.current !== operation) return;
      if (result.outcome === "created") {
        setState("created");
        setMessage("公共明文副本已入阁");
      } else {
        setState("unchanged");
        setMessage("已在阁中");
      }
    } catch (error) {
      if (operationRef.current !== operation) return;
      setState("failed");
      setMessage(describeFailure(error));
    }
  };

  return createPortal(
    <ReaderDialogSurface
      open={open}
      label={`发布「${book.title}」到藏经阁`}
      onClose={close}
      fallbackFocus={fallbackFocus}
      className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-[#2C2621]/45 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      data-personal-publication-dialog="true"
      onClick={close}
    >
      <section
        className="reader-focus-ring relative my-auto max-h-[min(88dvh,720px)] w-full max-w-lg overflow-y-auto rounded-[24px] border border-[#DFD1BF] bg-[#FAF6EE] p-5 text-[#2F2A24] shadow-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-3 rounded-[18px] border border-[#E9DCC8]/60" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#8C6239]">
              私人云端 → 公共藏经阁
            </p>
            <h2 className="mt-2 truncate font-reading-title text-xl font-bold">
              {book.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={state === "working"}
            className="reader-focus-ring flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-[#E4D7C2] bg-white/75 text-lg text-[#6F665B] disabled:opacity-40"
            aria-label="关闭发布确认"
          >
            ×
          </button>
        </div>

        <div className="relative mt-5 rounded-[18px] border border-[#E9DCC8] bg-white/70 p-4">
          <p
            role={state === "failed" ? "alert" : "status"}
            className={`text-sm leading-7 ${
              state === "failed" ? "text-[#A64B4B]" : "text-[#5C5446]"
            }`}
          >
            {message}
          </p>
          <p className="mt-3 text-xs leading-6 text-[#8B8177]">
            发布端只读取同一私有云密钥下已完整核验的 TXT
            正文；不会上传进度、笔记、书签或本地文件路径。
          </p>
        </div>

        <div className="relative mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={state === "working"}
            className="reader-focus-ring min-h-[44px] rounded-full border border-[#DED2C1] bg-white/75 px-5 text-sm font-semibold text-[#6F665B] disabled:opacity-40"
          >
            {state === "created" || state === "unchanged" ? "完成" : "暂不发布"}
          </button>
          {state !== "created" && state !== "unchanged" && (
            <button
              type="button"
              onClick={() => void publish()}
              disabled={state === "working"}
              className="reader-focus-ring min-h-[44px] rounded-full bg-[#5F7D52] px-6 text-sm font-bold text-white shadow-[0_8px_20px_rgba(95,125,82,0.2)] disabled:cursor-wait disabled:opacity-60"
            >
              {state === "working"
                ? "核验并入阁中…"
                : state === "failed"
                  ? "重新核验"
                  : "确认公开入阁"}
            </button>
          )}
        </div>
      </section>
    </ReaderDialogSurface>,
    document.body,
  );
}
