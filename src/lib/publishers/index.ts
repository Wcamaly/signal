import { postJson, requireConfig, type Publisher } from "./types";

const manual: Publisher = {
  id: "manual",
  label: "Manual (copy & paste)",
  help: "Signal only records the post as published. You copy it and paste it wherever it goes. This is the safest default and needs no app review from any platform.",
  needsCredential: false,
  credentialLabel: "",
  configFields: [],
  async publish() {
    return { url: null };
  },
};

const webhook: Publisher = {
  id: "webhook",
  label: "Webhook",
  help: "POSTs the post as JSON to a URL of yours. Use it with n8n, Make, Zapier, a scheduler, your CMS or your own script — the escape hatch for any platform Signal does not speak natively.",
  needsCredential: false,
  credentialLabel: "Bearer token (optional)",
  configFields: [
    { key: "url", label: "Endpoint URL", placeholder: "https://n8n.example.com/webhook/signal" },
  ],
  async publish(ctx) {
    const url = requireConfig(ctx.config, "url", "Endpoint URL");
    const headers: Record<string, string> = {};
    if (ctx.secret) headers.authorization = `Bearer ${ctx.secret}`;

    const { json } = await postJson(
      url,
      {
        channel: ctx.channel.key,
        post_id: ctx.post.id,
        hook: ctx.post.hook,
        body: ctx.post.body,
        hashtags: ctx.post.hashtags ? JSON.parse(ctx.post.hashtags) : [],
        visual_brief: ctx.post.visual_brief,
        angle: ctx.post.angle,
        link: ctx.link,
        text: ctx.rendered,
      },
      headers,
    );

    return { url: typeof json.url === "string" ? json.url : null };
  },
};

const mastodon: Publisher = {
  id: "mastodon",
  label: "Mastodon",
  help: "Posts a status through the Mastodon API. Create an application in Preferences → Development on your instance with the write:statuses scope and paste its access token.",
  needsCredential: true,
  credentialLabel: "Access token",
  configFields: [
    { key: "instance", label: "Instance URL", placeholder: "https://mastodon.social" },
  ],
  async publish(ctx) {
    const instance = requireConfig(ctx.config, "instance", "Instance URL").replace(/\/$/, "");
    if (!ctx.secret) throw new Error("This channel has no access token stored");

    const { json } = await postJson(
      `${instance}/api/v1/statuses`,
      { status: ctx.rendered },
      { authorization: `Bearer ${ctx.secret}` },
    );
    return { url: typeof json.url === "string" ? json.url : null };
  },
};

const bluesky: Publisher = {
  id: "bluesky",
  label: "Bluesky",
  help: "Posts through the AT Protocol. Use an app password (Settings → App Passwords), never your account password. Links are posted as plain text.",
  needsCredential: true,
  credentialLabel: "App password",
  configFields: [
    { key: "handle", label: "Handle", placeholder: "you.bsky.social" },
    { key: "service", label: "PDS URL", placeholder: "https://bsky.social" },
  ],
  async publish(ctx) {
    const handle = requireConfig(ctx.config, "handle", "Handle");
    const service = (typeof ctx.config.service === "string" && ctx.config.service.trim()) || "https://bsky.social";
    if (!ctx.secret) throw new Error("This channel has no app password stored");

    const session = await postJson(
      `${service.replace(/\/$/, "")}/xrpc/com.atproto.server.createSession`,
      { identifier: handle, password: ctx.secret },
      {},
    );
    const jwt = session.json.accessJwt as string | undefined;
    const did = session.json.did as string | undefined;
    if (!jwt || !did) throw new Error("Bluesky did not return a session");

    const created = await postJson(
      `${service.replace(/\/$/, "")}/xrpc/com.atproto.repo.createRecord`,
      {
        repo: did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text: ctx.rendered.slice(0, 300),
          createdAt: new Date().toISOString(),
        },
      },
      { authorization: `Bearer ${jwt}` },
    );

    const uri = created.json.uri as string | undefined;
    const rkey = uri?.split("/").pop();
    return { url: rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null };
  },
};

/** Registry. Add a publisher here and every channel can select it. */
export const PUBLISHERS: Publisher[] = [manual, webhook, mastodon, bluesky];

export function getPublisher(id: string): Publisher | undefined {
  return PUBLISHERS.find((p) => p.id === id);
}

/** Publisher metadata without the implementation, safe for client components. */
export type PublisherInfo = Omit<Publisher, "publish">;

export function publisherCatalog(): PublisherInfo[] {
  return PUBLISHERS.map(({ publish: _publish, ...info }) => info);
}

export type { PublishContext, Publisher, PublisherConfigField } from "./types";
