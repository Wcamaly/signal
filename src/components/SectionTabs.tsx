"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref } from "@/lib/nav";

export type SectionTab = { href: string; label: string };

/**
 * The tabs of one management topic, each its own URL. A tab stays active on
 * the pages below it (`/manage/sources/12` keeps Sources lit).
 */
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const path = usePathname();
  const active = activeHref(
    path,
    tabs.map((t) => t.href),
  );

  return (
    <div className="px-8 py-3 border-b border-line flex gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`chip ${active === t.href ? "!text-ink !border-line-strong !bg-[#1e2228]" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
