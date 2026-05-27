"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    {
      name: "书架",
      path: "/library",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
    {
      name: "发现",
      path: "/search",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
    {
      name: "导入",
      path: "/import",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
    {
      name: "笔记",
      path: "/notes",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
    {
      name: "设置",
      path: "/settings",
      icon: (
        <div className="w-2 h-2 rounded-full bg-[#678055] transition-opacity"></div>
      ),
    },
  ];

  return (
    <aside className="hidden xl:flex w-[92px] h-[calc(100vh-64px)] bg-[#FBF8F0] border border-[#E4D9C9] rounded-[12px] flex-col items-center py-8 sticky top-8 shrink-0">
      <h1 className="text-xl font-bold text-[#526047] mb-8 font-serif">墨问</h1>

      <nav className="flex flex-col gap-6 items-center flex-1 w-full">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <div
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center gap-1 w-16 py-2 rounded-lg cursor-pointer transition-colors ${
                isActive ? "bg-[#E7EDE0]" : "hover:bg-[rgba(80,65,45,0.04)]"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full bg-[#678055] ${isActive ? "" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
              ></div>
              <span className="text-[10px] text-[#526047] font-medium">
                {item.name}
              </span>
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-1 mt-auto">
        <div className="w-6 h-6 rounded-full bg-[#678055] mb-2 shadow-[0_3px_4px_rgba(90,73,53,0.12)]"></div>
        <span className="text-[10px] text-[#526047] text-center w-16 leading-tight">
          连续阅读 18 天
        </span>
      </div>
    </aside>
  );
}
