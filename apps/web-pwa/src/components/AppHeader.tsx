"use client";

import React from "react";

export interface AppHeaderProps {
  title: React.ReactNode;
  rightNodes?: React.ReactNode;
  onBack?: () => void;
}

export function AppHeader({ title, rightNodes, onBack }: AppHeaderProps) {
  return (
    <header className="w-full border-b border-[rgba(80,65,45,0.12)] bg-[#F8F8F5] sticky top-0 z-30 flex justify-center">
      <div className="w-full max-w-5xl flex items-center justify-between px-4 md:px-8 h-16">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          {onBack && (
            <button
              onClick={onBack}
              className="text-[#6F665B] hover:text-[#2F2A24] p-2 -ml-2 rounded-full hover:bg-[rgba(80,65,45,0.04)] transition-colors shrink-0"
              aria-label="返回"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
          )}
          <h1 className="text-lg md:text-xl font-bold text-[#2F2A24] truncate">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          {rightNodes}
        </div>
      </div>
    </header>
  );
}
