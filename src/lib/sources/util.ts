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

export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
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
