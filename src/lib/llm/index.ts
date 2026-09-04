import { getSetting, setSetting } from "../db";
import { resolveSecret } from "../credentials";
import { extractJson } from "./json";
import { anthropicProvider } from "./providers/anthropic";
import { googleProvider } from "./providers/google";
import {
  customProvider,
  groqProvider,
  ollamaProvider,
  openaiProvider,
  openrouterProvider,
} from "./providers/openai-compatible";
import type { ChatRequest, LlmProvider } from "./types";

export { LlmError } from "./types";
export { extractJson } from "./json";
export type { ChatRequest, LlmProvider } from "./types";

/** Registry. Add a provider here and it appears in the UI. */
export const PROVIDERS: LlmProvider[] = [
  anthropicProvider,
  openaiProvider,
  googleProvider,
  openrouterProvider,
  groqProvider,
  ollamaProvider,
  customProvider,
];

export function getProvider(id: string): LlmProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** What the provider picker in the UI needs, without any secret. */
export type ProviderInfo = Omit<LlmProvider, "chat">;

export function providerCatalog(): ProviderInfo[] {
  return PROVIDERS.map(({ chat: _chat, ...info }) => info);
}

export type LlmConfig = {
  provider: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
};

const SETTING_KEY = "llm";
const OPTIONS_KEY = "llm.options";

/** Non-secret provider settings, kept per provider so switching keeps both. */
type StoredOptions = Record<string, Record<string, string>>;

/** Provider guessed from the environment the first time the app runs. */
function defaultProviderId(): string {
  const fromEnv = process.env.SIGNAL_LLM_PROVIDER;
  if (fromEnv && getProvider(fromEnv)) return fromEnv;
  const detected = PROVIDERS.find((p) => p.envKeys.some((k) => process.env[k]));
  return detected?.id ?? "anthropic";
}

export function getLlmConfig(): LlmConfig {
  const stored = getSetting<Partial<LlmConfig>>(SETTING_KEY, {});
  const provider = getProvider(stored.provider ?? defaultProviderId()) ?? anthropicProvider;
  return {
    provider: provider.id,
    model: stored.model || process.env.SIGNAL_LLM_MODEL || process.env.ANTHROPIC_MODEL || provider.defaultModel,
    baseUrl: stored.baseUrl || provider.defaultBaseUrl,
    temperature: stored.temperature ?? 0.7,
    maxTokens: stored.maxTokens ?? 16000,
  };
}

/** What the UI has stored for a provider, with no environment fallback. */
export function getProviderOptions(providerId: string): Record<string, string> {
  return getSetting<StoredOptions>(OPTIONS_KEY, {})[providerId] ?? {};
}

export function allProviderOptions(): StoredOptions {
  return getSetting<StoredOptions>(OPTIONS_KEY, {});
}

export function saveProviderOptions(providerId: string, values: Record<string, string>) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown LLM provider "${providerId}"`);
  const kept: Record<string, string> = {};
  for (const opt of provider.options ?? []) {
    const value = (values[opt.key] ?? "").trim();
    if (value) kept[opt.key] = value;
  }
  setSetting(OPTIONS_KEY, { ...allProviderOptions(), [providerId]: kept });
}

/** Stored value wins, the environment is the fallback — same rule as the keys. */
function resolveOptions(provider: LlmProvider): Record<string, string> {
  const stored = getProviderOptions(provider.id);
  const out: Record<string, string> = {};
  for (const opt of provider.options ?? []) {
    const value =
      stored[opt.key]?.trim() ||
      (opt.envKeys ?? []).map((k) => process.env[k]?.trim()).find(Boolean) ||
      "";
    if (value) out[opt.key] = value;
  }
  return out;
}

export function saveLlmConfig(patch: Partial<LlmConfig>) {
  const next = { ...getLlmConfig(), ...patch };
  const provider = getProvider(next.provider) ?? anthropicProvider;
  setSetting(SETTING_KEY, {
    provider: provider.id,
    model: next.model || provider.defaultModel,
    baseUrl: next.baseUrl || provider.defaultBaseUrl,
    temperature: Math.min(2, Math.max(0, Number(next.temperature) || 0)),
    maxTokens: Math.min(64000, Math.max(512, Math.round(Number(next.maxTokens) || 16000))),
  });
}

export type LlmStatus = {
  ready: boolean;
  provider: string;
  providerLabel: string;
  model: string;
  keyFrom: "ui" | "env" | null;
  reason: string | null;
};

export function llmStatus(): LlmStatus {
  const cfg = getLlmConfig();
  const provider = getProvider(cfg.provider);
  if (!provider) {
    return {
      ready: false,
      provider: cfg.provider,
      providerLabel: cfg.provider,
      model: cfg.model,
      keyFrom: null,
      reason: `Unknown provider "${cfg.provider}"`,
    };
  }
  const { secret, from } = provider.needsKey
    ? resolveSecret("llm", provider.id, provider.envKeys)
    : { secret: null, from: null as null };

  const ready = provider.needsKey ? Boolean(secret) : Boolean(cfg.model);
  return {
    ready,
    provider: provider.id,
    providerLabel: provider.label,
    model: cfg.model,
    keyFrom: from,
    reason: ready
      ? null
      : provider.needsKey
        ? `No API key for ${provider.label}. Add one in Model & keys.`
        : "Choose a model for this provider.",
  };
}

/** True when the pipeline can actually call a model. */
export function llmReady(): boolean {
  return llmStatus().ready;
}

/** Label used to stamp generated rows (digests, posts). */
export function modelLabel(): string {
  const status = llmStatus();
  return status.ready ? `${status.provider}/${status.model}` : "demo";
}

export async function chat(req: ChatRequest): Promise<string> {
  const cfg = getLlmConfig();
  const provider = getProvider(cfg.provider);
  if (!provider) throw new Error(`Unknown LLM provider "${cfg.provider}"`);

  const { secret } = provider.needsKey
    ? resolveSecret("llm", provider.id, provider.envKeys)
    : { secret: null };
  if (provider.needsKey && !secret) {
    throw new Error(`No API key stored for ${provider.label}. Add one under Model & keys.`);
  }

  return provider.chat(req, {
    apiKey: secret,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    maxTokens: cfg.maxTokens,
    temperature: cfg.temperature,
    options: resolveOptions(provider),
  });
}

export async function chatJson<T>(req: ChatRequest): Promise<T> {
  return extractJson<T>(await chat(req));
}

/** Used by the "test connection" button in the UI. */
export async function testLlm(): Promise<{ ok: boolean; detail: string }> {
  try {
    const text = await chat({
      system: "You are a connectivity check. Answer with a single short sentence.",
      prompt: "Reply with: Signal is connected.",
      maxTokens: 64,
      temperature: 0,
    });
    return { ok: true, detail: text.trim().slice(0, 200) || "(empty response)" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
