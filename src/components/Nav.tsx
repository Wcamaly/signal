"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { underPath } from "@/lib/nav";
import { useT } from "./I18nProvider";

/** `also`: other paths that light the same entry, e.g. the second tab of a topic. */
type NavLink = { href: string; label: string; also?: string[] };

/**
 * Two fixed groups: Operation (what the pipeline produced, and running it) and
 * Management (what it is made of). A management topic stays lit on every page
 * below it, tabs included.
 */
export default function Nav() {
  const path = usePathname();
  const t = useT();

  const GROUPS: { title: string; links: NavLink[] }[] = [
    {
      title: t.nav.operation,
      links: [
        { href: "/", label: t.nav.dashboard },
        { href: "/radar", label: t.nav.radar },
        { href: "/digest", label: t.nav.digest },
        { href: "/posts", label: t.nav.posts },
        { href: "/runs", label: t.nav.runs },
      ],
    },
    {
      title: t.nav.management,
      links: [
        { href: "/manage/sources", label: t.nav.sources, also: ["/manage/categories"] },
        { href: "/manage/digests", label: t.nav.digestDefs },
        { href: "/manage/channels", label: t.nav.channels },
        { href: "/manage/voice", label: t.nav.writing, also: ["/manage/prompts"] },
        { href: "/manage/model", label: t.nav.model },
        { href: "/manage/settings", label: t.nav.settings },
      ],
    },
  ];

  return (
    <nav className="px-2.5 flex flex-col gap-4">
      {GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <div className="kicker px-2.5 pt-2 pb-1">{group.title}</div>
          {group.links.map((l) => {
            const active = [l.href, ...(l.also ?? [])].some((p) => underPath(path, p));
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
