import Link from "next/link";
import { channelLabel, getChannels } from "@/lib/channels";
import { getDb, weekKey } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import { seedSources } from "@/lib/ingest";
import { llmStatus } from "@/lib/llm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

function Stat({ n, label, href }: { n: number | string; label: string; href?: string }) {
  const body = (
    <div className="card p-4 hover:border-line-strong transition-colors">
      <div className="text-[26px] font-semibold tracking-tight leading-none">{n}</div>
      <div className="text-[12px] text-muted mt-2">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Dashboard() {
  const db = getDb();
  seedSources();
  const week = weekKey();
  const channels = getChannels();
  const status = llmStatus();
  const t = getDictionary();

  const count = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { c: number }).c;

  const items = count("SELECT COUNT(*) c FROM items WHERE week_key = ?", week);
  const selected = count(
    "SELECT COUNT(*) c FROM items WHERE week_key = ? AND status IN ('selected','used')",
    week,
  );
  const drafts = count("SELECT COUNT(*) c FROM posts WHERE status = 'draft'");
  const approved = count("SELECT COUNT(*) c FROM posts WHERE status IN ('approved','scheduled')");
  const published = count("SELECT COUNT(*) c FROM posts WHERE status = 'published'");
  const sources = count("SELECT COUNT(*) c FROM sources WHERE enabled = 1");

  const digest = db.prepare("SELECT * FROM digests WHERE week_key = ?").get(week) as
    | { id: number; title: string; subtitle: string; created_at: string }
    | undefined;

  const topItems = db
    .prepare(
      "SELECT id, title, url, score, angle, cluster FROM items WHERE week_key = ? AND score IS NOT NULL ORDER BY score DESC LIMIT 6",
    )
    .all(week) as { id: number; title: string; url: string; score: number; angle: string; cluster: string }[];

  const queue = db
    .prepare("SELECT id, platform, hook, body, status FROM posts WHERE status = 'draft' ORDER BY id DESC LIMIT 5")
    .all() as { id: number; platform: string; hook: string; body: string; status: string }[];

  // One row per stage, so the last run of the pipeline is the last few rows.
  const recentRuns = db
    .prepare("SELECT id, kind, status, log, started_at FROM runs ORDER BY id DESC LIMIT 4")
    .all() as { id: number; kind: string; status: string; log: string | null; started_at: string }[];

  return (
    <div>
      <PageHeader kicker={t.dashboard.kicker(week)} title={t.dashboard.title} sub={t.dashboard.sub} />

      <div className="p-8 flex flex-col gap-7">
        {!status.ready && (
          <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--warn)" }}>
            <div className="text-[13px] font-medium mb-1">{t.dashboard.demoTitle}</div>
            <p className="text-[12.5px] text-muted leading-relaxed">
              {status.reason} {t.dashboard.demoBody}{" "}
              <Link href="/settings/model" className="text-accent">
                {t.nav.model}
              </Link>
              .
            </p>
          </div>
        )}

        <section className="grid grid-cols-6 gap-3">
          <Stat n={items} label={t.dashboard.stats.items} href="/radar" />
          <Stat n={selected} label={t.dashboard.stats.selected} href="/radar" />
          <Stat n={drafts} label={t.dashboard.stats.drafts} href="/posts" />
          <Stat n={approved} label={t.dashboard.stats.approved} href="/posts" />
          <Stat n={published} label={t.dashboard.stats.published} href="/posts" />
          <Stat n={sources} label={t.dashboard.stats.sources} href="/sources" />
        </section>

        <div className="grid grid-cols-[1.15fr_1fr] gap-7 items-start">
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="kicker">{t.dashboard.digestOfWeek}</h2>
              <Link href="/digest" className="text-[12px] text-muted hover:text-ink">
                {t.dashboard.seeAll}
              </Link>
            </div>
            {digest ? (
              <Link href={`/digest/${digest.id}`} className="card p-5 block hover:border-line-strong transition-colors">
                <div className="text-[16px] font-semibold tracking-tight leading-snug">{digest.title}</div>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">{digest.subtitle}</p>
                <div className="text-[11px] text-faint mt-4 font-mono">{digest.created_at} UTC</div>
              </Link>
            ) : (
              <div className="card p-5 text-[13px] text-muted">{t.dashboard.noDigest(week)}</div>
            )}

            <h2 className="kicker mt-7 mb-3">{t.dashboard.approvalQueue}</h2>
            <div className="flex flex-col gap-2">
              {queue.length ? (
                queue.map((p) => {
                  const channel = channelLabel(channels, p.platform);
                  return (
                    <Link
                      key={p.id}
                      href="/posts"
                      className="card px-4 py-3 flex items-start gap-3 hover:border-line-strong transition-colors"
                    >
                      <span className="chip shrink-0 mt-0.5" style={{ color: channel.color }}>
                        {channel.label}
                      </span>
                      <span className="text-[13px] leading-snug line-clamp-2 text-muted">
                        {p.hook || p.body.slice(0, 120)}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <div className="card p-5 text-[13px] text-muted">{t.dashboard.noDrafts}</div>
              )}
            </div>
          </section>

          <section>
            <h2 className="kicker mb-3">{t.dashboard.topSignals}</h2>
            <div className="flex flex-col gap-2">
              {topItems.length ? (
                topItems.map((i) => (
                  <div key={i.id} className="card px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span
                        className="font-mono text-[12px] font-semibold shrink-0 w-7 text-right"
                        style={{ color: i.score >= 80 ? "var(--accent)" : "var(--faint)" }}
                      >
                        {Math.round(i.score)}
                      </span>
                      <div className="min-w-0">
                        <a
                          href={i.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] leading-snug hover:text-accent block"
                        >
                          {i.title}
                        </a>
                        {i.angle && <p className="text-[12px] text-faint mt-1.5 leading-snug">{i.angle}</p>}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card p-5 text-[13px] text-muted">{t.dashboard.noSignals}</div>
              )}
            </div>

            {recentRuns.length > 0 && (
              <>
                <h2 className="kicker mt-7 mb-3">{t.dashboard.recentRuns}</h2>
                <div className="card p-4 flex flex-col gap-3">
                  {recentRuns.map((r, i) => (
                    <div key={r.id} className={i ? "border-t border-line pt-3" : ""}>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background:
                              r.status === "ok"
                                ? "var(--good)"
                                : r.status === "error"
                                  ? "var(--bad)"
                                  : "var(--warn)",
                          }}
                        />
                        <span className="text-[12px] font-mono text-muted">
                          {r.kind} · {r.started_at}
                        </span>
                      </div>
                      {r.log && (
                        <pre className="text-[11.5px] font-mono text-faint whitespace-pre-wrap leading-relaxed max-h-28 overflow-auto">
                          {r.log}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
