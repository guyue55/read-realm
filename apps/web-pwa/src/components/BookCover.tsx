import React from "react";

export interface BookCoverProps {
  title: string;
  className?: string;
  compact?: boolean;
}

const coverPalettes = [
  ["#17201B", "#5F7D52", "#D2A66A"],
  ["#242032", "#8C6A46", "#E7CFA2"],
  ["#23303A", "#7A9AA0", "#F0D7B0"],
  ["#2E211C", "#9A6A3A", "#ECD8B6"],
  ["#1E2A24", "#6F8A66", "#DFBE86"],
] as const;

function hashTitle(title: string) {
  return Array.from(title).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );
}

export function BookCover({
  title,
  className = "",
  compact = false,
}: BookCoverProps) {
  const [base, accent, foil] =
    coverPalettes[hashTitle(title) % coverPalettes.length];
  const displayTitle = title.replace(/\s+/g, "").slice(0, compact ? 4 : 6);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[10px] border border-black/10 shadow-[0_12px_24px_rgba(47,42,36,0.16)] ${className}`}
      style={{
        background: `linear-gradient(155deg, ${base} 0%, ${accent} 54%, ${base} 100%)`,
      }}
      aria-label={`${title} 封面`}
    >
      <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10" />
      <div className="absolute -right-5 -top-6 h-16 w-16 rounded-full border border-white/20" />
      <div className="absolute bottom-3 left-3 right-3 top-3 rounded-[7px] border border-white/16" />
      <div className="absolute inset-x-3 top-4 h-px bg-white/22" />
      <div className="absolute bottom-4 left-3 right-3 h-px bg-white/20" />
      <div className="relative z-10 flex h-full w-full items-center justify-center px-3 text-center">
        <span
          className={`font-reading-title font-semibold leading-tight text-white drop-shadow-sm ${
            compact ? "text-[15px]" : "text-[18px]"
          }`}
        >
          {displayTitle || "无题"}
        </span>
      </div>
      <div
        className="absolute bottom-2 right-2 h-2 w-8 rounded-full opacity-80"
        style={{ backgroundColor: foil }}
      />
    </div>
  );
}
