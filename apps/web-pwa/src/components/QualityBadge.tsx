import React from "react";

export type QualityIssueType = "short" | "formatting" | "missing_title";

export interface QualityBadgeProps {
  issueType: QualityIssueType;
  severity: "warning" | "error";
}

export function QualityBadge({ issueType, severity }: QualityBadgeProps) {
  let label = "异常";
  if (issueType === "short") label = "字数少";
  if (issueType === "formatting") label = "格式异常";
  if (issueType === "missing_title") label = "无标题";

  if (severity === "error") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#FFF0EC] text-[#DCA79A] border border-[#DCA79A]">
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#FFF4DB] text-[#9A6A3A] border border-[#E5C57F]">
      {label}
    </span>
  );
}

// Utility to check chapter quality
export function analyzeChapterQuality(
  content: string,
  title: string,
): { issueType: QualityIssueType; severity: "warning" | "error" } | null {
  if (
    !title ||
    title.trim() === "" ||
    (title.startsWith("第") && title.length < 4 && content.length < 50)
  ) {
    return { issueType: "missing_title", severity: "error" };
  }
  if (content.length < 200) {
    return { issueType: "short", severity: "warning" };
  }
  // Simple heuristic for repeating garbage
  if (content.match(/(.{20,})\1{3,}/)) {
    return { issueType: "formatting", severity: "error" };
  }
  return null;
}
