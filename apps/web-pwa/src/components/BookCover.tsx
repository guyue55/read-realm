import React from "react";

export interface BookCoverProps {
  title: string;
  className?: string;
  compact?: boolean;
  hoverLift?: boolean;
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
  hoverLift = false,
}: BookCoverProps) {
  const [base, accent, foil] =
    coverPalettes[hashTitle(title) % coverPalettes.length];
  const displayTitle = title.replace(/\s+/g, "").slice(0, compact ? 4 : 6);

  const hoverClasses = hoverLift
    ? "physics-spring transition-all duration-300 group-hover:scale-[1.05] group-hover:-translate-y-2 group-hover:rotate-[1deg] group-hover:shadow-[0_24px_45px_rgba(47,42,36,0.26)]"
    : "";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[10px] border border-black/12 shadow-[0_12px_24px_rgba(47,42,36,0.16)] ${hoverClasses} ${className}`}
      style={{
        background: `linear-gradient(155deg, ${base} 0%, ${accent} 54%, ${base} 100%)`,
      }}
      aria-label={`${title} 封面`}
    >
      {/* 1. 物理书脊左边缘弧度体积感阴影 */}
      <div className="absolute left-0 inset-y-0 w-[6px] bg-gradient-to-r from-black/28 to-transparent z-[2]" />

      {/* 2. 物理精装书脊挤压凹折缝 (Spine Crease Joint) */}
      <div className="absolute left-[7px] inset-y-0 w-[3px] bg-gradient-to-r from-black/22 via-black/4 to-transparent border-r border-white/12 z-[2]" />

      {/* 精装书籍边缘光感与修饰 */}
      <div className="absolute inset-x-0 top-0 h-1/3 bg-white/10" />
      <div className="absolute -right-5 -top-6 h-16 w-16 rounded-full border border-white/10" />
      
      {/* 内部双线边框压痕，模拟精装压槽 */}
      <div className="absolute bottom-3 left-4 right-3 top-3 rounded-[6px] border border-white/12 z-[1]" />
      <div className="absolute inset-x-4 top-4 h-px bg-white/16 z-[1]" />
      <div className="absolute bottom-4 left-4 right-3 h-px bg-white/14 z-[1]" />
      
      <div className="relative z-10 flex h-full w-full items-center justify-center pl-5 pr-3 text-center">
        <span
          className={`font-reading-title font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] ${
            compact ? "text-[14px]" : "text-[17px]"
          }`}
        >
          {displayTitle || "无题"}
        </span>
      </div>
      <div
        className="absolute bottom-2 right-2 h-2 w-8 rounded-full opacity-80 z-[1]"
        style={{ backgroundColor: foil }}
      />
    </div>
  );
}

