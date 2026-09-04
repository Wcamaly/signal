"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "./CopyButton";
import PostLanguage from "./PostLanguage";
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

export default function PostCard({
  post,
  channel,
  publisherLabel,
  language,
}: {
  post: Post & { source_url?: string | null; source_title?: string | null };
  channel: Channel;
  publisherLabel: string;
  /** Already resolved: the post's own language, or the channel's, or the profile's. */
  language: string;
}) {
  const [body, setBody] = useState(post.body);
  const [editing, setEditing] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
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

  const rendered = renderTemplate(channel.template || "{{body}}", {
    body,
    hook: post.hook ?? "",
    hashtags: hashtags.join(" "),
    angle: post.angle ?? "",
    link: post.source_url ?? "",
    title: post.source_title ?? "",
  });

  const over = body.length > channel.char_limit;
  const isThread = body.includes("\n---\n");
  const tweets = isThread ? body.split("\n---\n").map((t) => t.trim()) : [];
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
      setEditing(false);
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
            {isThread && <span className="chip !text-[10px] !py-0">thread · {tweets.length}</span>}
            <span className="font-mono text-[11px]" style={{ color: over ? "var(--bad)" : "var(--faint)" }}>
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
        <div className="shrink-0 flex gap-1.5">
          <CopyButton text={rendered} label="Copy" className="btn btn-sm" />
          <button className="btn btn-sm" onClick={() => setEditing((e) => !e)} disabled={pending}>
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        {editing ? (
          <>
            <textarea
              className="textarea min-h-[220px] font-sans"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
                Save
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setBody(post.body);
                  setEditing(false);
                }}
              >
                Discard changes
              </button>
            </div>
          </>
        ) : isThread ? (
          <div className="flex flex-col gap-2">
            {tweets.map((t, i) => (
              <div key={i} className="flex gap-3">
                <span className="font-mono text-[11px] text-faint pt-0.5 shrink-0">{i + 1}/</span>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap flex-1">{t}</p>
                <span
                  className="font-mono text-[10.5px] pt-1 shrink-0"
                  style={{ color: t.length > channel.char_limit ? "var(--bad)" : "var(--faint)" }}
                >
                  {t.length}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{body}</p>
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

        {showTemplate && (
          <div className="mt-4 border-t border-line pt-3.5">
            <span className="kicker">What gets published ({channel.label} template)</span>
            <pre className="text-[12.5px] text-muted whitespace-pre-wrap leading-relaxed mt-1.5 font-sans bg-[#0e1013] border border-line rounded-md p-3">
              {rendered}
            </pre>
          </div>
        )}

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
            <button className="btn btn-sm" onClick={() => refine(instruction)} disabled={pending || !instruction}>
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
        <button className="btn btn-ghost btn-sm" onClick={() => setShowTemplate((o) => !o)}>
          {showTemplate ? "Hide template" : "Template preview"}
        </button>
        <div className="flex-1" />
        {post.status !== "published" && (
          <input
            type="datetime-local"
            className="input !w-auto !py-1.5 !text-[12px]"
            defaultValue={post.scheduled_at?.replace(" ", "T").slice(0, 16) ?? ""}
            onChange={(e) => e.target.value && setStatus("scheduled", e.target.value.replace("T", " "))}
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
            <button className="btn btn-primary btn-sm" onClick={() => setStatus("published")} disabled={pending}>
              Mark published
            </button>
          ))}
        {post.status !== "discarded" && (
          <button className="btn btn-ghost btn-sm" onClick={() => setStatus("discarded")} disabled={pending}>
            Discard
          </button>
        )}
        {(post.status === "discarded" || post.status === "published") && (
          <button className="btn btn-ghost btn-sm" onClick={() => setStatus("draft")} disabled={pending}>
            Back to draft
          </button>
        )}
      </div>
    </article>
  );
}
