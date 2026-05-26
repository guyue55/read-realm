"use client";

import { useEffect, useState } from "react";
import { db, type ImportTask } from "@reader/storage-core";
import { useRouter } from "next/navigation";
import { QualityBadge, analyzeChapterQuality } from "@/components/QualityBadge";
import { AppHeader } from "@/components/AppHeader";

export default function PreviewPage({ params }: { params: { taskId: string } }) {
  const [task, setTask] = useState<ImportTask | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    db.importTasks.get(params.taskId).then((t) => {
      if (t) setTask(t);
      else setError("任务未找到或已过期");
    });
  }, [params.taskId]);

  const handleConfirm = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await db.transaction("rw", [db.books, db.chapters, db.importTasks], async () => {
        await db.books.add(task.bookMetadata);
        await db.chapters.bulkAdd(task.chapters);
        await db.importTasks.delete(task.id);
      });
      router.push("/library");
    } catch (e) {
      setError(`保存失败: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!task) return;
    if (!confirm("确定放弃此次导入吗？")) return;
    await db.importTasks.delete(task.id);
    router.push("/import");
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F8F8F5] text-[#2F2A24]">
        <div className="bg-[#FFF0EC] border border-[#DCA79A] p-8 rounded-[16px] text-center max-w-md">
          <h2 className="text-xl font-bold mb-2">解析失败</h2>
          <p className="text-[#6F665B] mb-6">{error}</p>
          <button onClick={() => router.push("/import")} className="px-6 py-2 bg-[#678055] text-white rounded-full font-semibold">返回导入页</button>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 bg-[#F8F8F5]">
        <div className="animate-spin text-[#678055] text-2xl">↻</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F5] flex flex-col">
      <AppHeader
        title="解析预览"
        onBack={handleDiscard}
        rightNodes={
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="rounded-full border border-[#CDD8C5] bg-[#678055] text-white px-4 md:px-6 py-1.5 md:py-2 text-sm font-semibold hover:bg-[#526047] disabled:opacity-50 shadow-sm"
          >
            {saving ? "保存中..." : "加入书架"}
          </button>
        }
      />
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col items-center">
        <div className="w-full max-w-3xl flex justify-between items-center mb-6 mt-2">
          <p className="text-[#6F665B] text-sm">
            共 {task.chapters.length} 章 · 质量检测：<span className="text-[#678055] font-semibold">通过</span>
          </p>
        </div>

        <div className="w-full max-w-3xl bg-[#FFFDF8] border border-[#DED6C8] rounded-[16px] shadow-sm overflow-hidden">
          <div className="p-6 border-b border-[#DED6C8] bg-white flex gap-6 items-center">
            <div className="w-16 h-24 bg-[#1E1E1E] rounded-[6px] shadow-sm flex items-center justify-center text-white text-xs font-bold px-2 text-center break-words">
              {task.bookMetadata.title}
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2 text-[#2F2A24]">{task.bookMetadata.title}</h2>
              <p className="text-[#6F665B] text-sm">来源：{task.bookMetadata.format.toUpperCase()} 上传</p>
            </div>
          </div>
          
          <div className="p-2 max-h-[500px] overflow-y-auto">
            {task.chapters.map((ch) => {
              const quality = analyzeChapterQuality(ch.content, ch.title);
              return (
                <div key={ch.index} className="flex items-center justify-between p-3 hover:bg-[#F4ECD8] rounded-lg transition-colors border-b border-[#F8F8F5] last:border-0">
                  <div className="flex items-center gap-4 flex-1">
                    <span className="text-[#9A6A3A] font-mono text-xs w-8 text-right shrink-0">{ch.index + 1}</span>
                    <span className="text-sm font-medium truncate mr-2 text-[#2F2A24]">{ch.title}</span>
                    {quality && (
                      <span className="shrink-0">
                        <QualityBadge issueType={quality.issueType} severity={quality.severity} />
                      </span>
                    )}
                  </div>
                  <span className="text-[#6F665B] text-xs shrink-0">{ch.content.length} 字</span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
