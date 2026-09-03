/** Everything a provider needs to answer one request. */
export type ChatRequest = {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
};

export type ProviderContext = {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
};

/**
 * A provider is the only thing you have to write to teach Signal a new LLM.
 * Register it in lib/llm/index.ts and it shows up in the UI picker.
 */
export type LlmProvider = {
  id: string;
  label: string;
  /** Where the user gets a key / how to run it locally. */
  docsUrl: string;
  /** False for local runtimes such as Ollama. */
  needsKey: boolean;
  keyLabel: string;
  keyPlaceholder: string;
  /** Environment variables read as a fallback when nothing is stored in the UI. */
  envKeys: string[];
  defaultBaseUrl: string;
  /** Shown as suggestions; any string is accepted. */
  models: string[];
  defaultModel: string;
  /** Some models reject a temperature; see the Anthropic provider. */
  supportsTemperature: boolean;
  note?: string;
  chat(req: ChatRequest, ctx: ProviderContext): Promise<string>;
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  provider: string,
  timeoutMs = 180_000,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new LlmError(`${provider} returned HTTP ${res.status}: ${text.slice(0, 400)}`, provider, res.status);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new LlmError(`${provider} returned a non-JSON body: ${text.slice(0, 200)}`, provider);
    }
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmError(`${provider} timed out after ${Math.round(timeoutMs / 1000)}s`, provider);
    }
    throw new LlmError(`${provider} request failed: ${String(err)}`, provider);
  } finally {
    clearTimeout(timer);
  }
}
