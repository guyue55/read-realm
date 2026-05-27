import React from "react";

export function PageContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full max-w-[1448px] mx-auto p-4 md:p-8 ${className}`}>
      {children}
    </div>
  );
}
