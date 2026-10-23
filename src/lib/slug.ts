/**
 * Keys a new category, digest or channel may not take: `/manage/<topic>/new`
 * is the page that creates one, so an item keyed `new` could never be opened.
 */
export const RESERVED_KEYS: readonly string[] = ["new"];

/** Throws when a new item would take a reserved key. */
export function assertFreeKey(key: string) {
  if (RESERVED_KEYS.includes(key)) {
    throw new Error(`"${key}" is reserved; pick another name`);
  }
}

/** Lowercase, accents stripped, anything else collapsed to single dashes. */
export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
