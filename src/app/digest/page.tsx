import Link from "next/link";
import { getDb } from "@/lib/db";
import { digestDefLabel, getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { cadenceOf, periodRange } from "@/lib/periods";
import PageHeader from "@/components/PageHeader";
import CategoryChips from "@/components/CategoryChips";

export const dynamic = "force-dynamic";

type Search = Promise<{ def?: string | string[] }>;

/** Start of a period, for sorting; an unreadable key sorts last. */
function periodStart(key: string): number {
  try {
    return periodRange(key).start.getTime();
  } catch {
    return 0;
  }
}

export default async function DigestList({ searchParams }: { searchParams: Search }) {
  // `?def=<key>` filters by definition; no param is every digest.
  const sp = await searchParams;
  const def = typeof sp.def === "string" && sp.def ? sp.def : undefined;
  const t = getDictionary();
  const db = getDb();
  const defs = getDigestDefs();
  const order = (key: string) => defs.find((d) => d.key === key)?.sort_order ?? 999;
  const digests = (
    db
      .prepare(
        `SELECT id, def_key, period_key, title, subtitle, created_at, model FROM digests
         WHERE (? IS NULL OR def_key = ?)`,
      )
      .all(def ?? null, def ?? null) as {
      id: number;
      def_key: string;
      period_key: string;
      title: string;
      subtitle: string;
      created_at: string;
      model: string;
    }[]
  ).sort((a, b) => periodStart(b.period_key) - periodStart(a.period_key) || order(a.def_key) - order(b.def_key));

  // Every enabled definition, plus any key that has digests — a disabled or
  // deleted definition's archive stays reachable.
  const written = (db.prepare("SELECT DISTINCT def_key FROM digests").all() as { def_key: string }[]).map(
    (r) => r.def_key,
  );
  const options = [
    ...defs.filter((d) => d.enabled || written.includes(d.key)),
    ...written.filter((k) => !defs.some((d) => d.key === k)).map((k) => digestDefLabel(defs, k)),
  ].map((d) => ({ key: d.key, label: d.label }));

  return (
    <div>
      <PageHeader kicker={t.digestList.kicker} title={t.digestList.title} sub={t.digestList.sub} />
      <div className="p-8 flex flex-col gap-2 max-w-3xl">
        <div className="mb-2">
          <CategoryChips
            options={options}
            active={def}
            href={(key) => (key === undefined ? "/digest" : `/digest?def=${encodeURIComponent(key)}`)}
            allLabel={t.common.all}
          />
        </div>
        {digests.length ? (
          digests.map((d) => {
            const meta = digestDefLabel(defs, d.def_key);
            // The period key says what the digest was; the definition may
            // have changed cadence since.
            const cadence = cadenceOf(d.period_key) ?? meta.cadence;
            return (
              <Link key={d.id} href={`/digest/${d.id}`} className="card p-5 hover:border-line-strong transition-colors">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-mono text-[11px] text-faint">{d.period_key}</span>
                  <span className="chip !text-[10px] !py-0">{meta.label}</span>
                  <span className="chip !text-[10px] !py-0">{t.digestDefs.cadences[cadence]}</span>
                  <span className="text-[15.5px] font-semibold tracking-tight">{d.title}</span>
                </div>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">{d.subtitle}</p>
                <div className="text-[11px] text-faint mt-3 font-mono">{d.model}</div>
              </Link>
            );
          })
        ) : (
          <div className="card p-6 text-[13px] text-muted">{t.digestList.empty}</div>
        )}
      </div>
    </div>
  );
}
