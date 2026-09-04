"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "./CopyButton";
import PostEditor from "./PostEditor";
import PostLanguage from "./PostLanguage";
import PostMedia from "./PostMedia";
import PostPreview from "./PostPreview";
import {
  actionPublishPost,
  actionRefinePost,
  actionSetPostStatus,
  actionUpdatePost,
} from "@/lib/actions";
import { renderTemplate } from "@/lib/template";
import type { Channel, Post } from "@/lib/types";

const QUICK = [
  "Shorter and sharper",
  "More technical, for someone who deploys this",
  "Change the hook, this one does not land",
  "Drop the sales tone",
  "Take the position against the consensus",
];

const TABS = [
  { key: "edit", label: "Edit" },
  { key: "preview", label: "Preview" },
  { key: "template", label: "Template" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function PostCard({
  post,
  channel,
  publisherLabel,
  language,
  author,
  avatar,
  handle,
}: {
  post: Post & {
    source_url?: string | null;
    source_title?: string | null;
    source_image?: string | null;
  };
  channel: Channel;
  publisherLabel: string;
  /** Already resolved: the post's own language, or the channel's, or the profile's. */
  language: string;
  author: string;
  avatar: string | null;
  handle: string | null;
}) {
  const [body, setBody] = useState(post.body);
  const [tab, setTab] = useState<Tab>("edit");
  const [refineOpen, setRefineOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const hashtags = (() => {
    try {
      return JSON.parse(post.hashtags ?? "[]") as string[];
    } catch {
      return [];
    }
  })();

  const link = post.link ?? post.source_url ?? null;

  const rendered = renderTemplate(channel.template || "{{body}}", {
    body,
    hook: post.hook ?? "",
    hashtags: hashtags.join(" "),
    angle: post.angle ?? "",
    link: link ?? "",
    title: post.link_title ?? post.source_title ?? "",
  });

  // A link that was unfurled has its own card; a link that is still the source
  // signal's already has one in `items`, fetched at ingest.
  const linkCard = post.link_title
    ? { title: post.link_title, image: post.link_image ?? null }
    : post.source_title && link === post.source_url
      ? { title: post.source_title, image: post.source_image ?? null }
      : null;

  const over = body.length > channel.char_limit;
  const isThread = body.includes("\n---\n");
  const threadLength = isThread ? body.split("\n---\n").filter((t) => t.trim()).length : 0;
  const canPublish = channel.publisher !== "manual";

  function setStatus(s: string, when?: string) {
    start(async () => {
      await actionSetPostStatus(post.id, s, when);
      router.refresh();
    });
  }

  function save() {
    start(async () => {
      await actionUpdatePost(post.id, { body });
      router.refresh();
    });
  }

  function refine(text: string) {
    setError(null);
    start(async () => {
      const res = await actionRefinePost(post.id, text);
      if (!res.ok) setError(res.error ?? "Error");
      else {
        setRefineOpen(false);
        setInstruction("");
        router.refresh();
      }
    });
  }

  function publish() {
    setError(null);
    start(async () => {
      const res = await actionPublishPost(post.id);
      if (!res.ok) setError(res.error ?? "Error");
      router.refresh();
    });
  }

  return (
    <article className="card overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4 border-b border-line">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            <span className="text-[12px] font-semibold" style={{ color: channel.color }}>
              {channel.label}
            </span>
            {isThread && <span className="chip !text-[10px] !py-0">thread · {threadLength}</span>}
            <span
              className="font-mono text-[11px]"
              style={{ color: over ? "var(--bad)" : "var(--faint)" }}
            >
              {body.length}/{channel.char_limit}
            </span>
            <span className="chip !text-[10px] !py-0">{post.status}</span>
            <PostLanguage postId={post.id} language={language} />
            {post.scheduled_at && (
              <span className="chip !text-[10px] !py-0" style={{ color: "var(--accent)" }}>
                {post.scheduled_at}
              </span>
            )}
            {post.published_url && (
              <a
                href={post.published_url}
                target="_blank"
                rel="noopener noreferrer"
                className="chip !text-[10px] !py-0 hover:!text-ink"
              >
                live ↗
              </a>
            )}
          </div>
          {post.angle && <p className="text-[12px] text-muted leading-snug">{post.angle}</p>}
        </div>
        <div className="shrink-0">
          <CopyButton text={rendered} label="Copy" className="btn btn-sm" />
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex gap-1.5 mb-3.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`chip ${tab === t.key ? "!text-ink !border-line-strong !bg-[#1e2228]" : "hover:!text-ink"}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "edit" && (
          <PostEditor
            value={body}
            onChange={setBody}
            onSave={save}
            onDiscard={() => setBody(post.body)}
            dirty={body !== post.body}
            pending={pending}
          />
        )}

        {tab === "preview" && (
          <PostPreview
            channel={channel}
            author={author}
            avatar={avatar}
            handle={handle}
            text={rendered}
            hashtags={hashtags}
            image={post.image_url ?? null}
            imageAlt={post.image_alt ?? null}
            link={link}
            linkCard={linkCard}
          />
        )}

        {tab === "template" && (
          <div>
            <span className="kicker">What gets published ({channel.label} template)</span>
            <pre className="text-[12.5px] text-muted whitespace-pre-wrap leading-relaxed mt-1.5 font-sans bg-[#0e1013] border border-line rounded-md p-3">
              {rendered}
            </pre>
          </div>
        )}

        {!!hashtags.length && (
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {hashtags.map((h) => (
              <span key={h} className="chip !text-[11px]">
                {h}
              </span>
            ))}
          </div>
        )}

        {post.visual_brief && (
          <div className="mt-4 border-t border-line pt-3.5">
            <span className="kicker">Visual brief</span>
            <pre className="text-[12px] text-muted whitespace-pre-wrap leading-relaxed mt-1.5 font-sans">
              {post.visual_brief}
            </pre>
          </div>
        )}

        <PostMedia post={post} sourceImage={post.source_image ?? null} />

        {post.source_url && (
          <a
            href={post.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11.5px] text-faint hover:text-accent mt-3.5 block truncate"
          >
            Source: {post.source_title}
          </a>
        )}
      </div>

      {refineOpen && (
        <div className="px-5 pb-4">
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {QUICK.map((q) => (
              <button
                key={q}
                className="chip hover:!text-ink hover:!border-line-strong"
                onClick={() => refine(q)}
                disabled={pending}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Or write your own instruction…"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && instruction && refine(instruction)}
            />
            <button
              className="btn btn-sm"
              onClick={() => refine(instruction)}
              disabled={pending || !instruction}
            >
              {pending ? "…" : "Rewrite"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="px-5 pb-3 text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="px-5 py-3 border-t border-line flex items-center gap-2 flex-wrap bg-[#0f1113]">
        <button className="btn btn-sm" onClick={() => setRefineOpen((o) => !o)} disabled={pending}>
          Ask for a rewrite
        </button>
        <div className="flex-1" />
        {post.status !== "published" && (
          <input
            type="datetime-local"
            className="input !w-auto !py-1.5 !text-[12px]"
            defaultValue={post.scheduled_at?.replace(" ", "T").slice(0, 16) ?? ""}
            onChange={(e) =>
              e.target.value && setStatus("scheduled", e.target.value.replace("T", " "))
            }
          />
        )}
        {post.status === "draft" && (
          <button className="btn btn-sm" onClick={() => setStatus("approved")} disabled={pending}>
            Approve
          </button>
        )}
        {post.status !== "published" &&
          (canPublish ? (
            <button className="btn btn-primary btn-sm" onClick={publish} disabled={pending}>
              {pending ? "Publishing…" : `Publish via ${publisherLabel}`}
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setStatus("published")}
              disabled={pending}
            >
              Mark published
            </button>
          ))}
        {post.status !== "discarded" && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setStatus("discarded")}
            disabled={pending}
          >
            Discard
          </button>
        )}
        {(post.status === "discarded" || post.status === "published") && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setStatus("draft")}
            disabled={pending}
          >
            Back to draft
          </button>
        )}
      </div>
    </article>
  );
}
