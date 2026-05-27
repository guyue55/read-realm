"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

export interface AppShellProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  rightNodes?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}

const navItems = [
  {
    label: "发现",
    href: "/search",
    icon: <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm5.5-2.5L21 21" />,
  },
  {
    label: "书架",
    href: "/library",
    icon: (
      <>
        <path d="M5 5h4.5v14H5z" />
        <path d="M9.5 5H14v14H9.5z" />
        <path d="m15.5 5 3.5 1.2-4.2 13-3.5-1.1z" />
      </>
    ),
  },
  {
    label: "导入",
    href: "/import",
    icon: (
      <>
        <path d="M12 3v11" />
        <path d="m8 7 4-4 4 4" />
        <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      </>
    ),
  },
  {
    label: "设置",
    href: "/settings",
    icon: (
      <>
        <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2.06 2.06 0 0 1-2.91 2.91l-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .92 1.7 1.7 0 0 1-1.56 1.04h-.88A1.7 1.7 0 0 1 10 20.32a1.7 1.7 0 0 0-1-.92 1.7 1.7 0 0 0-1.87.34l-.05.05a2.06 2.06 0 0 1-2.91-2.91l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.92-1 1.7 1.7 0 0 1-1.04-1.56v-.88A1.7 1.7 0 0 1 3.68 10a1.7 1.7 0 0 0 .92-1 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2.06 2.06 0 0 1 2.91-2.91l.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.92 1.7 1.7 0 0 1 1.56-1.04h.88A1.7 1.7 0 0 1 14 3.68a1.7 1.7 0 0 0 1 .92 1.7 1.7 0 0 0 1.87-.34l.05-.05a2.06 2.06 0 0 1 2.91 2.91l-.05.05A1.7 1.7 0 0 0 19.4 9c.4.18.72.5.92 1a1.7 1.7 0 0 1 1.04 1.56v.88A1.7 1.7 0 0 1 20.32 14a1.7 1.7 0 0 0-.92 1Z" />
      </>
    ),
  },
];

function LeafMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]">
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 15c7.5.7 12.1-3.8 14-10-6.2.7-11.6 3.5-14 10Z" />
        <path d="M5 15c2.2-2.2 5-3.6 8.6-4.2" />
        <path d="M4 20c.8-2.2 2.2-4 4.2-5.3" />
      </svg>
    </span>
  );
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function AppShell({
  title,
  subtitle,
  rightNodes,
  children,
  contentClassName = "",
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[var(--ui-bg)] text-[var(--ui-text)] md:flex">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-32 flex-col border-r border-[var(--ui-border)] bg-[rgba(255,252,245,0.72)] px-4 py-5 backdrop-blur-xl md:flex">
        <Link href="/library" className="mb-8 flex items-center gap-2">
          <LeafMark />
          <span className="text-sm font-bold tracking-[0.02em] text-[var(--ui-text)]">
            阅间
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/library" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--ui-accent-soft)] font-semibold text-[var(--ui-accent)]"
                    : "text-[var(--ui-muted)] hover:bg-white/70 hover:text-[var(--ui-text)]"
                }`}
              >
                <NavIcon>{item.icon}</NavIcon>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="rounded-xl border border-[var(--ui-border)] bg-white/55 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-[linear-gradient(135deg,#E7B77A,#5F7D52)]" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--ui-text)]">
                漫游的夜
              </p>
              <p className="text-[10px] text-[var(--ui-quiet)]">本地书架</p>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(80,65,45,0.08)]">
            <div className="h-full w-2/5 rounded-full bg-[var(--ui-accent)]" />
          </div>
        </div>
      </aside>

      <main className="min-h-screen flex-1 pb-[calc(78px+env(safe-area-inset-bottom))] md:pb-0 md:pl-32">
        <header className="sticky top-0 z-30 border-b border-[var(--ui-border)] bg-[rgba(248,246,240,0.82)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => router.push("/library")}
                className="ui-focus-ring flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--ui-accent)] md:hidden"
                aria-label="返回书架"
              >
                <LeafMark />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-bold leading-tight tracking-normal text-[var(--ui-text)]">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-0.5 truncate text-xs text-[var(--ui-muted)]">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {rightNodes && (
              <div className="flex shrink-0 items-center gap-2">
                {rightNodes}
              </div>
            )}
          </div>
        </header>

        <div
          className={`mx-auto w-full max-w-[1240px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 ${contentClassName}`}
        >
          {children}
        </div>
      </main>

      <nav className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-50 grid grid-cols-4 rounded-[22px] border border-[var(--ui-border)] bg-[rgba(255,252,245,0.94)] p-2 shadow-[0_18px_50px_rgba(47,42,36,0.16)] backdrop-blur-xl md:hidden">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/library" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ui-focus-ring flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[16px] text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]"
                  : "text-[var(--ui-muted)] hover:bg-white/70 hover:text-[var(--ui-text)]"
              }`}
            >
              <NavIcon>{item.icon}</NavIcon>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
