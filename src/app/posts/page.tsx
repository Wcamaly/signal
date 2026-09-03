import { channelLabel, getChannels } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { publisherCatalog } from "@/lib/publishers";
import PageHeader from "@/components/PageHeader";
import PostCard from "@/components/PostCard";
import type { Post } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES = [
  { key: "draft", label: "Drafts" },
  { key: "approved", label: "Approved" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "discarded", label: "Discarded" },
];

type Search = Promise<{ status?: string; channel?: string }>;

export default async function PostsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const status = sp.status || "draft";
  const channelKey = sp.channel || "all";
  const db = getDb();
  const channels = getChannels();
  const publishers = publisherCatalog();

  const counts = Object.fromEntries(
    (db.prepare("SELECT status, COUNT(*) c FROM posts GROUP BY status").all() as {
      status: string;
      c: number;
    }[]).map((r) => [r.status, r.c]),
  ) as Record<string, number>;

  const where: string[] = ["p.status = ?"];
  const args: unknown[] = [status];
  if (channelKey !== "all") {
    where.push("p.platform = ?");
    args.push(channelKey);
  }

  const posts = db
    .prepare(
      `SELECT p.*, i.url AS source_url, i.title AS source_title
       FROM posts p LEFT JOIN items i ON i.id = p.item_id
       WHERE ${where.join(" AND ")} ORDER BY p.updated_at DESC, p.id DESC`,
    )
    .all(...args) as (Post & { source_url: string | null; source_title: string | null })[];

  const qs = (o: Record<string, string>) =>
    "/posts?" + new URLSearchParams({ status, channel: channelKey, ...o }).toString();

  return (
    <div>
      <PageHeader
        kicker="Publication queue"
        title="Publications"
        sub="Nothing goes out on its own. You review, edit or ask for a rewrite, and only then it is approved."
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
        <div className="flex gap-1.5 flex-wrap">
          <a
            href={qs({ channel: "all" })}
            className={`chip ${channelKey === "all" ? "!text-ink !border-line-strong" : ""}`}
          >
            All
          </a>
          {channels.map((c) => (
            <a
              key={c.key}
              href={qs({ channel: c.key })}
              className={`chip ${channelKey === c.key ? "!text-ink !border-line-strong" : ""}`}
              style={channelKey === c.key ? { color: c.color } : undefined}
            >
              {c.label}
            </a>
          ))}
        </div>
      </div>

      <div className="p-8 flex flex-col gap-4 max-w-[860px]">
        {posts.length ? (
          posts.map((p) => {
            // A post whose channel was deleted still has to render: channelLabel
            // falls back to neutral metadata built from the stored key.
            const channel = channelLabel(channels, p.platform);
            return (
              <PostCard
                key={p.id}
                post={p}
                channel={channel}
                publisherLabel={
                  publishers.find((pub) => pub.id === channel.publisher)?.label ?? "Manual"
                }
              />
            );
          })
        ) : (
          <div className="card p-6 text-[13px] text-muted">
            Nothing in this state. Run the writing stage from the sidebar.
          </div>
        )}
      </div>
    </div>
  );
}
