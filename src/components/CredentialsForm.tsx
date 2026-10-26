"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteCredential, actionSaveCredential } from "@/lib/actions";
import type { CredentialInfo } from "@/lib/credentials";
import type { ProviderInfo } from "@/lib/llm";
import { useT } from "./I18nProvider";

/**
 * The stored keys of one provider, and a slot to paste a new one. Opens on the
 * provider in use; the picker reaches the others, so a key can be stored
 * before switching to its provider.
 */
export default function CredentialsForm({
  providers,
  current,
  credentials,
  keyIsManaged,
}: {
  providers: ProviderInfo[];
  /** The provider the model settings use now. */
  current: string;
  credentials: CredentialInfo[];
  keyIsManaged: boolean;
}) {
  const [providerId, setProviderId] = useState(current);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useT();
  const router = useRouter();

  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const stored = credentials.filter((c) => c.provider === provider.id);

  function saveKey() {
    setError(null);
    start(async () => {
      const res = await actionSaveCredential({
        scope: "llm",
        provider: provider.id,
        label: "default",
        secret,
      });
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        setSecret("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="w-full sm:w-64">
        <span className="label">{t.model.provider}</span>
        <select
          className="select"
          value={provider.id}
          onChange={(e) => {
            setProviderId(e.target.value);
            setSecret("");
            setError(null);
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <section className="card p-4 sm:p-6">
        <h2 className="kicker mb-2">{t.model.credentialsFor(provider.label)}</h2>
        <p className="text-[12px] text-muted mb-5 leading-relaxed">
          {provider.needsKey ? (
            <>
              {t.model.getKeyAt}{" "}
              <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent">
                {new URL(provider.docsUrl).host}
              </a>
              . {t.model.storedEncrypted}
              {provider.envKeys.length > 0 && (
                <>
                  {" "}
                  {t.model.envFallback}{" "}
                  <code className="font-mono text-[11.5px]">{provider.envKeys.join(" / ")}</code>.
                </>
              )}
            </>
          ) : (
            <>
              {t.model.noKeyNeeded}{" "}
              <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent">{t.model.setupInstructions}</a>
              .
            </>
          )}
        </p>

        {stored.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-5">
            {stored.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-md border border-line">
                <span className="text-[12.5px] flex-1">
                  {c.label} <span className="font-mono text-faint">{c.hint}</span>
                </span>
                <span className="text-[11px] text-faint font-mono">{c.updated_at}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    start(async () => {
                      await actionDeleteCredential(c.id);
                      router.refresh();
                    })
                  }
                  disabled={pending}
                >{t.common.delete}</button>
              </div>
            ))}
          </div>
        )}

        {provider.needsKey && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <span className="label">{provider.keyLabel}</span>
              <input
                className="input font-mono !text-[12px]"
                type="password"
                autoComplete="off"
                placeholder={provider.keyPlaceholder}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={saveKey} disabled={pending || !secret.trim()}>
              {stored.length ? t.model.replaceKey : t.model.saveKey}
            </button>
          </div>
        )}

        {!keyIsManaged && (
          <p className="text-[11.5px] text-faint mt-4 leading-snug">
            {t.model.encryptionKeyBefore} <code className="font-mono">SIGNAL_SECRET_KEY</code>{" "}
            {t.model.encryptionKeyAfter}
          </p>
        )}

        {error && (
          <p className="text-[12px] mt-3" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
