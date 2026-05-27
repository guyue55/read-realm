"use client";

import { useState } from "react";
import { createId } from "@reader/shared-types";
import { db } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";

export default function ImportPage() {
  const [status, setStatus] = useState<string>("等待导入");
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  const handleFile = async (file: File) => {
    if (!file) return;

    setIsProcessing(true);
    try {
      setStatus("加载解析引擎...");
      const { parseTxtBook, parseEpubBook } = await import("@reader/parser-core");

      setStatus("读取文件内容...");
      const buffer = await file.arrayBuffer();

      setStatus("解析章节中...");
      let parsedBook;
      if (file.name.toLowerCase().endsWith(".epub")) {
        parsedBook = await parseEpubBook(file.name, buffer);
      } else {
        parsedBook = parseTxtBook(file.name, buffer);
      }

      setStatus(`解析完成，共发现 ${parsedBook.chapters.length} 章`);

      const taskId = createId();
      const format = (file.name.toLowerCase().endsWith(".epub") ? "epub" : "txt") as "epub" | "txt";
      
      const bookMetadata = {
        id: createId(),
        title: parsedBook.title,
        sourceType: "upload" as const,
        format,
        status: "to_read" as const,
        tags: [],
        chapterCount: parsedBook.chapters.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const chaptersToSave = parsedBook.chapters.map((ch, index) => ({
        id: createId(),
        bookId: bookMetadata.id,
        index,
        title: ch.title,
        content: ch.content,
        wordCount: ch.content.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      await db.importTasks.add({
        id: taskId,
        bookMetadata,
        chapters: chaptersToSave,
        createdAt: new Date().toISOString()
      });

      router.push(`/import/preview/${taskId}`);
    } catch (e) {
      const error = e as Error;
      setStatus(`解析失败: ${error.message}`);
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await handleFile(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && !isProcessing) await handleFile(file);
  };

  return (
    <AppShell
        title="导入书籍"
        subtitle="本地文件、链接解析与内容治理"
        rightNodes={
          <button
            onClick={() => router.push("/library")}
            className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
          >
            返回书架
          </button>
        }
      >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="ui-card rounded-[18px] p-4 md:p-6">
          <div className="mb-5 inline-flex rounded-full border border-[var(--ui-border)] bg-white/64 p-1 text-sm">
            <button className="rounded-full bg-[var(--ui-accent)] px-4 py-1.5 font-semibold text-white">
              本地文件
            </button>
            <button className="rounded-full px-4 py-1.5 font-semibold text-[var(--ui-muted)]">
              URL 解析
            </button>
          </div>

          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="ui-focus-ring relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[rgba(95,125,82,0.28)] bg-[rgba(255,255,255,0.48)] p-8 text-center transition-colors hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)]"
          >
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] border border-[rgba(95,125,82,0.18)] bg-white text-[var(--ui-accent)] shadow-sm">
              <svg
                aria-hidden="true"
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                <path d="M14 3v5h5" />
                <path d="M12 17V10" />
                <path d="m9 13 3-3 3 3" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[var(--ui-text)]">
              拖拽文件到此处，或点击选择文件
            </h2>
            <p className="mt-2 text-sm text-[var(--ui-muted)]">
              支持 TXT、EPUB 格式，解析后先进入章节预览页
            </p>
            
            <input
              type="file"
              accept=".txt,.epub"
              onChange={handleFileUpload}
              disabled={isProcessing}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            
            <div className="mt-6 inline-flex rounded-full bg-[var(--ui-accent)] px-6 py-2 text-sm font-semibold text-white shadow-sm">
              选择文件
            </div>
            
            {isProcessing && (
              <div className="mt-6 flex items-center justify-center gap-2 font-semibold text-[var(--ui-warm)]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(154,106,58,0.18)] border-t-[var(--ui-warm)]" />
                {status}
              </div>
            )}
            {!isProcessing && status !== "等待导入" && (
              <p className="mt-4 text-sm font-medium text-[var(--ui-danger)]">
                {status}
              </p>
            )}
          </label>
        </section>
          
        <aside className="flex flex-col gap-4">
          <div className="ui-card rounded-[16px] p-5">
            <h2 className="text-base font-bold text-[var(--ui-text)]">导入说明</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--ui-muted)]">
              <li>TXT 会根据章节标题自动拆分。</li>
              <li>EPUB 会读取目录与正文结构。</li>
              <li>确认前不会写入正式书架。</li>
            </ul>
          </div>

          <div className="ui-soft-card rounded-[16px] p-5">
            <div>
              <h2 className="mb-1 text-base font-bold text-[var(--ui-text)]">
                粘贴链接
              </h2>
              <p className="text-sm leading-6 text-[var(--ui-muted)]">
                URL 解析入口会保留在默认主题中，后续可接后端解析队列。
              </p>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
