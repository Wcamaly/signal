import { getSetting } from "../db";
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
 */
export const UI_LOCALES: Record<string, Dictionary> = { en, es };

export type UiLocale = string;

export const DEFAULT_UI_LOCALE = "en";

/** `[{ code: "en", label: "English" }, …]`, for the picker. */
export function uiLocaleOptions(): { code: string; label: string }[] {
  return Object.entries(UI_LOCALES).map(([code, dict]) => ({ code, label: dict.localeLabel }));
}

export function dictionaryFor(locale: string): Dictionary {
  return UI_LOCALES[locale] ?? en;
}

/** The stored interface language. Server-side only — it reads the database. */
export function getUiLocale(): string {
  const stored = getSetting<string>("ui_language", DEFAULT_UI_LOCALE);
  return stored in UI_LOCALES ? stored : DEFAULT_UI_LOCALE;
}

/**
 * The strings for a server component. Client components use `useT()` from
 * components/I18nProvider instead, which reads the locale from context — the
 * dictionary itself cannot cross the server/client boundary, because the
 * strings that take a value are functions.
 */
export function getDictionary(): Dictionary {
  return dictionaryFor(getUiLocale());
}

export type { Dictionary };
