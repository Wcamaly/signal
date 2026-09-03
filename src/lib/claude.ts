import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!hasKey()) throw new Error("Falta ANTHROPIC_API_KEY en .env.local");
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Extrae el primer bloque JSON válido de una respuesta del modelo. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("La respuesta no contiene JSON");
  const open = candidate[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1)) as T;
    }
  }
  throw new Error("JSON incompleto en la respuesta");
}

type CallOpts = {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  prefill?: string;
};

export async function callClaude({
  system,
  prompt,
  maxTokens = 4000,
  temperature = 1,
  prefill,
}: CallOpts): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  if (prefill) messages.push({ role: "assistant", content: prefill });

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    system,
    messages,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return (prefill ?? "") + text;
}

export async function callClaudeJson<T>(opts: CallOpts): Promise<T> {
  const text = await callClaude({ ...opts, prefill: opts.prefill ?? "" });
  return extractJson<T>(text);
}
