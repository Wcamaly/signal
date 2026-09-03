import type { RawItem } from "./util";

/** The subset of a source row a fetcher needs. */
export type SourceRef = {
  id?: number;
  name: string;
  url: string;
  kind: string;
  config: Record<string, unknown>;
};

/** Rendered as an extra input in the "add source" form. */
export type SourceConfigField = {
  key: string;
  label: string;
  type: "number" | "text";
  placeholder?: string;
  help?: string;
};

/**
 * A source kind is the plugin unit of the ingest stage: implement `fetch`,
 * register it in lib/sources/index.ts, and it becomes available in the UI.
 */
export type SourceKind = {
  id: string;
  label: string;
  urlLabel: string;
  placeholder: string;
  help: string;
  configFields?: SourceConfigField[];
  fetch(source: SourceRef): Promise<RawItem[]>;
};

export type { RawItem };
