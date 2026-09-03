"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: { title: string | null; links: { href: string; label: string; exact?: boolean }[] }[] = [
  {
    title: null,
    links: [
      { href: "/", label: "Dashboard", exact: true },
      { href: "/radar", label: "Radar" },
      { href: "/digest", label: "Weekly digest" },
      { href: "/posts", label: "Publications" },
      { href: "/sources", label: "Sources" },
    ],
  },
  {
    title: "Configure",
    links: [
      { href: "/settings", label: "Voice & settings", exact: true },
      { href: "/settings/channels", label: "Channels" },
      { href: "/settings/prompts", label: "Prompts" },
      { href: "/settings/model", label: "Model & keys" },
    ],
  },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="px-2.5 flex flex-col gap-4">
      {GROUPS.map((group) => (
        <div key={group.title ?? "main"} className="flex flex-col gap-0.5">
          {group.title && <div className="kicker px-2.5 pt-2 pb-1">{group.title}</div>}
          {group.links.map((l) => {
            const active = l.exact ? path === l.href : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2.5 py-[7px] rounded-md text-[13px] transition-colors ${
                  active ? "bg-surface-2 text-ink font-medium" : "text-muted hover:text-ink hover:bg-[#15171b]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
