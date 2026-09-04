/**
 * The languages offered in the pickers. The stored value is the label itself,
 * not a locale code, because every prompt reads `Write in this language:
 * {{language}}` — so there is no mapping table anywhere in the pipeline.
 *
 * "Other…" in the UI lets you type anything, which makes this list a
 * convenience rather than a constraint.
 */
export const LANGUAGES = [
  "Español",
  "English",
  "Português",
  "Français",
  "Deutsch",
  "Italiano",
] as const;

/**
 * Which language an artefact is actually written in. An empty or missing value
 * means inherit: a channel with no language of its own follows the working
 * language of the voice profile.
 */
export function resolveLanguage(own: string | null | undefined, inherited: string): string {
  return (own ?? "").trim() || inherited;
}
