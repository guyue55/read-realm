import React from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[16px] border border-[rgba(80,65,45,0.12)] text-[#2F2A24] shadow-sm">
      <div className="w-16 h-16 bg-[#EEF2E9] border border-[#CDD8C5] rounded-full flex items-center justify-center mb-6">
        <span className="text-2xl text-[#678055] font-bold">＋</span>
      </div>
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <p className="text-[#6F665B] mb-6 text-sm text-center max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-2 bg-[#678055] text-white rounded-full font-semibold hover:bg-[#526047] transition-colors shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
