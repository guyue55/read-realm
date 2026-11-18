"use client";

import { useEffect, useState } from "react";
import { resolveHashRedirect } from "@/lib/base-path";
import { loadReaderSettings } from "@/lib/reader-settings";
import { LibraryDefault } from "./LibraryDefault";

export default function LibraryPageSwitch() {
  const [uiMode, setUiMode] = useState<"default" | "simple">("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const redirect = resolveHashRedirect(window.location.pathname, window.location.search);
      if (redirect) {
        window.location.replace(redirect);
        return;
      }
    }
    setUiMode(loadReaderSettings().uiMode || "default");
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) return null;

  return <LibraryDefault initialDensity={uiMode === "simple" ? "compact" : "comfortable"} />;
}
