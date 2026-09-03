"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteChannel, actionSaveChannel, actionSaveCredential } from "@/lib/actions";
import type { CredentialInfo } from "@/lib/credentials";
import type { PublisherInfo } from "@/lib/publishers";
import type { Channel } from "@/lib/types";

type Draft = {
  key: string;
  label: string;
  char_limit: number;
  color: string;
  hint: string;
  template: string;
  publisher: string;
  config: Record<string, string>;
  credential_id: number | null;
  posts_per_run: number;
  enabled: boolean;
  sort_order: number;
};

const BLANK: Draft = {
  key: "",
  label: "",
  char_limit: 1000,
  color: "#8b93a1",
  hint: "",
  template: "{{body}}\n\n{{hashtags}}",
  publisher: "manual",
  config: {},
  credential_id: null,
  posts_per_run: 1,
  enabled: true,
  sort_order: 100,
};

function toDraft(c: Channel): Draft {
  let config: Record<string, string> = {};
  try {
    config = JSON.parse(c.config ?? "{}") as Record<string, string>;
  } catch {
    config = {};
  }
  return {
    key: c.key,
    label: c.label,
    char_limit: c.char_limit,
    color: c.color,
    hint: c.hint ?? "",
    template: c.template ?? "{{body}}",
    publisher: c.publisher,
    config,
    credential_id: c.credential_id,
    posts_per_run: c.posts_per_run,
    enabled: !!c.enabled,
    sort_order: c.sort_order,
  };
}

function Editor({
  initial,
  isNew,
  publishers,
  credentials,
  templateVariables,
  onDone,
}: {
  initial: Draft;
  isNew: boolean;
  publishers: PublisherInfo[];
  credentials: CredentialInfo[];
  templateVariables: { name: string; description: string }[];
  onDone: () => void;
}) {
  const [d, setD] = useState(initial);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const publisher = publishers.find((p) => p.id === d.publisher) ?? publishers[0];
  const linked = credentials.find((c) => c.id === d.credential_id);

  function save() {
    setError(null);
    start(async () => {
      let credentialId = d.credential_id;

      if (secret.trim() && publisher.needsCredential) {
        const cred = await actionSaveCredential({
          scope: "channel",
          provider: publisher.id,
          label: d.key || d.label,
          secret,
        });
        if (!cred.ok) {
          setError(cred.error ?? "Could not store the credential");
          return;
        }
        credentialId = cred.id ?? null;
      }

      const res = await actionSaveChannel({ ...d, credential_id: credentialId });
      if (!res.ok) setError(res.error ?? "Error");
      else {
        setSecret("");
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <div className="px-5 pb-5 border-t border-line pt-4 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3">
        <div>
          <span className="label">Name</span>
          <input className="input" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        </div>
        <div>
          <span className="label">Key</span>
          <input
            className="input font-mono !text-[12px]"
            value={d.key}
            disabled={!isNew}
            onChange={(e) => setD({ ...d, key: e.target.value })}
            placeholder="mastodon"
          />
        </div>
        <div className="w-28">
          <span className="label">Char limit</span>
          <input
            type="number"
            className="input"
            value={d.char_limit}
            onChange={(e) => setD({ ...d, char_limit: Number(e.target.value) })}
          />
        </div>
        <div className="w-24">
          <span className="label">Colour</span>
          <input
            className="input font-mono !text-[11px]"
            value={d.color}
            onChange={(e) => setD({ ...d, color: e.target.value })}
          />
        </div>
      </div>

      <div>
        <span className="label">Format hint (goes into the writer prompt)</span>
        <textarea
          className="textarea min-h-[70px]"
          value={d.hint}
          onChange={(e) => setD({ ...d, hint: e.target.value })}
        />
      </div>

      <div>
        <span className="label">Publication template</span>
        <textarea
          className="textarea min-h-[90px] font-mono !text-[12px]"
          value={d.template}
          onChange={(e) => setD({ ...d, template: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {templateVariables.map((v) => (
            <span key={v.name} className="chip !text-[11px]" title={v.description}>
              <code className="font-mono">{`{{${v.name}}}`}</code>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div>
          <span className="label">Publisher</span>
          <select
            className="select"
            value={d.publisher}
            onChange={(e) => setD({ ...d, publisher: e.target.value, config: {} })}
          >
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <span className="label">Posts per run</span>
          <input
            type="number"
            min={0}
            max={10}
            className="input"
            value={d.posts_per_run}
            onChange={(e) => setD({ ...d, posts_per_run: Number(e.target.value) })}
          />
        </div>
        <label className="chip cursor-pointer !px-3 !py-2 mb-1">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={d.enabled}
            onChange={(e) => setD({ ...d, enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>

      <p className="text-[11.5px] text-faint leading-snug -mt-2">{publisher.help}</p>

      {publisher.configFields.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {publisher.configFields.map((f) => (
            <div key={f.key} className="flex-1 min-w-[220px]">
              <span className="label">{f.label}</span>
              <input
                className="input font-mono !text-[12px]"
                placeholder={f.placeholder}
                value={d.config[f.key] ?? ""}
                onChange={(e) => setD({ ...d, config: { ...d.config, [f.key]: e.target.value } })}
              />
              {f.help && <p className="text-[11px] text-faint mt-1">{f.help}</p>}
            </div>
          ))}
        </div>
      )}

      {publisher.needsCredential && (
        <div>
          <span className="label">
            {publisher.credentialLabel || "Secret"}
            {linked && <span className="font-mono text-faint normal-case"> · stored {linked.hint}</span>}
          </span>
          <input
            className="input font-mono !text-[12px]"
            type="password"
            autoComplete="off"
            placeholder={linked ? "Leave empty to keep the stored one" : "Paste the token"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
      )}

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : isNew ? "Create channel" : "Save"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ChannelManager({
  channels,
  publishers,
  credentials,
  templateVariables,
}: {
  channels: Channel[];
  publishers: PublisherInfo[];
  credentials: CredentialInfo[];
  templateVariables: { name: string; description: string }[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} disabled={creating}>
          New channel
        </button>
      </div>

      {creating && (
        <section className="card overflow-hidden">
          <div className="px-5 pt-4 text-[14px] font-semibold tracking-tight">New channel</div>
          <Editor
            initial={BLANK}
            isNew
            publishers={publishers}
            credentials={credentials}
            templateVariables={templateVariables}
            onDone={() => setCreating(false)}
          />
        </section>
      )}

      {channels.map((c) => (
        <section key={c.key} className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-4">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: c.enabled ? c.color : "var(--faint)" }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-semibold tracking-tight">{c.label}</span>
                <span className="chip !text-[10px] !py-0">{c.publisher}</span>
                {!c.enabled && <span className="chip !text-[10px] !py-0">disabled</span>}
              </div>
              <p className="text-[11.5px] text-faint mt-1">
                {c.char_limit} chars · {c.posts_per_run} post{c.posts_per_run === 1 ? "" : "s"} per run
              </p>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => setEditing((k) => (k === c.key ? null : c.key))}
            >
              {editing === c.key ? "Close" : "Edit"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await actionDeleteChannel(c.key);
                  router.refresh();
                })
              }
            >
              Delete
            </button>
          </div>

          {editing === c.key && (
            <Editor
              initial={toDraft(c)}
              isNew={false}
              publishers={publishers}
              credentials={credentials}
              templateVariables={templateVariables}
              onDone={() => setEditing(null)}
            />
          )}
        </section>
      ))}
    </div>
  );
}
