"use client";

import { useEffect } from "react";
import { swScope, withBasePath } from "@/lib/base-path";

const SERVICE_WORKER_URL = withBasePath("/sw.js");
const SERVICE_WORKER_SCOPE = swScope();

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    // 与 next-pwa 自动注册的 URL/scope 保持一致，getRegistration 命中后不重复注册。
    void navigator.serviceWorker
      .getRegistration(SERVICE_WORKER_SCOPE)
      .then((registration) => registration ?? navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE }))
      .catch((error: unknown) => {
        console.error("离线服务启动失败", error);
      });
  }, []);

  return null;
}
