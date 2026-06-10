import { useState } from "react";
import type { ImportPreviewNode } from "../services/FolderScanService";

interface FolderPreviewTreeProps {
  node: ImportPreviewNode;
  onNodeTypeChange: (nodeId: string, newType: ImportPreviewNode["detectedType"] | "ignore") => void;
  ignoredNodes: Set<string>;
  customTypes: Map<string, ImportPreviewNode["detectedType"] | "ignore">;
  depth?: number;
}

export function FolderPreviewTree({
  node,
  onNodeTypeChange,
  ignoredNodes,
  customTypes,
  depth = 0,
}: FolderPreviewTreeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isIgnored = ignoredNodes.has(node.id) || customTypes.get(node.id) === "ignore";
  const currentType = customTypes.get(node.id) || node.detectedType;

  // 格式化文件大小
  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="select-none" style={{ marginLeft: depth > 0 ? "20px" : "0" }}>
      {/* 节点行 */}
      <div
        className={`group flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-all duration-200 hover:bg-[#FAF5EB] ${
          isIgnored ? "opacity-50 line-through" : ""
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* 折叠/展开箭头 */}
          {hasChildren ? (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="ui-focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--ui-muted)] transition-transform duration-200 hover:bg-[#E9DCC8]/40"
              style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="w-5 shrink-0" />
          )}

          {/* 拟物图标 */}
          <span className="text-lg shrink-0">
            {node.kind === "directory"
              ? currentType === "multi_file_book"
                ? "📚" // 装配的一体书
                : "📁" // 普通逻辑文件夹
              : node.format === "epub"
              ? "📔"
              : "📜"}
          </span>

          {/* 节点名称和路径 */}
          <span className="truncate text-sm font-semibold text-[var(--ui-text)]" title={node.name}>
            {node.name}
          </span>

          {/* 类型徽标 */}
          <span className="hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold md:inline-flex">
            {currentType === "category_folder" && (
              <span className="border border-[#D0E2CF] bg-[#F1F6F0] text-[#4C664B]">📂 分类文件夹</span>
            )}
            {currentType === "multi_file_book" && (
              <span className="border border-[#E5C9A6] bg-[#FAF4EB] text-[#8C6239]">📚 多章节小说 (场景D)</span>
            )}
            {currentType === "single_book" && (
              <span className="border border-blue-200 bg-blue-50 text-blue-700">📜 单本小说</span>
            )}
            {isIgnored && <span className="border border-red-200 bg-red-50 text-red-700">🚫 忽略导入</span>}
          </span>
        </div>

        {/* 节点控制层 */}
        <div className="flex shrink-0 items-center gap-3">
          {/* 大小或文件计数 */}
          <span className="text-xs text-[var(--ui-muted)] font-medium">
            {node.kind === "directory"
              ? currentType === "multi_file_book"
                ? `${node.chapterCount || 0} 章节`
                : `${node.children?.length || 0} 项`
              : formatSize(node.size)}
          </span>

          {/* 手动转换下拉菜单 */}
          <select
            value={isIgnored ? "ignore" : currentType}
            onChange={(e) => {
              const val = e.target.value;
              onNodeTypeChange(node.id, val as ImportPreviewNode["detectedType"] | "ignore");
            }}
            className="ui-focus-ring cursor-pointer rounded-md border border-[#E9DCC8]/80 bg-white/80 px-2 py-1 text-xs font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
          >
            {node.kind === "directory" ? (
              <>
                <option value="category_folder">📂 作为分类层级</option>
                <option value="multi_file_book">📚 识别为一本书</option>
              </>
            ) : (
              <option value="single_book">📜 作为单本小说</option>
            )}
            <option value="ignore">🚫 忽略此节点</option>
          </select>
        </div>
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && !isIgnored && (
        <div className="relative mt-1 border-l border-dashed border-[#E9DCC8]/60 pl-1">
          {node.children!.map((child) => (
            <FolderPreviewTree
              key={child.id}
              node={child}
              onNodeTypeChange={onNodeTypeChange}
              ignoredNodes={ignoredNodes}
              customTypes={customTypes}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
