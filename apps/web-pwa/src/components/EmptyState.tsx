import React from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-[#FFFDF8] rounded-[20px] border border-[#DED6C8] text-[#2F2A24] shadow-[0_10px_28px_rgba(80,65,45,0.08)] mx-auto max-w-2xl">
      <div className="w-16 h-16 bg-[#EEF2E9] border border-[#CDD8C5] rounded-full flex items-center justify-center mb-6 shadow-[0_4px_12px_rgba(103,128,85,0.15)]">
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
