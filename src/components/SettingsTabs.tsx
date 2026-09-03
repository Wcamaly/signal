"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Voice & settings" },
  { href: "/settings/channels", label: "Channels" },
  { href: "/settings/prompts", label: "Prompts" },
  { href: "/settings/model", label: "Model & keys" },
];

export default function SettingsTabs() {
  const path = usePathname();
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
