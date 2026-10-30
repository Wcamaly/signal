import { XMLParser } from "fast-xml-parser";

export const USER_AGENT =
  process.env.SIGNAL_USER_AGENT || "SignalBot/1.0 (+https://github.com/Wcamaly/signal)";

export type RawItem = {
  external_id: string;
  title: string;
  url: string;
  author?: string | null;
  summary?: string | null;
  published_at?: string | null;
  /** Absolute URL of the item's own image, when the feed carries one. */
  image_url?: string | null;
};

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

export function stripHtml(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function textOf(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>))
    return String((v as Record<string, unknown>)["#text"] ?? "");
  return String(v);
}

export function normalizeDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const TRANSIENT = new Set([429, 502, 503, 504]);

type Pause = (ms: number) => Promise<void>;
const defaultPause: Pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET a URL as text. 429 / 5xx are retried a couple of times — VentureBeat
 * and a few other newsrooms rate-limit the first hit from a datacenter IP.
 */
export async function fetchText(url: string, timeoutMs = 15000, pause: Pause = defaultPause): Promise<string> {
  const attempts = 3;
  let lastStatus = 0;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/rss+xml, application/xml, text/xml, application/json, */*",
        },
        signal: ctrl.signal,
      });
      if (res.ok) return await res.text();
      lastStatus = res.status;
      if (!TRANSIENT.has(res.status) || i === attempts - 1) {
        throw new Error(`HTTP ${res.status}`);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 8000) : 400 * 2 ** i;
      await pause(waitMs);
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`HTTP ${lastStatus}`);
}

export async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  return JSON.parse(await fetchText(url, timeoutMs)) as T;
}

export function num(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = Number(config?.[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function str(config: Record<string, unknown>, key: string, fallback: string): string {
  const v = config?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
