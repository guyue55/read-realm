"use client";

import { useEffect, useState } from "react";
import { ReaderDefault } from "./ReaderDefault";

export default function ReaderPageSwitch({
  params,
}: {
  params: { bookId: string };
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace(`/#${window.location.pathname}${window.location.search}`);
      return;
    }
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

  return <ReaderDefault bookId={params.bookId} />;
}
