import type { ReactElement } from "react";

/** Everything a skin gets. Identical for all of them, on purpose. */
export type PreviewProps = {
  author: string;
  avatar: string | null;
  handle: string | null;
  /** The channel colour, used when there is no avatar. */
  color: string;
  /** The channel template's output — the string the Copy button gives you. */
  text: string;
  /**
   * Usually already inside `text`, because most channel templates end with
   * `{{hashtags}}`. Here for a skin that wants to draw them differently — such
   * a skin must not render `text` and these both, or they appear twice.
   */
  hashtags: string[];
  image: string | null;
  imageAlt: string | null;
  link: string | null;
  linkCard: { title: string; image: string | null } | null;
  charLimit: number;
};

/**
 * A preview skin is the fifth plugin unit: one file, plus one line in
 * previews/index.ts. A channel with no skin falls back to the generic one, so
 * nothing has to be registered for an invented channel to work.
 */
export type PreviewSkin = {
  /** The channel key this skin is for. */
  key: string;
  label: string;
  Component: (props: PreviewProps) => ReactElement;
};

/** Two initials, for when there is no avatar. */
export function initials(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Splits the text at the platform's fold, on a word boundary the way the real
 * clients do. Every limit passed in here is an observed value, not a
 * documented one — the platforms change them without notice.
 */
export function cut(text: string, limit: number): { shown: string; hidden: boolean } {
  if (text.length <= limit) return { shown: text, hidden: false };
  const slice = text.slice(0, limit);
  const space = slice.lastIndexOf(" ");
  return { shown: slice.slice(0, space > limit * 0.6 ? space : limit).trimEnd(), hidden: true };
}
