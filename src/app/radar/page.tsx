import { getDb } from "@/lib/db";
import { getCategories } from "@/lib/categories";
import { weekKey } from "@/lib/weeks";
import { getDictionary } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ItemRow from "@/components/ItemRow";
import CategoryChips from "@/components/CategoryChips";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

type Search = Promise<{ week?: string; min?: string; cat?: string }>;

export default async function RadarPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const db = getDb();
  const week = typeof sp.week === "string" && sp.week ? sp.week : weekKey();
  const min = Number(typeof sp.min === "string" ? sp.min : 0);
  const cat = typeof sp.cat === "string" && sp.cat ? sp.cat : undefined;
  const categories = getCategories();
  /** Every chip keeps the other two filters. */
  const href = (p: { week?: string; min?: number; cat?: string | null }) => {
    const q = new URLSearchParams({ week: p.week ?? week, min: String(p.min ?? min) });
    const c = p.cat === undefined ? cat : p.cat;
    if (c) q.set("cat", c);
    return `/radar?${q}`;
  };

  const weeks = db
    .prepare(
      "SELECT week_key, COUNT(*) c FROM items WHERE week_key IS NOT NULL GROUP BY week_key ORDER BY week_key DESC LIMIT 8",
    )
    .all() as { week_key: string; c: number }[];

  const items = db
    .prepare(
      `SELECT i.*, s.name AS source_name, s.category AS source_category
       FROM items i LEFT JOIN sources s ON s.id = i.source_id
       WHERE i.week_key = ? AND COALESCE(i.score, -1) >= ? AND (? IS NULL OR s.category = ?)
       ORDER BY COALESCE(i.score, -1) DESC, i.published_at DESC LIMIT 200`,
    )
    .all(week, min - 1, cat ?? null, cat ?? null) as (Item & { source_name: string; source_category: string })[];

  const scored = items.filter((i) => i.score !== null).length;
  const t = getDictionary();

  return (
    <div>
      <PageHeader
        kicker={t.radar.kicker}
        title={t.radar.title(week)}
        sub={t.radar.sub(items.length, scored)}
        right={
          <div className="flex gap-1.5">
            {weeks.map((w) => (
              <a
                key={w.week_key}
                href={href({ week: w.week_key })}
                className={`chip ${w.week_key === week ? "!text-ink !border-line-strong" : ""}`}
              >
                {w.week_key.split("-")[1]}
                <span className="text-faint">{w.c}</span>
              </a>
            ))}
          </div>
        }
      />
      <div className="p-8">
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-1.5">
            {[0, 60, 75, 85].map((m) => (
              <a
                key={m}
                href={href({ min: m })}
                className={`chip ${min === m ? "!text-ink !border-line-strong" : ""}`}
              >
                {m === 0 ? t.common.all : t.radar.atLeast(m)}
              </a>
            ))}
          </div>
          <CategoryChips
            options={categories}
            active={cat}
            href={(key) => href({ cat: key ?? null })}
            allLabel={t.common.all}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {items.length ? (
            items.map((i) => <ItemRow key={i.id} item={i} />)
          ) : (
            <div className="card p-6 text-[13px] text-muted">{t.radar.empty}</div>
          )}
        </div>
      </div>
    </div>
  );
}
