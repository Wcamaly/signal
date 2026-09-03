import { getDb } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import PostCard from "@/components/PostCard";
import { PLATFORMS, PLATFORM_META, type Post } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES = [
  { key: "draft", label: "Borradores" },
  { key: "approved", label: "Aprobados" },
  { key: "scheduled", label: "Agendados" },
  { key: "published", label: "Publicados" },
  { key: "discarded", label: "Descartados" },
];

type Search = Promise<{ status?: string; platform?: string }>;

export default async function PostsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const status = sp.status || "draft";
  const platform = sp.platform || "all";
  const db = getDb();

  const counts = Object.fromEntries(
    (db.prepare("SELECT status, COUNT(*) c FROM posts GROUP BY status").all() as { status: string; c: number }[]).map(
      (r) => [r.status, r.c],
    ),
  ) as Record<string, number>;

  const where: string[] = ["p.status = ?"];
  const args: unknown[] = [status];
  if (platform !== "all") {
    where.push("p.platform = ?");
    args.push(platform);
  }

  const posts = db
    .prepare(
      `SELECT p.*, i.url AS source_url, i.title AS source_title
       FROM posts p LEFT JOIN items i ON i.id = p.item_id
       WHERE ${where.join(" AND ")} ORDER BY p.updated_at DESC, p.id DESC`,
    )
    .all(...args) as (Post & { source_url: string | null; source_title: string | null })[];

  const qs = (o: Record<string, string>) =>
    "/posts?" + new URLSearchParams({ status, platform, ...o }).toString();

  return (
    <div>
      <PageHeader
        kicker="Cola de publicación"
        title="Publicaciones"
        sub="Nada sale solo. Revisás, editás o pedís una reescritura, y recién ahí se aprueba."
      />

      <div className="px-8 py-4 border-b border-line flex items-center gap-4 flex-wrap">
        <div className="flex gap-1.5">
          {STATUSES.map((s) => (
            <a
              key={s.key}
              href={qs({ status: s.key })}
              className={`chip ${status === s.key ? "!text-ink !border-line-strong !bg-[#1e2228]" : ""}`}
            >
              {s.label}
              <span className="text-faint">{counts[s.key] ?? 0}</span>
            </a>
          ))}
        </div>
        <div className="w-px h-4 bg-[var(--border)]" />
        <div className="flex gap-1.5">
          <a href={qs({ platform: "all" })} className={`chip ${platform === "all" ? "!text-ink !border-line-strong" : ""}`}>
            Todas
          </a>
          {PLATFORMS.map((p) => (
            <a
              key={p}
              href={qs({ platform: p })}
              className={`chip ${platform === p ? "!text-ink !border-line-strong" : ""}`}
              style={platform === p ? { color: PLATFORM_META[p].color } : undefined}
            >
              {PLATFORM_META[p].label}
            </a>
          ))}
        </div>
      </div>

      <div className="p-8 flex flex-col gap-4 max-w-[860px]">
        {posts.length ? (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        ) : (
          <div className="card p-6 text-[13px] text-muted">
            No hay publicaciones en este estado. Corré la etapa de redacción desde la barra lateral.
          </div>
        )}
      </div>
    </div>
  );
}
