import type { SourceKind } from "./types";
import { arxivKind } from "./kinds/arxiv";
import { githubKind } from "./kinds/github";
import { hnKind } from "./kinds/hn";
import { redditKind } from "./kinds/reddit";
import { rssKind } from "./kinds/feed";
import { youtubeKind } from "./kinds/youtube";

/** Registry. Add a kind here and the UI form picks it up automatically. */
export const SOURCE_KINDS: SourceKind[] = [
  rssKind,
  hnKind,
  arxivKind,
  githubKind,
  redditKind,
  youtubeKind,
];

export function getSourceKind(id: string): SourceKind | undefined {
  return SOURCE_KINDS.find((k) => k.id === id);
}

/** Kind metadata without the fetcher, safe to pass to client components. */
export type SourceKindInfo = Omit<SourceKind, "fetch">;

export function sourceKindCatalog(): SourceKindInfo[] {
  return SOURCE_KINDS.map(({ fetch: _fetch, ...info }) => info);
}

export { SEED_SOURCES, SOURCE_CATEGORIES } from "./seed";
export type { SeedSource } from "./seed";
export type { RawItem, SourceConfigField, SourceKind, SourceRef } from "./types";
export { parseFeed } from "./kinds/feed";
