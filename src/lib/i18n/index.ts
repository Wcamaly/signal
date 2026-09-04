import { getSetting } from "../db";
import { dictionaryFor, DEFAULT_UI_LOCALE, UI_LOCALES, type Dictionary } from "./locales";

/**
 * Server-side half of the interface language: the two functions that read the
 * stored setting. Client components import ./locales instead — this module
 * pulls in the database, which cannot go into the browser bundle.
 */

/** The stored interface language. */
export function getUiLocale(): string {
  const stored = getSetting<string>("ui_language", DEFAULT_UI_LOCALE);
  return stored in UI_LOCALES ? stored : DEFAULT_UI_LOCALE;
}

/**
 * The strings for a server component. Client components use `useT()` from
 * components/I18nProvider, which reads the locale from context — the dictionary
 * itself cannot cross the server/client boundary, because the strings that take
 * a value are functions.
 */
export function getDictionary(): Dictionary {
  return dictionaryFor(getUiLocale());
}

export { UI_LOCALES, DEFAULT_UI_LOCALE, uiLocaleOptions, dictionaryFor } from "./locales";
export type { Dictionary };
