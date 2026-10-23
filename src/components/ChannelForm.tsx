"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionDeleteChannel, actionSaveChannel, actionSaveCredential } from "@/lib/actions";
import type { ChannelDraft } from "@/lib/channel-draft";
import type { CredentialInfo } from "@/lib/credentials";
import type { PublisherInfo } from "@/lib/publishers";
import type { DigestDef } from "@/lib/types";
import { useT } from "./I18nProvider";
import LanguageSelect from "./LanguageSelect";

const LIST = "/manage/channels";

/**
 * One channel: create (`isNew`, the key is typed once) or edit. A pasted
 * secret is stored as a credential first and linked on save.
 */
export default function ChannelForm({
  initial,
  isNew,
  publishers,
  credentials,
  templateVariables,
  defs,
}: {
  initial: ChannelDraft;
  isNew: boolean;
  publishers: PublisherInfo[];
  credentials: CredentialInfo[];
  templateVariables: { name: string; description: string }[];
  defs: DigestDef[];
}) {
  const [d, setD] = useState(initial);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const publisher = publishers.find((p) => p.id === d.publisher) ?? publishers[0];
  const linked = credentials.find((c) => c.id === d.credential_id);

  function done() {
    router.push(LIST);
    router.refresh();
  }

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
          setError(cred.error ?? t.channels.credentialError);
          return;
        }
        credentialId = cred.id ?? null;
      }

      const res = await actionSaveChannel({ ...d, credential_id: credentialId });
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  function remove() {
    if (!confirm(t.channels.confirmDelete(initial.label))) return;
    setError(null);
    start(async () => {
      const res = await actionDeleteChannel(initial.key);
      if (!res.ok) setError(res.error ?? t.common.error);
      else done();
    });
  }

  return (
    <section className="card p-6 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3">
        <div>
          <span className="label">{t.channels.name}</span>
          <input className="input" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        </div>
        <div>
          <span className="label">{t.channels.key}</span>
          <input
            className="input font-mono !text-[12px]"
            value={d.key}
            disabled={!isNew}
            onChange={(e) => setD({ ...d, key: e.target.value })}
            placeholder="mastodon"
          />
        </div>
        <div className="w-28">
          <span className="label">{t.channels.charLimit}</span>
          <input
            type="number"
            className="input"
            value={d.char_limit}
            onChange={(e) => setD({ ...d, char_limit: Number(e.target.value) })}
          />
        </div>
        <div className="w-24">
          <span className="label">{t.channels.colour}</span>
          <input
            className="input font-mono !text-[11px]"
            value={d.color}
            onChange={(e) => setD({ ...d, color: e.target.value })}
          />
        </div>
      </div>

      <div>
        <span className="label">{t.channels.formatHint}</span>
        <textarea
          className="textarea min-h-[70px]"
          value={d.hint}
          onChange={(e) => setD({ ...d, hint: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="label">{t.channels.language}</span>
          <LanguageSelect
            value={d.language}
            onChange={(language) => setD({ ...d, language })}
            inheritLabel={t.channels.inherit}
          />
          <p className="text-[11px] text-faint mt-1">{t.channels.languageHint}</p>
        </div>
        <div>
          <span className="label">{t.channels.sourceDigest}</span>
          <select
            className="select"
            value={d.digest_def}
            onChange={(e) => setD({ ...d, digest_def: e.target.value })}
          >
            {/* General is the empty value: an unbound channel follows it. Then
                every enabled definition, plus the one already bound. */}
            {defs
              .filter((x) => x.key === "general" || x.enabled || x.key === d.digest_def)
              .map((x) => (
                <option key={x.key} value={x.key === "general" ? "" : x.key}>
                  {x.label} · {t.digestDefs.cadences[x.cadence]}
                </option>
              ))}
            {/* Bound to a definition that no longer exists: keep the saved
                value visible instead of the select silently showing General. */}
            {d.digest_def && !defs.some((x) => x.key === d.digest_def) && (
              <option value={d.digest_def}>{t.channels.deletedDigest(d.digest_def)}</option>
            )}
          </select>
          <p className="text-[11px] text-faint mt-1">{t.channels.sourceDigestHint}</p>
        </div>
        {!publisher.configFields.some((f) => f.key === "handle") && (
          <div>
            <span className="label">{t.channels.handle}</span>
            <input
              className="input font-mono !text-[12px]"
              placeholder="@you"
              value={d.config.handle ?? ""}
              onChange={(e) => setD({ ...d, config: { ...d.config, handle: e.target.value } })}
            />
            <p className="text-[11px] text-faint mt-1">{t.channels.handleHint}</p>
          </div>
        )}
      </div>

      <div>
        <span className="label">{t.channels.template}</span>
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
          <span className="label">{t.channels.publisher}</span>
          <select
            className="select"
            value={d.publisher}
            onChange={(e) =>
              setD({
                ...d,
                publisher: e.target.value,
                // Publisher options are per publisher, but the preview handle is not.
                config: d.config.handle ? { handle: d.config.handle } : {},
              })
            }
          >
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <span className="label">{t.channels.postsPerRun}</span>
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
          {t.common.enabled}
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
            {publisher.credentialLabel || t.channels.secret}
            {linked && (
              <span className="font-mono text-faint normal-case">
                {t.channels.storedHint(linked.hint ?? "")}
              </span>
            )}
          </span>
          <input
            className="input font-mono !text-[12px]"
            type="password"
            autoComplete="off"
            placeholder={linked ? t.channels.keepStored : t.channels.pasteToken}
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

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? t.common.saving : isNew ? t.channels.createChannel : t.common.save}
        </button>
        <Link href={LIST} className="btn btn-ghost">
          {t.common.cancel}
        </Link>
        {!isNew && (
          <button className="btn btn-ghost ml-auto" onClick={remove} disabled={pending}>
            {t.common.delete}
          </button>
        )}
      </div>
    </section>
  );
}
