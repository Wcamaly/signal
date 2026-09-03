import type { SourceKind } from "../types";
import { num } from "../util";
import { parseFeed } from "./feed";

/** YouTube still exposes per-channel and per-playlist Atom feeds, so no API key. */
export const youtubeKind: SourceKind = {
  id: "youtube",
  label: "YouTube channel",
  urlLabel: "Channel or playlist id",
  placeholder: "youtube:UCXUPKJO5MZQN11PqgIvyuvQ",
  help: "Channel ids start with UC, playlist ids with PL. Find the channel id in the page source of the channel (\"channelId\").",
  configFields: [{ key: "maxItems", label: "Max videos per run", type: "number", placeholder: "15" }],

  async fetch(source) {
    const id = source.url.replace(/^youtube:/, "").trim();
    if (id.startsWith("@")) {
      throw new Error("Handles are not supported: use the channel id (starts with UC)");
    }
    const param = id.startsWith("PL") ? "playlist_id" : "channel_id";
    return parseFeed(
      `https://www.youtube.com/feeds/videos.xml?${param}=${encodeURIComponent(id)}`,
      num(source.config, "maxItems", 15),
    );
  },
};
