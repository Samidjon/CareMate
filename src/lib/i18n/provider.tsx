"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "./config";
import { dictionaries, type Messages } from "./dictionaries";

const I18nContext = createContext<{ locale: Locale; t: Messages } | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, t: dictionaries[locale] }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
