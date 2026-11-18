import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  FileUp,
  Library,
  NotebookPen,
  Search,
  Settings,
} from "lucide-react";
import { PRODUCT_LANGUAGE, type ProductTerm } from "@/lib/product-language";
import type { AppView } from "@/lib/navigation-state";
import { isStaticMode } from "@/lib/static-mode";

export interface AppNavItem {
  href: string;
  icon: LucideIcon;
  term: ProductTerm;
  view: AppView;
}

/** 完整导航项（带后端的部署形态）。 */
const ALL_NAV_ITEMS: readonly AppNavItem[] = [
  {
    href: "/library",
    icon: Library,
    term: PRODUCT_LANGUAGE.navigation.library,
    view: "library",
  },
  {
    href: "/public-library",
    icon: BookMarked,
    term: PRODUCT_LANGUAGE.navigation.publicLibrary,
    view: "public-library",
  },
  {
    href: "/search",
    icon: Search,
    term: PRODUCT_LANGUAGE.navigation.search,
    view: "search",
  },
  {
    href: "/import",
    icon: FileUp,
    term: PRODUCT_LANGUAGE.navigation.importBook,
    view: "import",
  },
  {
    href: "/notes",
    icon: NotebookPen,
    term: PRODUCT_LANGUAGE.navigation.notes,
    view: "notes",
  },
  {
    href: "/settings",
    icon: Settings,
    term: PRODUCT_LANGUAGE.navigation.settings,
    view: "settings",
  },
];

/**
 * 实际渲染的导航项。静态站无后端，藏经阁（public-library）完全依赖服务端
 * 检索与入阁，没有本地替代，进入后只会是错误空态，故直接隐藏入口；
 * 其余功能均保留，在设置页与关键入口给出友好提示。
 * 默认（非静态模式）返回完整列表，历史行为不变。
 */
export const APP_NAV_ITEMS: readonly AppNavItem[] = isStaticMode
  ? ALL_NAV_ITEMS.filter((item) => item.view !== "public-library")
  : ALL_NAV_ITEMS;
