import { saveCredential } from "./credentials";
import { getDb, parseJson } from "./db";
import { assertFreeKey } from "./slug";
import { renderTemplate } from "./template";
import type { Channel, Post } from "./types";

export type ChannelInput = {
  key: string;
  label: string;
  char_limit: number;
  color: string;
  hint: string;
  /** Output language. Empty inherits the working language of the voice profile. */
  language: string;
  /** Key of the digest definition this channel writes from. Empty = the general one. */
  digest_def: string;
  template: string;
  publisher: string;
  config: Record<string, unknown>;
  credential_id: number | null;
  posts_per_run: number;
  enabled: boolean;
  sort_order?: number;
};

type Seed = Omit<ChannelInput, "credential_id" | "config" | "language" | "digest_def"> & {
  config?: Record<string, unknown>;
};

/**
 * Channels installed on first run. Nothing here is special-cased in the code:
 * they are ordinary rows, and you can edit, disable or delete any of them and
 * add your own from the UI.
 */
export const DEFAULT_CHANNELS: Seed[] = [
  {
    key: "linkedin",
    label: "LinkedIn",
    char_limit: 3000,
    color: "#0A66C2",
    hint: "Long form. Authority, analysis, opinion with evidence. Short first line, then paragraphs of one or two sentences.",
    template: "{{body}}\n\n{{hashtags}}",
    publisher: "manual",
    posts_per_run: 2,
    enabled: true,
    sort_order: 10,
  },
  {
    key: "x",
    label: "X",
    char_limit: 280,
    color: "#e7e9ea",
    hint: "Short post or thread. Dense, no filler. Separate the tweets of a thread with a line containing exactly ---.",
    template: "{{body}}",
    publisher: "manual",
    posts_per_run: 2,
    enabled: true,
    sort_order: 20,
  },
  {
    key: "instagram",
    label: "Instagram",
    char_limit: 2200,
    color: "#E1306C",
    hint: "Carousel. Visual first, caption in support. The visual brief describes 5-7 slides with the exact text of each.",
    template: "{{body}}\n\n{{hashtags}}",
    publisher: "manual",
    posts_per_run: 1,
    enabled: true,
    sort_order: 30,
  },
  {
    key: "threads",
    label: "Threads",
    char_limit: 500,
    color: "#9b9b9b",
    hint: "Conversational and short. One idea, plain language, no hashtag stuffing.",
    template: "{{body}}",
    publisher: "manual",
    posts_per_run: 1,
    enabled: false,
    sort_order: 40,
  },
  {
    key: "bluesky",
    label: "Bluesky",
    char_limit: 300,
    color: "#0085FF",
    hint: "Short and technical. The audience is early adopters; skip the explanations they already have.",
    template: "{{body}}\n\n{{link}}",
    publisher: "bluesky",
    posts_per_run: 1,
    enabled: false,
    sort_order: 50,
  },
  {
    key: "mastodon",
    label: "Mastodon",
    char_limit: 500,
    color: "#6364FF",
    hint: "Short and technical, community tone. Content warnings are not needed for this material.",
    template: "{{body}}\n\n{{link}}",
    publisher: "mastodon",
    posts_per_run: 1,
    enabled: false,
    sort_order: 60,
  },
  {
    key: "newsletter",
    label: "Newsletter",
    char_limit: 8000,
    color: "#f0b429",
    hint: "Longest format. Room for context, a worked example and a closing thesis. Markdown is fine.",
    template: "# {{hook}}\n\n{{body}}\n\n---\nSource: {{link}}",
    publisher: "manual",
    posts_per_run: 1,
    enabled: false,
    sort_order: 70,
  },
  {
    key: "blog",
    label: "Blog",
    char_limit: 12000,
    color: "#3ecf8e",
    hint: "Article. Title, subheadings, and an argument that survives being read twice. Markdown.",
    template: "# {{hook}}\n\n{{body}}\n\n[Source]({{link}})",
    publisher: "webhook",
    posts_per_run: 1,
    enabled: false,
    sort_order: 80,
  },
];

