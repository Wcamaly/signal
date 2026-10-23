import type { SectionTab } from "@/components/SectionTabs";
import type { Dictionary } from "./i18n/en";

/** The tabs of each management topic, shared by its list and item pages. */

export function sourcesTabs(t: Dictionary): SectionTab[] {
  return [
    { href: "/manage/sources", label: t.manage.tabs.sources },
    { href: "/manage/categories", label: t.manage.tabs.categories },
  ];
}
