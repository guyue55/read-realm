"use client";

import { useEffect } from "react";
import { useAppToast } from "@/components/ui/AppToast";
import { strings } from "@/lib/i18n";

export function OfflineBadge() {
  const { showToast } = useAppToast();

  useEffect(() => {
    const handleOnline = () =>
      showToast(strings.network.onlineToast, "success", 4000);
    const handleOffline = () =>
      showToast(strings.network.offlineToast, "warning", null);

    if (!navigator.onLine) handleOffline();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [showToast]);

  return null;
}
