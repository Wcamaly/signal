"use client";

import { useState, useTransition } from "react";
import { actionSetItemStatus } from "@/lib/actions";
import { useT } from "./I18nProvider";
import type { Item } from "@/lib/types";

export default function ItemRow({
  item,
}: {
  item: Item & { source_name?: string; source_category?: string };
}) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const t = useT();
  const score = item.score ?? null;
  const topics = (() => {
    try {
      return JSON.parse(item.topics ?? "[]") as string[];
    } catch {
      return [];
    }
  })();

  const scoreColor =
    score === null ? "var(--faint)" : score >= 85 ? "var(--accent)" : score >= 70 ? "var(--good)" : "var(--faint)";

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-4 px-4 py-3">
        <div className="w-9 shrink-0 text-right pt-0.5">
          <span className="font-mono text-[13px] font-semibold" style={{ color: scoreColor }}>
            {score === null ? "—" : Math.round(score)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13.5px] leading-snug hover:text-accent"
          >
            {item.title}
          </a>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[11px] text-faint">
            {item.source_name && <span>{item.source_name}</span>}
            {item.published_at && <span>· {item.published_at.slice(0, 10)}</span>}
            {item.cluster && <span>· {item.cluster}</span>}
            <span
              className="chip !py-0 !px-1.5 !text-[10px]"
              style={item.status === "selected" || item.status === "used" ? { color: "var(--accent)" } : undefined}
            >
              {t.radar.statuses[item.status] ?? item.status}
            </span>
            {topics.slice(0, 3).map((t) => (
              <span key={t} className="chip !py-0 !px-1.5 !text-[10px]">
                {t}
              </span>
            ))}
          </div>
          {item.angle && (
            <p className="text-[12.5px] text-muted mt-2 leading-snug border-l-2 border-line pl-2.5">{item.angle}</p>
          )}
        </div>

        <div className="shrink-0 flex gap-1">
          {item.why && (
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
              {open ? t.radar.hide : t.radar.why}
            </button>
          )}
          {item.status !== "selected" && (
            <button
              className="btn btn-sm"
              onClick={() => start(() => void actionSetItemStatus(item.id, "selected"))}
            >
              {t.radar.select}
            </button>
          )}
          {item.status !== "rejected" && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => start(() => void actionSetItemStatus(item.id, "rejected"))}
            >
              {t.radar.reject}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-3.5 pl-[68px] text-[12.5px] text-muted leading-relaxed border-t border-line pt-3">
          <div className="mb-2">
            <span className="kicker">{t.radar.whyItMatters}</span>
            <p className="mt-1">{item.why}</p>
          </div>
          {item.summary && (
            <div>
              <span className="kicker">{t.radar.sourceSummary}</span>
              <p className="mt-1 text-faint">{item.summary.slice(0, 600)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
