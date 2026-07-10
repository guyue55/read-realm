"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

export interface PageLayoutProps {
  children: ReactNode;
  headerContent?: ReactNode;
  hideSidebar?: boolean;
  onBack?: () => void;
  rightNodes?: ReactNode;
  subtitle?: string;
  title: string;
}

export function PageLayout({
  children,
  headerContent,
  onBack,
  rightNodes,
  subtitle,
  title,
}: PageLayoutProps) {
  const actions =
    headerContent || rightNodes ? (
      <>
        {headerContent}
        {rightNodes}
      </>
    ) : undefined;

  return (
    <AppShell
      onBack={onBack}
      rightNodes={actions}
      subtitle={subtitle}
      title={title}
    >
      {children}
    </AppShell>
  );
}
