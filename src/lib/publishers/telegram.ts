import type { Digest } from "../types";
import { postJson, requireConfig, type Publisher } from "./types";

/** Telegram rejects messages longer than this. */
const MAX_LENGTH = 4096;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");
/** A heading as plain text: no emphasis markers, links reduced to their text. */
const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();

/** Whether the channel receives its digest (the default) rather than its posts. */
export function sendsDigest(config: Record<string, unknown>): boolean {
  const mode = typeof config.mode === "string" ? config.mode.trim().toLowerCase() : "";
  return mode !== "posts";
}

/**
 * The digest as a message to read on a phone: title, thesis, one line per
 * signal linking its source, and a link to the full digest on Signal. The
 * signals are the `###` sections the digest prompts ask for; each links the
 * last URL of its section, which is where the prompts put the source.
 */
export function digestMessage(
  digest: Pick<Digest, "id" | "title" | "subtitle" | "markdown">,
  signalUrl: string | null,
  readMore: string,
): string {
  const signals: { title: string; url: string | null }[] = [];
  for (const line of (digest.markdown ?? "").split("\n")) {
    const h = line.match(/^###\s+(.*)$/);
    if (h) {
      signals.push({ title: plain(h[1]), url: null });
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      // A new top-level section ("What I would say") ends the signals.
      if (signals.length) break;
      continue;
    }
    const last = signals[signals.length - 1];
    const links = [...line.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)];
    if (last && links.length) last.url = links[links.length - 1][1];
  }

  const head = [`<b>${esc(digest.title ?? "Digest")}</b>`];
  if (digest.subtitle) head.push(`<i>${esc(digest.subtitle)}</i>`);
  const foot = signalUrl ? `\n\n<a href="${escAttr(`${signalUrl.replace(/\/$/, "")}/digest/${digest.id}`)}">${esc(readMore)}</a>` : "";

  let body = "";
  for (const s of signals) {
    const line = `\n• ${s.url ? `<a href="${escAttr(s.url)}">${esc(s.title)}</a>` : esc(s.title)}`;
    if (head.join("\n").length + body.length + line.length + foot.length + 2 > MAX_LENGTH) break;
    body += line;
  }
  return `${head.join("\n")}${body ? `\n${body}` : ""}${foot}`;
}

async function sendMessage(token: string, chatId: string, text: string, html: boolean) {
  await postJson(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      chat_id: chatId,
      text: text.slice(0, MAX_LENGTH),
      ...(html ? { parse_mode: "HTML" } : {}),
      link_preview_options: { is_disabled: true },
    },
    {},
  );
}

export const telegram: Publisher = {
  id: "telegram",
  label: "Telegram",
  help: "Sends to a Telegram chat through a bot. Create one with @BotFather and paste its token; message the bot once, then take your chat id from https://api.telegram.org/bot<token>/getUpdates. In digest mode the bound digest arrives on its own every time it is written; in posts mode the posts go out when you publish them from the queue.",
  needsCredential: true,
  credentialLabel: "Bot token",
  configFields: [
    { key: "chat_id", label: "Chat ID", placeholder: "123456789" },
    { key: "mode", label: "Send", placeholder: "digest | posts", help: "digest (default): the digest arrives on its own. posts: publish from the queue." },
    { key: "signal_url", label: "Signal URL", placeholder: "https://signal.example.com", help: "For the \"read the full digest\" link." },
  ],
  async publish(ctx) {
    const chatId = requireConfig(ctx.config, "chat_id", "Chat ID");
    if (!ctx.secret) throw new Error("This channel has no bot token stored");
    await sendMessage(ctx.secret, chatId, ctx.rendered, false);
    return { url: null };
  },
  digest: {
    enabled: sendsDigest,
    async send(ctx) {
      const chatId = requireConfig(ctx.config, "chat_id", "Chat ID");
      if (!ctx.secret) throw new Error("This channel has no bot token stored");
      const url = typeof ctx.config.signal_url === "string" && ctx.config.signal_url.trim() ? ctx.config.signal_url.trim() : null;
      await sendMessage(ctx.secret, chatId, digestMessage(ctx.digest, url, ctx.readMore), true);
    },
  },
};
