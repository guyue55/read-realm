"use client";

import { useState } from "react";
import { createId } from "@reader/shared-types";
import type { ParsedBook } from "@reader/parser-core";
import { db } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { apiUrl } from "@/lib/api";
import { parseUrlBookInBrowser } from "@/lib/url-import";

export default function ImportPage() {
  const [status, setStatus] = useState<string>("等待导入");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeMode, setActiveMode] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");
  // 拖拽激活状态，用于控制拟物压紧与浅绿漫反射呼吸高光
  const [isDragActive, setIsDragActive] = useState(false);
  const router = useRouter();

  const createImportTask = async (
    parsedBook: ParsedBook,
    sourceType: "upload" | "url",
    options: { format: "txt" | "epub" | "html"; sourceUrl?: string },
  ) => {
    if (parsedBook.chapters.length === 0) {
      throw new Error("未解析到章节内容");
    }

    const taskId = createId();
    const now = new Date().toISOString();
    const bookMetadata = {
      id: createId(),
      title: parsedBook.title,
      sourceType,
      sourceUrl: options.sourceUrl,
      format: options.format,
      status: "to_read" as const,
      tags: [],
      chapterCount: parsedBook.chapters.length,
      wordCount: parsedBook.chapters.reduce(
        (total, chapter) => total + chapter.content.length,
        0,
      ),
      createdAt: now,
      updatedAt: now,
    };

    const chaptersToSave = parsedBook.chapters.map((ch, index) => ({
      id: createId(),
      bookId: bookMetadata.id,
      index,
      title: ch.title || `第 ${index + 1} 章`,
      content: ch.content,
      wordCount: ch.content.length,
      createdAt: now,
      updatedAt: now,
    }));

    await db.importTasks.add({
      id: taskId,
      bookMetadata,
      chapters: chaptersToSave,
      createdAt: now,
    });

    router.push(`/import/preview/${taskId}`);
  };

  const handleFile = async (file: File) => {
    if (!file) return;

    setIsProcessing(true);
    try {
      setStatus("加载解析引擎...");
      const { parseTxtBook, parseEpubBook } =
        await import("@reader/parser-core");

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
      const format = (
        file.name.toLowerCase().endsWith(".epub") ? "epub" : "txt"
      ) as "epub" | "txt";
      await createImportTask(parsedBook, "upload", { format });
    } catch (e) {
      const error = e as Error;
      setStatus(`解析失败: ${error.message}`);
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) await handleFile(file);
  };

  // 鼠标拖拽进入区域
  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing) {
      setIsDragActive(true);
    }
  };

  // 鼠标拖拽在区域内悬停
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing && !isDragActive) {
      setIsDragActive(true);
    }
  };

  // 鼠标拖拽离开区域
  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  // 鼠标松开释放文件
  const handleDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !isProcessing) await handleFile(file);
  };

  const parseUrlWithBackendFallback = async (url: string) => {
    try {
      return await parseUrlBookInBrowser(url, setStatus);
    } catch (frontendError) {
      console.warn(
        "Frontend URL parse failed, falling back to backend",
        frontendError,
      );
      setStatus("前端直接解析受限，切换后端兜底...");
      const response = await fetch(apiUrl("/imports/url/parse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        const detail = await response.text();
        let message = detail;
        try {
          const parsed = JSON.parse(detail) as { message?: string | string[] };
          message = Array.isArray(parsed.message)
            ? parsed.message.join("，")
            : parsed.message || detail;
        } catch {
          message = detail;
        }
        throw new Error(message || `后端解析失败：HTTP ${response.status}`);
      }
      return (await response.json()) as ParsedBook;
    }
  };

  const handleUrlImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!urlInput.trim() || isProcessing) return;

    let url: string;
    try {
      url = new URL(urlInput.trim()).toString();
    } catch {
      setStatus("请输入完整的 http(s) 链接");
      return;
    }

    setIsProcessing(true);
    try {
      setStatus("开始解析 URL...");
      const parsedBook = await parseUrlWithBackendFallback(url);
      setStatus(`解析完成，共发现 ${parsedBook.chapters.length} 章`);
      await createImportTask(parsedBook, "url", {
        format: "html",
        sourceUrl: url,
      });
    } catch (e) {
      const error = e as Error;
      setStatus(`URL 解析失败: ${error.message}`);
      setIsProcessing(false);
    }
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
            <button
              type="button"
              onClick={() => setActiveMode("file")}
              className={`rounded-full px-4 py-1.5 font-semibold transition-all duration-300 physics-spring hover:scale-[1.03] active:scale-[0.97] ${
                activeMode === "file"
                  ? "bg-[var(--ui-accent)] text-white shadow-sm"
                  : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              本地文件
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("url")}
              className={`rounded-full px-4 py-1.5 font-semibold transition-all duration-300 physics-spring hover:scale-[1.03] active:scale-[0.97] ${
                activeMode === "url"
                  ? "bg-[var(--ui-accent)] text-white shadow-sm"
                  : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              URL 解析
            </button>
          </div>

          {activeMode === "file" ? (
            <label
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`group ui-focus-ring relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed p-8 text-center transition-all duration-300 physics-spring ${
                isDragActive
                  ? "border-[var(--ui-accent)] bg-[rgba(95,125,82,0.06)] scale-[0.98] shadow-[0_8px_30px_rgba(95,125,82,0.08)]"
                  : "border-[rgba(95,125,82,0.28)] bg-[rgba(255,255,255,0.48)] hover:border-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)]"
              }`}
            >
              <div className="pointer-events-none flex flex-col items-center justify-center">
                {/* 精装仿真感图标：Hover 时轻微顺时针偏角和放大 */}
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] border border-[rgba(95,125,82,0.18)] bg-white text-[var(--ui-accent)] shadow-sm physics-spring group-hover:scale-[1.1] group-hover:rotate-[-3deg]">
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
                  {isDragActive ? "松开鼠标即可解析并导入书籍" : "拖拽文件到此处，或点击选择文件"}
                </h2>
                <p className="mt-2 text-sm text-[var(--ui-muted)]">
                  支持 TXT、EPUB 格式，解析后先进入章节预览页
                </p>

                {/* “选择文件”拟物按钮，支持物理拉伸与群组联动 hover 色变 */}
                <div className="mt-6 inline-flex rounded-full bg-[var(--ui-accent)] px-6 py-2 text-sm font-semibold text-white shadow-sm physics-spring group-hover:scale-[1.05] group-hover:bg-[#527047]">
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
              </div>

              <input
                type="file"
                accept=".txt,.epub"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </label>
          ) : (
            <form
              onSubmit={handleUrlImport}
              className="flex min-h-[280px] flex-col justify-center rounded-[16px] border border-[rgba(95,125,82,0.18)] bg-[rgba(255,255,255,0.52)] p-5 md:p-8"
            >
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] border border-[rgba(95,125,82,0.18)] bg-white text-[var(--ui-accent)] shadow-sm">
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
                  <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.9 5.03" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.1a5 5 0 0 0 7.07 7.08l1.22-1.22" />
                </svg>
              </div>
              <h2 className="text-center text-xl font-bold text-[var(--ui-text)]">
                粘贴小说目录页或章节页链接
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-6 text-[var(--ui-muted)]">
                优先在前端直接解析；遇到
                CORS、反爬提示或动态页面时自动切到后端兜底。章节内的“下一页”会合并为同一章。
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.currentTarget.value)}
                  placeholder="https://example.com/book/123/"
                  disabled={isProcessing}
                  // 输入框 Focus 时，应用 physics-spring 伴随微幅拉宽，并散发浅绿漫反射光圈，与搜索页视觉风格一脉相承
                  className="ui-focus-ring min-h-12 flex-1 rounded-full border border-[var(--ui-border)] bg-white px-5 text-[var(--ui-text)] shadow-sm disabled:opacity-60 physics-spring focus:scale-[1.015] focus:shadow-[0_15px_35px_rgba(95,125,82,0.12)] focus:border-[var(--ui-accent)]"
                />
                <button
                  type="submit"
                  disabled={isProcessing || !urlInput.trim()}
                  // 解析按钮：hover 微放大，active 微缩拢
                  className="ui-focus-ring min-h-12 rounded-full bg-[var(--ui-accent)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#527047] disabled:cursor-not-allowed disabled:bg-[rgba(80,65,45,0.2)] physics-spring hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isProcessing ? "解析中" : "解析 URL"}
                </button>
              </div>

              {isProcessing && (
                <div className="mt-6 flex items-center justify-center gap-2 font-semibold text-[var(--ui-warm)]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(154,106,58,0.18)] border-t-[var(--ui-warm)]" />
                  {status}
                </div>
              )}
              {!isProcessing && status !== "等待导入" && (
                <p className="mt-4 text-center text-sm font-medium text-[var(--ui-danger)]">
                  {status}
                </p>
              )}
            </form>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="ui-card rounded-[16px] p-5">
            <h2 className="text-base font-bold text-[var(--ui-text)]">
              导入说明
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--ui-muted)]">
              <li>TXT 会根据章节标题自动拆分。</li>
              <li>EPUB 会读取目录与正文结构。</li>
              <li>URL 目录页会尝试批量识别章节链接。</li>
              <li>单章多分页会按“下一页”合并，避免误跳到下一章。</li>
              <li>确认前不会写入正式书架。</li>
            </ul>
          </div>

          <div className="ui-soft-card rounded-[16px] p-5">
            <div>
              <h2 className="mb-1 text-base font-bold text-[var(--ui-text)]">
                URL 稳定性说明
              </h2>
              <p className="text-sm leading-6 text-[var(--ui-muted)]">
                浏览器能直接访问的站点会本地解析；遇到跨域限制则走后端代理。验证码、登录墙、纯动态渲染页面会给出明确失败提示。
              </p>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
