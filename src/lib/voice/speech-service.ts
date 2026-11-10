import type { Locale } from "@/lib/i18n/config";
import type { SpeechProvider, SpeechResult } from "./types";

export type SpeechNotice = "fallbackUzbek" | "fallbackNoUzbekVoice" | "fallbackPiper";

export type SpeechOutcome =
  | { kind: "finished" | "stopped"; notice?: SpeechNotice }
  | { kind: "unavailable" };

/** The parts of the system-voice provider the service relies on. */
export interface FallbackProvider extends SpeechProvider {
  hasVoiceFor(lang: string): Promise<boolean>;
}

export type Providers = {
  russian: SpeechProvider & { isModelReady(): boolean };
  uzbek: SpeechProvider;
  browser: FallbackProvider;
};

export type RequestOptions = {
  locale: Locale;
  rate: number;
  volume: number;
  /** False on the SOS screen: an emergency must not start a 63 MB download. */
  allowModelDownload: boolean;
  onNotice?: (notice: SpeechNotice) => void;
};

const langOf: Record<Locale, string> = { uz: "uz-UZ", ru: "ru-RU" };

/** Picks a provider per language and falls back honestly, reporting what it did. */
export class SpeechService {
  constructor(private readonly providers: Providers) {}

  stop() {
    this.providers.russian.stop();
    this.providers.uzbek.stop();
    this.providers.browser.stop();
  }

  async speak(text: string, options: RequestOptions): Promise<SpeechOutcome> {
    this.stop();
    const { russian, uzbek, browser } = this.providers;
    const voice = { rate: options.rate, volume: options.volume, lang: langOf[options.locale] };

    let notice: SpeechNotice | undefined;
    const primary = options.locale === "ru" ? russian : uzbek;
    const mayUsePrimary =
      primary.isSupported() && (options.locale !== "ru" || options.allowModelDownload || russian.isModelReady());

    if (mayUsePrimary) {
      try {
        return { kind: await primary.speak(text, voice) };
      } catch {
        notice =
          options.locale === "ru"
            ? "fallbackPiper"
            : (await browser.hasVoiceFor(voice.lang))
              ? "fallbackUzbek"
              : "fallbackNoUzbekVoice";
      }
    } else if (options.locale === "uz") {
      notice = (await browser.hasVoiceFor(voice.lang)) ? "fallbackUzbek" : "fallbackNoUzbekVoice";
    }

    if (!browser.isSupported()) return { kind: "unavailable" };
    if (notice) options.onNotice?.(notice);
    try {
      const result: SpeechResult = await browser.speak(text, voice);
      return { kind: result, notice };
    } catch {
      return { kind: "unavailable" };
    }
  }
}
