"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteCredential, actionSaveCredential, actionSaveLlmConfig, actionTestLlm } from "@/lib/actions";
import type { CredentialInfo } from "@/lib/credentials";
import type { LlmConfig, ProviderInfo } from "@/lib/llm";
import type { LlmStatus } from "@/lib/llm";

export default function ModelForm({
  providers,
  config: initial,
  status,
  credentials,
  keyIsManaged,
}: {
  providers: ProviderInfo[];
  config: LlmConfig;
  status: LlmStatus;
  credentials: CredentialInfo[];
  keyIsManaged: boolean;
}) {
  const [cfg, setCfg] = useState(initial);
  const [secret, setSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const provider = useMemo(
    () => providers.find((p) => p.id === cfg.provider) ?? providers[0],
    [providers, cfg.provider],
  );
  const stored = credentials.filter((c) => c.provider === provider.id);

  function selectProvider(id: string) {
    const next = providers.find((p) => p.id === id);
    if (!next) return;
    setTest(null);
    setCfg((c) => ({ ...c, provider: id, model: next.defaultModel, baseUrl: next.defaultBaseUrl }));
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveLlmConfig(cfg);
      if (!res.ok) setError(res.error ?? "Error");
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  }

  function saveKey() {
    setError(null);
    start(async () => {
      const res = await actionSaveCredential({
        scope: "llm",
        provider: provider.id,
        label: "default",
        secret,
      });
      if (!res.ok) setError(res.error ?? "Error");
      else {
        setSecret("");
        router.refresh();
      }
    });
  }

  function runTest() {
    setTest(null);
    start(async () => {
      setTest(await actionTestLlm());
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="card p-4 flex items-center gap-3">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: status.ready ? "var(--good)" : "var(--warn)" }}
        />
        <div className="text-[12.5px] text-muted">
          {status.ready ? (
            <>
              Active: <span className="font-mono text-ink">{status.provider}/{status.model}</span>
              {status.keyFrom === "env" && " · key read from the environment"}
            </>
          ) : (
            status.reason
          )}
        </div>
      </div>

      <section className="card p-6">
        <h2 className="kicker mb-5">Provider</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="label">Provider</span>
            <select className="select" value={cfg.provider} onChange={(e) => selectProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Model</span>
            <input
              className="input"
              list="model-suggestions"
              value={cfg.model}
              onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
              placeholder={provider.defaultModel || "model id"}
            />
            <datalist id="model-suggestions">
              {provider.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>

        {provider.note && <p className="text-[11.5px] text-faint mt-3 leading-snug">{provider.note}</p>}

        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 mt-5">
          <div>
            <span className="label">Base URL</span>
            <input
              className="input font-mono !text-[12px]"
              value={cfg.baseUrl}
              onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))}
            />
          </div>
          <div>
            <span className="label">Temperature</span>
            <input
              type="number"
              step="0.1"
              min={0}
              max={2}
              className="input"
              value={cfg.temperature}
              onChange={(e) => setCfg((c) => ({ ...c, temperature: Number(e.target.value) }))}
            />
          </div>
          <div>
            <span className="label">Max tokens</span>
            <input
              type="number"
              min={512}
              max={64000}
              step={512}
              className="input"
              value={cfg.maxTokens}
              onChange={(e) => setCfg((c) => ({ ...c, maxTokens: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button className="btn btn-primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button className="btn" onClick={runTest} disabled={pending}>
            Test connection
          </button>
          {saved && (
            <span className="text-[12.5px]" style={{ color: "var(--good)" }}>
              Saved ✓
            </span>
          )}
        </div>

        {test && (
          <p
            className="text-[12.5px] mt-3 leading-snug"
            style={{ color: test.ok ? "var(--good)" : "var(--bad)" }}
          >
            {test.ok ? `✓ ${test.detail}` : `✖ ${test.detail}`}
          </p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="kicker mb-2">Credentials for {provider.label}</h2>
        <p className="text-[12px] text-muted mb-5 leading-relaxed">
          {provider.needsKey ? (
            <>
              Get one at{" "}
              <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent">
                {new URL(provider.docsUrl).host}
              </a>
              . Stored encrypted; only the last characters are ever shown again.
              {provider.envKeys.length > 0 && (
                <>
                  {" "}
                  Without one stored here, Signal falls back to{" "}
                  <code className="font-mono text-[11.5px]">{provider.envKeys.join(" / ")}</code>.
                </>
              )}
            </>
          ) : (
            <>
              This provider does not need a key.{" "}
              <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent">
                Setup instructions
              </a>
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
                >
                  Delete
                </button>
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
              {stored.length ? "Replace key" : "Save key"}
            </button>
          </div>
        )}

        {!keyIsManaged && (
          <p className="text-[11.5px] text-faint mt-4 leading-snug">
            Encryption key: auto-generated in the data directory. Set{" "}
            <code className="font-mono">SIGNAL_SECRET_KEY</code> to pin it yourself — required if you restore
            this database on another machine.
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
