"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Panel" },
  { href: "/radar", label: "Radar" },
  { href: "/digest", label: "Resumen semanal" },
  { href: "/posts", label: "Publicaciones" },
  { href: "/sources", label: "Fuentes" },
  { href: "/settings", label: "Voz y ajustes" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="px-2.5 flex flex-col gap-0.5">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`px-2.5 py-[7px] rounded-md text-[13px] transition-colors ${
              active
                ? "bg-surface-2 text-ink font-medium"
                : "text-muted hover:text-ink hover:bg-[#15171b]"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
