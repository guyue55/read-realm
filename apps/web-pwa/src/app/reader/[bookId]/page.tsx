"use client";

import { useEffect, useState } from "react";
import { loadReaderSettings } from "@/lib/reader-settings";
import { ReaderSimple } from "./ReaderSimple";
import { ReaderDefault } from "./ReaderDefault";

export default function ReaderPageSwitch({
  params,
}: {
  params: { bookId: string };
}) {
  const [uiMode, setUiMode] = useState<"default" | "simple">("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUiMode(loadReaderSettings().uiMode || "default");
    setMounted(true);
  }, []);

  // Prevent hydration mismatch with a beautiful self-adaptive Chinese-ink skeleton loader
  if (!mounted) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center transition-colors duration-300 bg-[#F4EFE6] text-[#2C2621] dark:bg-[#151516] dark:text-[#A3A3AC]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin text-[#678055] text-4xl font-light">↻</div>
          <div className="text-xs font-medium tracking-widest text-[#6F665B] dark:text-[#8F8F8F] animate-pulse">
            正在载入书卷...
          </div>
        </div>
      </div>
    );
  }

  if (uiMode === "simple") {
    return <ReaderSimple bookId={params.bookId} />;
  }

  return <ReaderDefault bookId={params.bookId} />;
}
