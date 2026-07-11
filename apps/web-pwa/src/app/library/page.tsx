"use client";

import { useEffect, useState } from "react";
import { loadReaderSettings } from "@/lib/reader-settings";
import { LibraryDefault } from "./LibraryDefault";

export default function LibraryPageSwitch() {
  const [uiMode, setUiMode] = useState<"default" | "simple">("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace(`/#${window.location.pathname}${window.location.search}`);
      return;
    }
    setUiMode(loadReaderSettings().uiMode || "default");
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) return null;

  return <LibraryDefault initialDensity={uiMode === "simple" ? "compact" : "comfortable"} />;
}
