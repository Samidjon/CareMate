"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

export async function persistLocaleCookie(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

// A plain form action, so the switch also works before JavaScript has loaded.
export async function setLocaleAction(formData: FormData) {
  const locale = formData.get("locale");
  if (isLocale(locale)) await persistLocaleCookie(locale);
}
