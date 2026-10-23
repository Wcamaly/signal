"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionSaveLlmConfig, actionSaveProviderOptions, actionTestLlm } from "@/lib/actions";
import type { LlmConfig, LlmStatus, ProviderInfo } from "@/lib/llm";
import { useT } from "./I18nProvider";

/** Which model writes: provider, model id, limits, and the provider's non-secret options. */
export default function ProviderForm({
  providers,
  config: initial,
  options: initialOptions,
  status,
}: {
  providers: ProviderInfo[];
  config: LlmConfig;
  /** Non-secret provider settings the UI has stored, keyed by provider. */
  options: Record<string, Record<string, string>>;
  status: LlmStatus;
}) {
  const [cfg, setCfg] = useState(initial);
  const [options, setOptions] = useState(initialOptions);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useT();
  const router = useRouter();

  const provider = useMemo(
    () => providers.find((p) => p.id === cfg.provider) ?? providers[0],
    [providers, cfg.provider],
  );

  function selectProvider(id: string) {
    const next = providers.find((p) => p.id === id);
    if (!next) return;
    setTest(null);
    setCfg((c) => ({ ...c, provider: id, model: next.defaultModel, baseUrl: next.defaultBaseUrl }));
  }

  function setOption(key: string, value: string) {
    setOptions((o) => ({ ...o, [provider.id]: { ...o[provider.id], [key]: value } }));
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveLlmConfig(cfg);
      if (!res.ok) {
        setError(res.error ?? t.common.error);
        return;
      }
      if (provider.options?.length) {
        const opts = await actionSaveProviderOptions(provider.id, options[provider.id] ?? {});
        if (!opts.ok) {
          setError(opts.error ?? t.common.error);
          return;
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
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
            <>{t.model.active}<span className="font-mono text-ink">{status.provider}/{status.model}</span>
              {status.keyFrom === "env" && " · key read from the environment"}
            </>
          ) : (
            <>
              {status.reason}{" "}
              <Link href="/manage/model/credentials" className="text-accent">
                {t.model.credentialsTitle} →
              </Link>
            </>
          )}
        </div>
      </div>

      <section className="card p-6">
        <h2 className="kicker mb-5">{t.model.provider}</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="label">{t.model.provider}</span>
            <select className="select" value={cfg.provider} onChange={(e) => selectProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">{t.model.model}</span>
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

        {provider.options?.map((opt) => (
          <div key={opt.key} className="mt-5">
            <span className="label">{opt.label}</span>
            <input
              className="input font-mono !text-[12px]"
              autoComplete="off"
              placeholder={opt.placeholder}
              value={options[provider.id]?.[opt.key] ?? ""}
              onChange={(e) => setOption(opt.key, e.target.value)}
            />
            {opt.help && <p className="text-[11.5px] text-faint mt-2 leading-snug">{opt.help}</p>}
            {opt.envKeys && opt.envKeys.length > 0 && (
              <p className="text-[11.5px] text-faint mt-1 leading-snug">
                Left empty, Signal falls back to{" "}
                <code className="font-mono text-[11.5px]">{opt.envKeys.join(" / ")}</code>.
              </p>
            )}
          </div>
        ))}

        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 mt-5">
          <div>
            <span className="label">{t.model.baseUrl}</span>
            <input
              className="input font-mono !text-[12px]"
              value={cfg.baseUrl}
              onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))}
            />
          </div>
          <div>
            <span className="label">{t.model.temperature}</span>
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
            <span className="label">{t.model.maxTokens}</span>
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
            {pending ? t.common.saving : t.common.save}
          </button>
          <button className="btn" onClick={runTest} disabled={pending}>{t.model.testConnection}</button>
          {saved && (
            <span className="text-[12.5px]" style={{ color: "var(--good)" }}>{t.common.saved}</span>
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

        {error && (
          <p className="text-[12px] mt-3" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
