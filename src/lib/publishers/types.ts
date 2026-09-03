import type { Channel, Post } from "../types";

export type PublishContext = {
  channel: Channel;
  post: Post;
  /** The post already run through the channel template. */
  rendered: string;
  link: string | null;
  /** Decrypted credential for this channel, when it has one. */
  secret: string | null;
  config: Record<string, unknown>;
};

export type PublisherConfigField = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
};

/**
 * A publisher is the plugin unit of the last mile. Implement `publish`,
 * register it in lib/publishers/index.ts, and any channel can select it.
 */
export type Publisher = {
  id: string;
  label: string;
  help: string;
  needsCredential: boolean;
  credentialLabel: string;
  configFields: PublisherConfigField[];
  publish(ctx: PublishContext): Promise<{ url: string | null }>;
};

export function requireConfig(config: Record<string, unknown>, key: string, label: string): string {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`This channel needs "${label}" configured`);
  }
  return value.trim();
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // not every endpoint answers with JSON
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, json, text };
}
