import type { Channel } from "./types";

/**
 * A channel as the form edits it. Pure — no database — so the server page
 * builds it and the client form imports the type.
 */
export type ChannelDraft = {
  key: string;
  label: string;
  char_limit: number;
  color: string;
  hint: string;
  language: string;
  digest_def: string;
  template: string;
  publisher: string;
  config: Record<string, string>;
  credential_id: number | null;
  posts_per_run: number;
  enabled: boolean;
  sort_order: number;
};

export const BLANK_CHANNEL: ChannelDraft = {
  key: "",
  label: "",
  char_limit: 1000,
  color: "#8b93a1",
  hint: "",
  language: "",
  digest_def: "",
  template: "{{body}}\n\n{{hashtags}}",
  publisher: "manual",
  config: {},
  credential_id: null,
  posts_per_run: 1,
  enabled: true,
  sort_order: 100,
};

export function channelDraft(c: Channel): ChannelDraft {
  let config: Record<string, string> = {};
  try {
    config = JSON.parse(c.config ?? "{}") as Record<string, string>;
  } catch {
    config = {};
  }
  return {
    key: c.key,
    label: c.label,
    char_limit: c.char_limit,
    color: c.color,
    hint: c.hint ?? "",
    language: c.language ?? "",
    digest_def: c.digest_def ?? "",
    template: c.template ?? "{{body}}",
    publisher: c.publisher,
    config,
    credential_id: c.credential_id,
    posts_per_run: c.posts_per_run,
    enabled: !!c.enabled,
    sort_order: c.sort_order,
  };
}
