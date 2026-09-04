import type { RawItem, SourceKind } from "../types";
import { fetchJson, num, stripHtml, str } from "../util";
import { parseFeed } from "./feed";

type Listing = {
  data?: {
    children?: {
      data: {
        id: string;
        title: string;
        url: string;
        permalink: string;
        author: string;
        score: number;
        num_comments: number;
        created_utc: number;
        selftext?: string;
        is_self: boolean;
        thumbnail?: string;
      };
    }[];
  };
};

export const redditKind: SourceKind = {
  id: "reddit",
  label: "Reddit",
  urlLabel: "Subreddit",
  placeholder: "reddit:LocalLLaMA",
  help: "Top posts of a subreddit over a window. Reddit rate-limits anonymous traffic: when the JSON API refuses the request, Signal falls back to the public RSS feed, which carries no scores.",
  configFields: [
    { key: "minScore", label: "Minimum score", type: "number", placeholder: "50" },
    { key: "window", label: "Window", type: "text", placeholder: "day | week | month" },
    { key: "limit", label: "Posts to read", type: "number", placeholder: "50" },
  ],

  async fetch(source) {
    const sub = source.url.replace(/^reddit:/, "").replace(/^\/?r\//, "").trim();
    const window = str(source.config, "window", "week");
    const limit = num(source.config, "limit", 50);
    const minScore = num(source.config, "minScore", 50);

    try {
      // old.reddit.com answers anonymous JSON requests that www. often refuses.
      const json = await fetchJson<Listing>(
        `https://old.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=${window}&limit=${limit}`,
      );

      return (json.data?.children ?? [])
        .map((c) => c.data)
        .filter((p) => p.score >= minScore)
        .map(
          (p): RawItem => ({
            external_id: `reddit:${p.id}`,
            title: p.title,
            url: p.is_self ? `https://www.reddit.com${p.permalink}` : p.url,
            author: p.author,
            summary: `${p.score} upvotes · ${p.num_comments} comments in r/${sub}. ${stripHtml(
              p.selftext ?? "",
            )}`.slice(0, 800),
            published_at: new Date(p.created_utc * 1000).toISOString(),
            // Reddit answers "self", "default" or "nsfw" when there is no image.
            image_url: /^https?:\/\//i.test(p.thumbnail ?? "") ? (p.thumbnail ?? null) : null,
          }),
        );
    } catch {
      // Public feed: no scores, so the minimum score cannot be applied.
      return parseFeed(
        `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.rss?t=${window}`,
        limit,
      );
    }
  },
};