export function seedChannels() {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO channels (key, label, char_limit, color, hint, template, publisher, config, posts_per_run, enabled, sort_order)
     VALUES (@key, @label, @char_limit, @color, @hint, @template, @publisher, @config, @posts_per_run, @enabled, @sort_order)
     ON CONFLICT(key) DO NOTHING`,
  );
  db.transaction(() =>
    DEFAULT_CHANNELS.forEach((c) =>
      insert.run({
        ...c,
        config: JSON.stringify(c.config ?? {}),
        enabled: c.enabled ? 1 : 0,
        sort_order: c.sort_order ?? 100,
      }),
    ),
  )();
}

export function getChannels(onlyEnabled = false): Channel[] {
  seedChannels();
  const sql = `SELECT * FROM channels ${onlyEnabled ? "WHERE enabled = 1" : ""} ORDER BY sort_order, label`;
  return getDb().prepare(sql).all() as Channel[];
}

export function getChannel(key: string): Channel | undefined {
  return getDb().prepare("SELECT * FROM channels WHERE key = ?").get(key) as Channel | undefined;
}

/** Display metadata for a post whose channel was deleted or renamed. */
export function channelLabel(channels: Channel[], key: string): Channel {
  return (
    channels.find((c) => c.key === key) ?? {
      id: -1,
      key,
      label: key,
      char_limit: 3000,
      color: "#8b93a1",
      hint: null,
      language: null,
      digest_def: null,
      template: "{{body}}\n\n{{hashtags}}",
      publisher: "manual",
      config: "{}",
      credential_id: null,
      posts_per_run: 0,
      enabled: 0,
      sort_order: 999,
    }
  );
}

/**
 * Creates (`isNew`) or edits a channel. Creating refuses a key already in use
 * instead of overwriting that channel; editing refuses a key that does not
 * exist instead of recreating it.
 *
 * A pasted `secret` is stored as a channel credential (labelled with the key)
 * and linked, in the same transaction: a channel that is refused leaves no
 * credential behind.
 */
export function saveChannel(input: ChannelInput & { isNew?: boolean; secret?: string }) {
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!key) throw new Error("The channel needs a key (letters, digits and dashes)");
  if (input.isNew) assertFreeKey(key);
  if (!input.label.trim()) throw new Error("The channel needs a name");

  const row = {
    key,
    label: input.label.trim(),
    char_limit: Math.max(1, Math.round(input.char_limit) || 3000),
    color: input.color || "#8b93a1",
    hint: input.hint ?? "",
    language: input.language?.trim() || null,
    // NULL, not "general": an unbound channel follows the general definition.
    digest_def: input.digest_def?.trim() && input.digest_def.trim() !== "general" ? input.digest_def.trim() : null,
    template: input.template ?? "{{body}}",
    publisher: input.publisher || "manual",
    config: JSON.stringify(input.config ?? {}),
    credential_id: input.credential_id ?? null,
    posts_per_run: Math.max(0, Math.round(input.posts_per_run) || 0),
    enabled: input.enabled ? 1 : 0,
    sort_order: input.sort_order ?? 100,
  };

  const db = getDb();
  const linkSecret = () => {
    if (input.secret?.trim()) {
      row.credential_id = saveCredential({
        scope: "channel",
        provider: row.publisher,
        label: key,
        secret: input.secret,
      }).id;
    }
  };

  if (input.isNew) {
    if (getChannel(key)) throw new Error(`A channel with the key "${key}" already exists`);
    db.transaction(() => {
      linkSecret();
      db.prepare(
      `INSERT INTO channels (key, label, char_limit, color, hint, language, digest_def, template, publisher, config, credential_id, posts_per_run, enabled, sort_order)
       VALUES (@key, @label, @char_limit, @color, @hint, @language, @digest_def, @template, @publisher, @config, @credential_id, @posts_per_run, @enabled, @sort_order)`,
      ).run(row);
    })();
    return key;
  }

  if (!getChannel(key)) throw new Error(`Unknown channel "${key}"`);
  db.transaction(() => {
    linkSecret();
    db.prepare(
      `UPDATE channels SET
         label = @label, char_limit = @char_limit, color = @color, hint = @hint, language = @language,
         digest_def = @digest_def, template = @template, publisher = @publisher, config = @config,
         credential_id = @credential_id, posts_per_run = @posts_per_run, enabled = @enabled,
         sort_order = @sort_order
       WHERE key = @key`,
    ).run(row);
  })();
  return key;
}

export function deleteChannel(key: string) {
  getDb().prepare("DELETE FROM channels WHERE key = ?").run(key);
}

export function channelConfig(channel: Channel): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(channel.config, {});
}

/** The text that actually gets published: the post run through its template. */
export function renderPost(
  post: Pick<Post, "body" | "hook" | "hashtags" | "angle">,
  channel: Pick<Channel, "template">,
  extra: { link?: string | null; title?: string | null } = {},
): string {
  const hashtags = parseJson<string[]>(post.hashtags, []).join(" ");
  return renderTemplate(channel.template || "{{body}}", {
    body: post.body ?? "",
    hook: post.hook ?? "",
    hashtags,
    angle: post.angle ?? "",
    link: extra.link ?? "",
    title: extra.title ?? "",
  });
}

export const TEMPLATE_VARIABLES = [
  { name: "body", description: "The post text as written (and edited) by you" },
  { name: "hook", description: "First line / headline" },
  { name: "hashtags", description: "Hashtags, space separated" },
  { name: "angle", description: "The thesis of the post" },
  { name: "link", description: "URL of the source signal" },
  { name: "title", description: "Title of the source signal" },
];
