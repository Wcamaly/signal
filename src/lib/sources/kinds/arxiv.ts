import type { SourceKind } from "../types";
import { asArray, fetchText, normalizeDate, num, parser, stripHtml, textOf } from "../util";

export const arxivKind: SourceKind = {
  id: "arxiv",
  label: "arXiv",
  urlLabel: "Category or query",
  placeholder: "arxiv:cs.AI  ·  arxiv:cs.CL",
  help: "Latest submissions for an arXiv category. Use the category code after \"arxiv:\".",
  configFields: [{ key: "maxItems", label: "Max papers per run", type: "number", placeholder: "25" }],

  async fetch(source) {
    const category = source.url.replace(/^arxiv:/, "").trim();
    const max = num(source.config, "maxItems", 25);
    const url =
      `https://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(category)}` +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;
    const doc = parser.parse(await fetchText(url));
    return asArray(doc?.feed?.entry).map((e: Record<string, unknown>) => ({
      external_id: textOf(e.id),
      title: stripHtml(textOf(e.title)),
      url: textOf(e.id),
      author: asArray(e.author as Record<string, unknown>[])
        .slice(0, 3)
        .map((a) => textOf(a.name))
        .join(", "),
      summary: stripHtml(textOf(e.summary)).slice(0, 1000),
      published_at: normalizeDate(textOf(e.published)),
    }));
  },
};
