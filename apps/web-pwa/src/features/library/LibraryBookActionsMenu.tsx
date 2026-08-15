import { useEffect, useRef, type ReactNode } from "react";
import {
  Archive,
  Download,
  Link2,
  MoreHorizontal,
  Settings2,
  Trash2,
  UploadCloud,
} from "lucide-react";

export interface LibraryActionItem {
  danger?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onSelect: (trigger: HTMLButtonElement | null) => void;
}

export interface LibraryActionsMenuProps {
  actions: readonly LibraryActionItem[];
  label: string;
  onToggle: () => void;
  open: boolean;
  placement?: "bottom" | "top";
}

export interface LibraryBookActionsMenuProps {
  bookTitle: string;
  canBackup: boolean;
  canDelete: boolean;
  canDisconnect: boolean;
  canDownload: boolean;
  canManage: boolean;
  canOffload: boolean;
  canReimport: boolean;
  disabled?: boolean;
  networkDisabled?: boolean;
  onBackup: () => void;
  onDelete: () => void;
  onDisconnect: () => void;
  onDownload: () => void;
  onManage: (trigger: HTMLButtonElement | null) => void;
  onOffload: () => void;
  onReimport: () => void;
  onToggle: () => void;
  open: boolean;
  placement?: "bottom" | "top";
}

const actionClass =
  "ui-focus-ring flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm font-semibold text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-45";

export function LibraryActionsMenu({
  actions,
  label,
  onToggle,
  open,
  placement = "bottom",
}: LibraryActionsMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onToggleRef = useRef(onToggle);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = false;
    const trigger = triggerRef.current;
    const firstAction = containerRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    firstAction?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onToggleRef.current();
      }
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      restoreFocusRef.current = true;
      onToggleRef.current();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      if (restoreFocusRef.current) trigger?.focus();
    };
  }, [open]);

  const enabledItems = () =>
    Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = enabledItems();
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (Math.max(current, -1) + 1) % items.length
            : (current <= 0 ? items.length : current) - 1;
    items[nextIndex]?.focus();
  };

  const run = (action: (trigger: HTMLButtonElement | null) => void) => {
    const trigger = triggerRef.current;
    restoreFocusRef.current = true;
    onToggle();
    action(trigger);
  };

  return (
    <div
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      ref={containerRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="ui-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-accent)]"
        onClick={onToggle}
        ref={triggerRef}
        type="button"
      >
        <MoreHorizontal
          aria-hidden="true"
          className="h-5 w-5"
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <div
          aria-label={label}
          className={`absolute right-0 z-50 w-56 rounded-[var(--radius-card)] border border-[var(--ui-border)] bg-[var(--ui-surface)] py-2 shadow-[var(--shadow-raised)] ${
            placement === "top" ? "bottom-full mb-2" : "mt-2"
          }`}
          onKeyDown={handleMenuKeyDown}
          role="menu"
        >
          {actions.map((action) => (
            <button
              className={`${actionClass} ${action.danger ? "text-[var(--ui-danger)]" : ""}`}
              disabled={action.disabled}
              key={action.id}
              onClick={() => run(action.onSelect)}
              role="menuitem"
              type="button"
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const menuIconClass = "h-[18px] w-[18px]";

export function LibraryBookActionsMenu({
  bookTitle,
  canBackup,
  canDelete,
  canDisconnect,
  canDownload,
  canManage,
  canOffload,
  canReimport,
  disabled = false,
  networkDisabled = false,
  onBackup,
  onDelete,
  onDisconnect,
  onDownload,
  onManage,
  onOffload,
  onReimport,
  onToggle,
  open,
  placement = "bottom",
}: LibraryBookActionsMenuProps) {
  const actions: LibraryActionItem[] = [
    ...(canDownload
      ? [
          {
            id: "download",
            label: "下载到本机",
            icon: (
              <Download
                aria-hidden="true"
                className={menuIconClass}
                strokeWidth={1.75}
              />
            ),
            disabled: disabled || networkDisabled,
            onSelect: () => onDownload(),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            id: "manage",
            label: "管理书籍",
            icon: (
              <Settings2
                aria-hidden="true"
                className={menuIconClass}
                strokeWidth={1.75}
              />
            ),
            disabled,
            onSelect: onManage,
          },
        ]
      : []),
    ...(canBackup
      ? [
          {
            id: "backup",
            label: "备份到私人云端",
            icon: (
              <UploadCloud
                aria-hidden="true"
                className={menuIconClass}
                strokeWidth={1.75}
              />
            ),
            disabled: disabled || networkDisabled,
            onSelect: () => onBackup(),
          },
        ]
      : []),
    ...(canOffload
      ? [
          {
            id: "offload",
            label: "删除本机章节正文",
            icon: (
              <Archive
                aria-hidden="true"
                className={menuIconClass}
                strokeWidth={1.75}
              />
            ),
            disabled,
            onSelect: onOffload,
          },
        ]
      : []),
    ...(canReimport
      ? [
          {
            id: "reimport",
            label: "从原文件重新解析",
            icon: (
              <Archive
                aria-hidden="true"
                className={menuIconClass}
                strokeWidth={1.75}
              />
            ),
            disabled,
            onSelect: onReimport,
          },
        ]
      : []),
    ...(canDisconnect
      ? [
          {
            id: "disconnect",
            label: "解除原文件关联",
            icon: (
              <Link2
                aria-hidden="true"
                className={menuIconClass}
                strokeWidth={1.75}
              />
            ),
            disabled,
            onSelect: onDisconnect,
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            id: "delete",
            label: "删除书籍",
            icon: (
              <Trash2
                aria-hidden="true"
                className={menuIconClass}
                strokeWidth={1.75}
              />
            ),
            danger: true,
            disabled,
            onSelect: onDelete,
          },
        ]
      : []),
  ];

  return (
    <LibraryActionsMenu
      actions={actions}
      label={`打开《${bookTitle}》的操作菜单`}
      onToggle={onToggle}
      open={open}
      placement={placement}
    />
  );
}
