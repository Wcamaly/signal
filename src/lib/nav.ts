/**
 * Which link is "here". Pure, so the sidebar and the tabs (client components)
 * can import it.
 */

/**
 * True when `path` is `prefix` or a page below it: `/manage/sources/12` is
 * under `/manage/sources`, but `/manage/digests` is not under `/digest`. The
 * root only matches itself.
 */
export function underPath(path: string, prefix: string): boolean {
  if (prefix === "/") return path === "/";
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Of several hrefs, the one the path sits under most specifically — so
 * `/manage/model/credentials` picks Credentials, not Provider at `/manage/model`.
 */
export function activeHref(path: string, hrefs: string[]): string | null {
  return hrefs.filter((h) => underPath(path, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}
