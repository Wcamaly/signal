import { en, type Dictionary } from "./en";
import { es } from "./es";

/**
 * The languages the interface itself is available in — a sixth plugin point,
 * shaped like the other five: one file, plus one line here.
 *
 * This is not the same list as `src/lib/languages.ts`. That one is what the
 * *model* writes in and accepts anything you type; this one is what Signal's
 * own buttons and labels say, and only holds languages somebody has actually
 * translated.
 *
 * Nothing here touches the database, on purpose: client components import this
 * module, and pulling `lib/db` into the browser bundle drags better-sqlite3
 * with it. The stored setting is read in ./index.ts, which is server-only.
 */
export const UI_LOCALES: Record<string, Dictionary> = { en, es };

export const DEFAULT_UI_LOCALE = "en";

/** `[{ code: "en", label: "English" }, …]`, for the picker. */
export function uiLocaleOptions(): { code: string; label: string }[] {
  return Object.entries(UI_LOCALES).map(([code, dict]) => ({ code, label: dict.localeLabel }));
}

export function dictionaryFor(locale: string): Dictionary {
  return UI_LOCALES[locale] ?? en;
}

export type { Dictionary };
