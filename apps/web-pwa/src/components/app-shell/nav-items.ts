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

export interface AppNavItem {
  href: string;
  icon: LucideIcon;
  term: ProductTerm;
  view: AppView;
}

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
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
