import type { SectionTab } from "@/components/SectionTabs";
import type { Dictionary } from "./i18n/en";

/** The tabs of each management topic, shared by its list and item pages. */

export function sourcesTabs(t: Dictionary): SectionTab[] {
  return [
    { href: "/manage/sources", label: t.manage.tabs.sources },
    { href: "/manage/categories", label: t.manage.tabs.categories },
  ];
}

export function writingTabs(t: Dictionary): SectionTab[] {
  return [
    { href: "/manage/voice", label: t.manage.tabs.voice },
    { href: "/manage/prompts", label: t.manage.tabs.prompts },
  ];
}

export function settingsTabs(t: Dictionary): SectionTab[] {
  return [
    { href: "/manage/settings", label: t.manage.tabs.pipeline },
    { href: "/manage/settings/interface", label: t.manage.tabs.interface },
  ];
}
