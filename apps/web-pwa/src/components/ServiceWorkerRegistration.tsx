"use client";

import { useEffect } from "react";

const SERVICE_WORKER_URL = "/sw.js";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => registration ?? navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" }))
      .catch((error: unknown) => {
        console.error("离线服务启动失败", error);
      });
  }, []);

  return null;
}
