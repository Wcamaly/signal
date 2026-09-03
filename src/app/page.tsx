import Link from "next/link";
import { channelLabel, getChannels } from "@/lib/channels";
import { getDb, weekKey } from "@/lib/db";
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

  const lastRun = db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 1").get() as
    | { kind: string; status: string; log: string; started_at: string }
    | undefined;

  return (
    <div>
      <PageHeader
        kicker={`Week ${week}`}
        title="Dashboard"
        sub="State of the radar, the digest and the publication queue."
      />

      <div className="p-8 flex flex-col gap-7">
        {!status.ready && (
          <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--warn)" }}>
            <div className="text-[13px] font-medium mb-1">Demo mode</div>
            <p className="text-[12.5px] text-muted leading-relaxed">
              {status.reason} Ingest works either way, but curation, the digest and the posts come out as
              filler text. Pick a provider and paste a key under{" "}
              <Link href="/settings/model" className="text-accent">
                Model &amp; keys
              </Link>
              .
            </p>
          </div>
        )}

        <section className="grid grid-cols-6 gap-3">
          <Stat n={items} label="Items this week" href="/radar" />
          <Stat n={selected} label="Selected signals" href="/radar" />
          <Stat n={drafts} label="Drafts to review" href="/posts" />
          <Stat n={approved} label="Approved / scheduled" href="/posts" />
          <Stat n={published} label="Published" href="/posts" />
          <Stat n={sources} label="Active sources" href="/sources" />
        </section>

        <div className="grid grid-cols-[1.15fr_1fr] gap-7 items-start">
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="kicker">Digest of this week</h2>
              <Link href="/digest" className="text-[12px] text-muted hover:text-ink">
                See all →
              </Link>
            </div>
            {digest ? (
              <Link href={`/digest/${digest.id}`} className="card p-5 block hover:border-line-strong transition-colors">
                <div className="text-[16px] font-semibold tracking-tight leading-snug">{digest.title}</div>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">{digest.subtitle}</p>
                <div className="text-[11px] text-faint mt-4 font-mono">{digest.created_at} UTC</div>
              </Link>
            ) : (
              <div className="card p-5 text-[13px] text-muted">
                No digest for {week} yet. Run the pipeline from the sidebar.
              </div>
            )}

            <h2 className="kicker mt-7 mb-3">Approval queue</h2>
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
                <div className="card p-5 text-[13px] text-muted">No pending drafts.</div>
              )}
            </div>
          </section>

          <section>
            <h2 className="kicker mb-3">Top signals</h2>
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
                <div className="card p-5 text-[13px] text-muted">
                  No scored signals yet. Run ingest + curate.
                </div>
              )}
            </div>

            {lastRun && (
              <>
                <h2 className="kicker mt-7 mb-3">Last run</h2>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: lastRun.status === "ok" ? "var(--good)" : "var(--bad)" }}
                    />
                    <span className="text-[12px] font-mono text-muted">
                      {lastRun.kind} · {lastRun.started_at}
                    </span>
                  </div>
                  <pre className="text-[11.5px] font-mono text-faint whitespace-pre-wrap leading-relaxed max-h-40 overflow-auto">
                    {lastRun.log}
                  </pre>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
