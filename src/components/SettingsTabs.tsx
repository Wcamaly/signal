"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "./I18nProvider";

export default function SettingsTabs() {
  const path = usePathname();
  const t = useT();

  const TABS = [
    { href: "/settings", label: t.nav.voice },
    { href: "/settings/channels", label: t.nav.channels },
    { href: "/settings/prompts", label: t.nav.prompts },
    { href: "/settings/model", label: t.nav.model },
  ];

  return (
    <div className="px-8 py-3 border-b border-line flex gap-1.5">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`chip ${path === t.href ? "!text-ink !border-line-strong !bg-[#1e2228]" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
