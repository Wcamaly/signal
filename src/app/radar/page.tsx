import { getDb, weekKey } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import ItemRow from "@/components/ItemRow";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

type Search = Promise<{ week?: string; min?: string }>;

export default async function RadarPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const db = getDb();
  const week = sp.week || weekKey();
  const min = Number(sp.min ?? 0);

  const weeks = db
    .prepare(
      "SELECT week_key, COUNT(*) c FROM items WHERE week_key IS NOT NULL GROUP BY week_key ORDER BY week_key DESC LIMIT 8",
    )
    .all() as { week_key: string; c: number }[];

  const items = db
    .prepare(
      `SELECT i.*, s.name AS source_name, s.category AS source_category
       FROM items i LEFT JOIN sources s ON s.id = i.source_id
       WHERE i.week_key = ? AND COALESCE(i.score, -1) >= ?
       ORDER BY COALESCE(i.score, -1) DESC, i.published_at DESC LIMIT 200`,
    )
    .all(week, min - 1) as (Item & { source_name: string; source_category: string })[];

  const scored = items.filter((i) => i.score !== null).length;

  return (
    <div>
      <PageHeader
        kicker="Radar"
        title={`Signals of ${week}`}
        sub={`${items.length} items · ${scored} scored by the curator. The score measures how publishable something is for your audience, not how important the news is.`}
        right={
          <div className="flex gap-1.5">
            {weeks.map((w) => (
              <a
                key={w.week_key}
                href={`/radar?week=${w.week_key}`}
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
        <div className="flex gap-1.5 mb-4">
          {[0, 60, 75, 85].map((m) => (
            <a
              key={m}
              href={`/radar?week=${week}&min=${m}`}
              className={`chip ${min === m ? "!text-ink !border-line-strong" : ""}`}
            >
              {m === 0 ? "All" : `≥ ${m}`}
            </a>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {items.length ? (
            items.map((i) => <ItemRow key={i.id} item={i} />)
          ) : (
            <div className="card p-6 text-[13px] text-muted">
              No items for this week. Run the ingest stage from the sidebar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
