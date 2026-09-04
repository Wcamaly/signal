"use client";

import { createContext, useContext } from "react";
import { dictionaryFor, DEFAULT_UI_LOCALE, type Dictionary } from "@/lib/i18n";

/**
 * Only the locale code crosses the boundary, never the dictionary: the strings
 * that take a value are functions, and a function cannot be serialised from a
 * server component to a client one. The dictionaries are plain modules, so the
 * client resolves the code against its own import.
 */
const LocaleContext = createContext<string>(DEFAULT_UI_LOCALE);

export default function I18nProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** The interface strings, inside a client component. */
export function useT(): Dictionary {
  return dictionaryFor(useContext(LocaleContext));
}
