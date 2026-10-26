"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "./I18nProvider";

/**
 * The sidebar: always shown from `md` up, a drawer behind a top bar below it.
 * The drawer remembers the path it was opened on, so following any link in it
 * closes it without an effect.
 */
export default function Sidebar({ brand, children }: { brand: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const t = useT();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 h-12 px-4 flex items-center justify-between border-b border-line bg-[#0d0e11]">
        {brand}
        <button
          type="button"
          className="btn btn-ghost btn-sm !px-2"
          aria-label={t.nav.openMenu}
          aria-expanded={open}
          onClick={() => setOpenOn(path)}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 5h12M3 9h12M3 13h12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpenOn(null)} aria-hidden />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[240px] transition-transform md:sticky md:top-0 md:h-screen md:w-[212px] md:translate-x-0 shrink-0 border-r border-line bg-[#0d0e11] flex flex-col overflow-y-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* `.btn` sets display outside Tailwind's layers, so md:hidden goes on a wrapper */}
        <div className="md:hidden absolute top-4 right-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm !px-2"
            aria-label={t.nav.closeMenu}
            onClick={() => setOpenOn(null)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l8 8M11 3l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
