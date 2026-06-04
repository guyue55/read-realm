"use client";

import { useState, useEffect, useRef } from "react";
import { strings } from "@/lib/i18n";

interface ToastState {
  message: string;
  type: "online" | "offline";
  id: number;
}

export function OfflineBadge() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isMounted, setIsOnlineMounted] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastIdRef = useRef(0);

  const showToast = (message: string, type: "online" | "offline") => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    const id = ++toastIdRef.current;
    setToast({ message, type, id });

    timeoutRef.current = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4000); // Elegant 4-second dwell time (includes fade animations)
  };

  useEffect(() => {
    setIsOnlineMounted(true);

    function handleOnline() {
      showToast(strings.network.onlineToast, "online");
    }

    function handleOffline() {
      showToast(strings.network.offlineToast, "offline");
    }

    // Check on mount, only show initial toast if starting in offline state
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showToast(strings.network.offlineToast, "offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!isMounted || !toast) return null;

  const isOffline = toast.type === "offline";

  // Classic Xuan paper aesthetic palettes
  const bgClass = isOffline
    ? "bg-[#FAF4EB]/95 border-[#E5C9A6]/60 text-[#8C6239] shadow-[0_12px_36px_rgba(140,98,57,0.12)]"
    : "bg-[#F1F6F0]/95 border-[#D0E2CF]/60 text-[#4C664B] shadow-[0_12px_36px_rgba(76,102,75,0.12)]";

  return (
    <div className="fixed z-[100] top-5 left-1/2 -translate-x-1/2 md:top-auto md:bottom-6 md:right-6 md:left-auto md:translate-x-0 p-0 md:p-4 pointer-events-none transition-all duration-500 ease-in-out">
      <div
        className={`flex items-center backdrop-blur-md pointer-events-auto transition-all duration-300 transform animate-in fade-in slide-in-from-top-5 md:slide-in-from-bottom-5 ${bgClass} px-3.5 py-1.5 rounded-full text-xs gap-2 md:px-4 md:py-2.5 md:rounded-2xl md:text-[13px] md:gap-3`}
        style={{ maxWidth: "calc(100vw - 32px)", width: "max-content" }}
      >
        {isOffline ? (
          // Wi-Fi Slashed Icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 w-3.5 h-3.5 md:w-4 md:h-4 animate-pulse"
          >
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
        ) : (
          // Wi-Fi Connected Icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 w-3.5 h-3.5 md:w-4 md:h-4"
          >
            <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
        )}
        <span className="font-bold tracking-wide">{toast.message}</span>
        
        {/* Dismiss Button */}
        <button
          onClick={() => setToast(null)}
          className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-[10px] md:text-xs font-semibold p-0.5"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
