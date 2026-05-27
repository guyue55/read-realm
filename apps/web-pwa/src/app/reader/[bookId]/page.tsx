"use client";

import { useEffect, useState } from "react";
import { loadReaderSettings } from "@/lib/reader-settings";
import { ReaderSimple } from "./ReaderSimple";
import { ReaderDefault } from "./ReaderDefault";

export default function ReaderPageSwitch({ params }: { params: { bookId: string } }) {
  const [uiMode, setUiMode] = useState<"default" | "simple">("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUiMode(loadReaderSettings().uiMode || "default");
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) return null;

  if (uiMode === "simple") {
    return <ReaderSimple bookId={params.bookId} />;
  }

  return <ReaderDefault bookId={params.bookId} />;
}
