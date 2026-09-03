import type { LlmProvider } from "../types";
import { LlmError, postJson } from "../types";

type GenerateResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
};

export const googleProvider: LlmProvider = {
  id: "google",
  label: "Google (Gemini)",
  docsUrl: "https://aistudio.google.com/apikey",
  needsKey: true,
  keyLabel: "API key",
  keyPlaceholder: "AIza...",
  envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  defaultModel: "gemini-2.5-flash",
  supportsTemperature: true,

  async chat(req, ctx) {
    if (!ctx.apiKey) throw new LlmError("Gemini needs an API key", "google");
    const url = `${ctx.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(ctx.model)}:generateContent`;
    const json = (await postJson(
      url,
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? ctx.maxTokens,
          temperature: req.temperature ?? ctx.temperature,
        },
      },
      { "x-goog-api-key": ctx.apiKey },
      "google",
    )) as GenerateResponse;

    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    if (!text) {
      throw new LlmError(
        json.promptFeedback?.blockReason
          ? `Gemini blocked the request: ${json.promptFeedback.blockReason}`
          : "Gemini returned an empty response",
        "google",
      );
    }
    return text;
  },
};
