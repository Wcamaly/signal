import type { SourceKind } from "../types";
import { fetchJson, num, stripHtml, str } from "../util";

type Hit = {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  story_text?: string;
};

/** Named searches so a source can be written as `hn:agents`. */
const PRESETS: Record<string, string> = {
  ai: 'AI OR LLM OR "language model"',
  agents: "AI agents OR agentic OR RAG OR fine-tuning",
  infra: "inference OR GPU OR vLLM OR quantization",
  security: "prompt injection OR jailbreak OR AI security",
};

export const hnKind: SourceKind = {
  id: "hn",
  label: "Hacker News",
  urlLabel: "Query",
  placeholder: "hn:agents  ·  hn:\"prompt injection\"",
  help: `Algolia search over Hacker News stories. Presets: ${Object.keys(PRESETS)
    .map((k) => `hn:${k}`)
    .join(", ")}. Anything else after "hn:" is used as the search query.`,
  configFields: [
    { key: "minPoints", label: "Minimum points", type: "number", placeholder: "80" },
    { key: "days", label: "Window (days)", type: "number", placeholder: "8" },
  ],

  async fetch(source) {
    const key = source.url.replace(/^hn:/, "").trim();
    const query = PRESETS[key] ?? str(source.config, "query", key);
    const days = num(source.config, "days", 8);
    const minPoints = num(source.config, "minPoints", 80);
    const since = Math.floor(Date.now() / 1000) - days * 86400;

    const url =
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}` +
      `&tags=story&numericFilters=created_at_i>${since},points>${minPoints}&hitsPerPage=30`;

    const json = await fetchJson<{ hits: Hit[] }>(url);
    return json.hits.map((h) => ({
      external_id: `hn:${h.objectID}`,
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author,
      summary: `${h.points} points · ${h.num_comments} comments on Hacker News. ${stripHtml(
        h.story_text ?? "",
      )}`.slice(0, 800),
      published_at: h.created_at,
    }));
  },
};
