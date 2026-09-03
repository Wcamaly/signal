import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { renderMarkdown } from "@/lib/md";
import PageHeader from "@/components/PageHeader";
import CopyButton from "@/components/CopyButton";
import { PLATFORM_META, type Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const digest = db.prepare("SELECT * FROM digests WHERE id = ?").get(Number(id)) as
    | { id: number; week_key: string; title: string; subtitle: string; markdown: string; item_ids: string; model: string; created_at: string }
    | undefined;
  if (!digest) notFound();

  const ids = JSON.parse(digest.item_ids || "[]") as number[];
  const items = ids.length
    ? (db
        .prepare(`SELECT id, title, url, score FROM items WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY score DESC`)
        .all(...ids) as { id: number; title: string; url: string; score: number }[])
    : [];

  const posts = db
    .prepare("SELECT id, platform, hook, status FROM posts WHERE digest_id = ? ORDER BY platform")
    .all(digest.id) as { id: number; platform: Platform; hook: string; status: string }[];

  return (
    <div>
      <PageHeader
        kicker={digest.week_key}
        title={digest.title}
        sub={digest.subtitle}
        right={
          <>
            <CopyButton text={digest.markdown} label="Copiar markdown" />
            <Link href="/posts" className="btn btn-primary">
              Ver publicaciones
            </Link>
          </>
        }
      />
      <div className="p-8 grid grid-cols-[minmax(0,1fr)_260px] gap-10 items-start">
        <article
          className="prose-signal max-w-[720px]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(digest.markdown || "") }}
        />

        <aside className="flex flex-col gap-6 sticky top-8">
          <div>
            <h3 className="kicker mb-2.5">Señales usadas ({items.length})</h3>
            <div className="flex flex-col gap-1.5">
              {items.map((i) => (
                <a
                  key={i.id}
                  href={i.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card px-3 py-2.5 text-[12px] leading-snug text-muted hover:text-ink hover:border-line-strong transition-colors flex gap-2.5"
                >
                  <span className="font-mono text-[11px] text-faint shrink-0">{Math.round(i.score ?? 0)}</span>
                  <span className="line-clamp-3">{i.title}</span>
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="kicker mb-2.5">Posts derivados ({posts.length})</h3>
            <div className="flex flex-col gap-1.5">
              {posts.length ? (
                posts.map((p) => (
                  <Link
                    key={p.id}
                    href="/posts"
                    className="card px-3 py-2.5 text-[12px] text-muted hover:text-ink hover:border-line-strong transition-colors"
                  >
                    <span style={{ color: PLATFORM_META[p.platform]?.color }} className="font-medium">
                      {PLATFORM_META[p.platform]?.label}
                    </span>
                    <span className="text-faint"> · {p.status}</span>
                    <div className="line-clamp-2 mt-1 leading-snug">{p.hook}</div>
                  </Link>
                ))
              ) : (
                <p className="text-[12px] text-faint">Sin posts. Corré la etapa de redacción.</p>
              )}
            </div>
          </div>

          <div className="text-[11px] text-faint font-mono border-t border-line pt-3">
            {digest.model}
            <br />
            {digest.created_at} UTC
          </div>
        </aside>
      </div>
    </div>
  );
}
