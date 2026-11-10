import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { AppHeader } from "@/components/app-header";
import { AssistantButton } from "@/components/assistant-button";
import { BottomNav } from "@/components/bottom-nav";
import { LocationReporter } from "@/components/location-reporter";
import { SosShortcut } from "@/components/sos-shortcut";
import { LOCATION_COOKIE } from "@/lib/location/cookie";
import { VoiceBar } from "@/components/voice-bar";
import { hasSessionCookie } from "@/lib/account/session";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { I18nProvider } from "@/lib/i18n/provider";
import { getLocale } from "@/lib/i18n/server";
import { SettingsProvider } from "@/lib/settings/provider";
import { parseSettingsCookie, SETTINGS_COOKIE, settingsToHtmlAttributes } from "@/lib/settings/schema";
import { VoiceProvider } from "@/lib/voice/provider";
import "./globals.css";

// Manrope covers Latin and Cyrillic, so Uzbek and Russian look the same.
const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CareMate — sog‘liq va kundalik yordam",
  description: "Keksalar va nogironligi bo‘lgan insonlar uchun qulay tibbiy yordam platformasi.",
  applicationName: "CareMate",
  icons: {
    icon: [{ url: "/brand/favicon.ico", sizes: "any" }, { url: "/brand/caremate-icon.svg", type: "image/svg+xml" }],
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f8f6",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const t = dictionaries[locale];
  const settings = parseSettingsCookie((await cookies()).get(SETTINGS_COOKIE)?.value);
  const signedIn = await hasSessionCookie();
  // Runs only while the patient shares their location, and always says so on screen.
  const sharingLocation = signedIn && (await cookies()).get(LOCATION_COOKIE)?.value === "1";

  return (
    <html lang={locale} className={manrope.variable} {...settingsToHtmlAttributes(settings)}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-surface focus:p-3 focus:font-bold"
        >
          {t.common.skipToContent}
        </a>
        <I18nProvider locale={locale}>
          <SettingsProvider initial={settings} signedIn={signedIn}>
            <VoiceProvider>
              <AppHeader locale={locale} signedIn={signedIn} />
              {sharingLocation && <LocationReporter />}
              <main id="main" className="mx-auto w-full max-w-2xl px-4 pt-4 pb-44">
                {children}
              </main>
              <VoiceBar />
              <SosShortcut />
              {signedIn && <AssistantButton />}
              <BottomNav />
            </VoiceProvider>
          </SettingsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
