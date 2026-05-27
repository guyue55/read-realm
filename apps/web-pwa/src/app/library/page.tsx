"use client";

import { useEffect, useState } from "react";
import { loadReaderSettings } from "@/lib/reader-settings";
import LibrarySimple from "./LibrarySimple";
import { LibraryDefault } from "./LibraryDefault";

export default function LibraryPageSwitch() {
  const [uiMode, setUiMode] = useState<"default" | "simple">("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUiMode(loadReaderSettings().uiMode || "default");
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) return null;

  if (uiMode === "simple") {
    return <LibrarySimple />;
  }

  return <LibraryDefault />;
}
