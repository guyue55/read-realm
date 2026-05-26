"use client";

import { useState } from "react";
import { createId } from "@reader/shared-types";
import { db } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";

export default function ImportPage() {
  const [status, setStatus] = useState<string>("等待导入");
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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

  return (
    <div className="min-h-screen bg-[#F8F8F5] flex flex-col">
      <AppHeader
        title="导入书籍"
        onBack={() => router.push("/library")}
      />
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col items-center mt-4">
        <div className="w-full max-w-2xl flex flex-col gap-6">
          <div className="border-2 border-dashed border-[#DED6C8] rounded-[16px] bg-[#FFFDF8] p-12 text-center shadow-sm relative hover:border-[#678055] transition-colors">
            <div className="w-16 h-16 bg-[#EEF2E9] border border-[#CDD8C5] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-[#678055] font-bold">↑</span>
            </div>
            <h2 className="text-xl font-bold mb-2 text-[#2F2A24]">本地上传</h2>
            <p className="text-[#6F665B] mb-6 text-sm">TXT / EPUB / HTML / MD</p>
            
            <input
              type="file"
              accept=".txt,.epub"
              onChange={handleFileUpload}
              disabled={isProcessing}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            
            <div className="px-6 py-2 bg-[#678055] text-white rounded-full font-semibold mx-auto inline-block shadow-sm">
              选择文件
            </div>
            
            {isProcessing && (
              <div className="mt-6 text-[#9A6A3A] font-semibold flex items-center justify-center gap-2">
                <span className="animate-spin text-xl">↻</span>
                {status}
              </div>
            )}
            {!isProcessing && status !== "等待导入" && (
              <p className="mt-4 text-[#DCA79A] text-sm font-medium">{status}</p>
            )}
          </div>
          
          <div className="border border-[rgba(80,65,45,0.12)] rounded-[16px] bg-[#FFFDF8] p-8 flex items-center justify-between shadow-sm opacity-50">
            <div>
              <h2 className="text-lg font-bold mb-1 text-[#2F2A24]">粘贴链接</h2>
              <p className="text-[#6F665B] text-sm">前端尝试 + 后端兜底（即将支持）</p>
            </div>
            <div className="w-12 h-12 bg-[#E8E3DA] rounded-full flex items-center justify-center text-xl text-[#6F665B]">
              🔗
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
