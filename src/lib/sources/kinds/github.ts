import type { SourceKind } from "../types";
import { num, str } from "../util";
import { parseFeed } from "./feed";

/**
 * GitHub publishes Atom feeds for releases, tags and commits, so no token is
 * needed. `github:owner/repo` follows releases; set mode to change that.
 */
export const githubKind: SourceKind = {
  id: "github",
  label: "GitHub repository",
  urlLabel: "Repository",
  placeholder: "github:vercel/next.js",
  help: "Releases (default), tags or commits of a public repository. No token required.",
  configFields: [
    { key: "mode", label: "Feed", type: "text", placeholder: "releases | tags | commits" },
    { key: "branch", label: "Branch (commits only)", type: "text", placeholder: "main" },
    { key: "maxItems", label: "Max items per run", type: "number", placeholder: "20" },
  ],

  async fetch(source) {
    const repo = source.url.replace(/^github:/, "").replace(/^https:\/\/github\.com\//, "").trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      throw new Error(`Expected github:owner/repo, got "${source.url}"`);
    }
    const mode = str(source.config, "mode", "releases");
    const branch = str(source.config, "branch", "main");
    const path =
      mode === "commits" ? `commits/${branch}.atom` : mode === "tags" ? "tags.atom" : "releases.atom";
    return parseFeed(`https://github.com/${repo}/${path}`, num(source.config, "maxItems", 20));
  },
};
