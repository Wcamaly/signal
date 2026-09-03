import type { ChatRequest, LlmProvider, ProviderContext } from "../types";
import { LlmError, postJson } from "../types";

type Completion = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
};

/**
 * One implementation for every server that speaks the OpenAI chat-completions
 * shape: OpenAI itself, OpenRouter, Groq, Together, Ollama, vLLM, LM Studio and
 * anything else behind a custom base URL.
 */
export async function openAiCompatibleChat(
  req: ChatRequest,
  ctx: ProviderContext,
  providerId: string,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (ctx.apiKey) headers.authorization = `Bearer ${ctx.apiKey}`;

  const json = (await postJson(
    `${ctx.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      model: ctx.model,
      max_tokens: req.maxTokens ?? ctx.maxTokens,
      temperature: req.temperature ?? ctx.temperature,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
    },
    headers,
    providerId,
  )) as Completion;

  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new LlmError(
      json.error?.message || `${providerId} returned an empty completion`,
      providerId,
    );
  }
  return text;
}

type CompatibleInit = Pick<
  LlmProvider,
  "id" | "label" | "docsUrl" | "needsKey" | "envKeys" | "defaultBaseUrl" | "models" | "defaultModel"
> &
  Partial<Omit<LlmProvider, "chat">> & { headers?: Record<string, string> };

function compatible(init: CompatibleInit): LlmProvider {
  const { headers = {}, ...rest } = init;
  return {
    keyLabel: "API key",
    keyPlaceholder: "sk-...",
    supportsTemperature: true,
    ...rest,
    chat: (req, ctx) => openAiCompatibleChat(req, ctx, init.id, headers),
  };
}

export const openaiProvider = compatible({
  id: "openai",
  label: "OpenAI",
  docsUrl: "https://platform.openai.com/api-keys",
  needsKey: true,
  envKeys: ["OPENAI_API_KEY"],
  defaultBaseUrl: "https://api.openai.com/v1",
  models: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o4-mini"],
  defaultModel: "gpt-5",
});

export const openrouterProvider = compatible({
  id: "openrouter",
  label: "OpenRouter",
  docsUrl: "https://openrouter.ai/keys",
  needsKey: true,
  keyPlaceholder: "sk-or-...",
  envKeys: ["OPENROUTER_API_KEY"],
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  models: [
    "anthropic/claude-opus-5",
    "openai/gpt-5",
    "google/gemini-2.5-pro",
    "meta-llama/llama-4-maverick",
  ],
  defaultModel: "anthropic/claude-opus-5",
});

export const groqProvider = compatible({
  id: "groq",
  label: "Groq",
  docsUrl: "https://console.groq.com/keys",
  needsKey: true,
  keyPlaceholder: "gsk_...",
  envKeys: ["GROQ_API_KEY"],
  defaultBaseUrl: "https://api.groq.com/openai/v1",
  models: ["llama-3.3-70b-versatile", "qwen-3-32b", "kimi-k2-instruct"],
  defaultModel: "llama-3.3-70b-versatile",
});

export const ollamaProvider = compatible({
  id: "ollama",
  label: "Ollama (local)",
  docsUrl: "https://ollama.com/download",
  needsKey: false,
  keyLabel: "Not required",
  keyPlaceholder: "",
  envKeys: [],
  defaultBaseUrl: "http://localhost:11434/v1",
  models: ["llama3.3", "qwen3:14b", "mistral-small", "gemma3:12b"],
  defaultModel: "llama3.3",
  note: "Runs on your machine, no key and no data leaving the host. Pull the model first with `ollama pull <model>`.",
});

export const customProvider = compatible({
  id: "custom",
  label: "OpenAI-compatible endpoint",
  docsUrl: "https://github.com/Wcamaly/signal/blob/main/docs/extending.md#add-an-llm-provider",
  needsKey: false,
  envKeys: ["LLM_API_KEY"],
  defaultBaseUrl: "http://localhost:8000/v1",
  models: [],
  defaultModel: "",
  note: "Anything that speaks /chat/completions: vLLM, LM Studio, Together, DeepSeek, a gateway of your own.",
});
