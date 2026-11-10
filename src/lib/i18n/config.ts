// To add a language (Uzbek Cyrillic, English): add its code here, its dictionary
// in ./dictionaries.ts, and its label below. TypeScript flags anything missing.
export const locales = ["uz", "ru"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "uz";
export const LOCALE_COOKIE = "cm_lang";

export const localeLabels: Record<Locale, string> = {
  uz: "O‘zbekcha",
  ru: "Русский",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
