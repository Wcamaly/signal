import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "../types";
import { LlmError } from "../types";

/**
 * Claude models from 4.6 onwards reject `temperature` (and assistant prefill)
 * when adaptive thinking is in play, so both are simply not sent for them.
 * Older model ids keep the sampling parameter.
 */
const NO_SAMPLING = /^claude-(fable|mythos)-5|^claude-opus-(5|4-8|4-7|4-6)|^claude-sonnet-(5|4-6)/;

export const anthropicProvider: LlmProvider = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  docsUrl: "https://console.anthropic.com/settings/keys",
  needsKey: true,
  keyLabel: "API key",
  keyPlaceholder: "sk-ant-...",
  envKeys: ["ANTHROPIC_API_KEY"],
  defaultBaseUrl: "https://api.anthropic.com",
  models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8"],
  defaultModel: "claude-opus-5",
  supportsTemperature: true,
  note: "Current Claude models ignore the temperature setting: they reject the parameter, so Signal omits it for them.",

  async chat(req, ctx) {
    if (!ctx.apiKey) throw new LlmError("Anthropic needs an API key", "anthropic");
    // Identity-linked keys (one key, several workspaces) are rejected with a 400
    // unless the request says which workspace it acts in. Workspace-scoped keys
    // ignore the header, so it is safe to always send it when configured.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const client = new Anthropic({
      apiKey: ctx.apiKey,
      baseURL: ctx.baseUrl || undefined,
      ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
    });

    try {
      const res = await client.messages.create({
        model: ctx.model,
        max_tokens: req.maxTokens ?? ctx.maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
        ...(NO_SAMPLING.test(ctx.model)
          ? {}
          : { temperature: req.temperature ?? ctx.temperature }),
      });

      if (res.stop_reason === "refusal") {
        throw new LlmError("Claude declined to answer this request", "anthropic");
      }

      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (err instanceof Anthropic.APIError) {
        throw new LlmError(`Anthropic returned ${err.status}: ${err.message}`, "anthropic", err.status);
      }
      throw new LlmError(`Anthropic request failed: ${String(err)}`, "anthropic");
    }
  },
};
