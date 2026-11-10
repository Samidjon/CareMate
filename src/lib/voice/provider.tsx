"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useSettings } from "@/lib/settings/provider";
import type { Settings } from "@/lib/settings/schema";
import { BrowserSpeechProvider } from "./browser-speech-provider";
import { PiperRussianProvider } from "./piper-russian-provider";
import { SpeechService, type SpeechNotice } from "./speech-service";
import type { Announcement } from "./announcer";
import { UzbekSpeechProvider } from "./uzbek-speech-provider";
import { useVoiceAssist } from "./use-voice-assist";

const rateValues: Record<Settings["voiceRate"], number> = { slow: 0.8, medium: 1, fast: 1.25 };
const volumeValues: Record<Settings["voiceVolume"], number> = { quiet: 0.4, medium: 0.7, loud: 1 };

export type VoiceState = "idle" | "loading" | "speaking" | "finished" | "unavailable" | "privacy";

type SpeakRequest = {
  /** Medical text is only read aloud if the user has opted in. */
  sensitive?: boolean;
  allowModelDownload?: boolean;
  /** An automatic announcement from voice assistance, rather than a "listen" button. */
  auto?: boolean;
};

type VoiceContextValue = {
  state: VoiceState;
  notice: SpeechNotice | null;
  /** The model has to be fetched first, which can take a while on first use. */
  modelLoading: boolean;
  speak: (text: string, request?: SpeakRequest) => void;
  stop: () => void;
  repeat: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const { settings } = useSettings();
  const [state, setState] = useState<VoiceState>("idle");
  const [notice, setNotice] = useState<SpeechNotice | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const piperRef = useRef<PiperRussianProvider | null>(null);
  const serviceRef = useRef<SpeechService | null>(null);
  const lastRef = useRef<{ text: string; request?: SpeakRequest } | null>(null);
  const tokenRef = useRef(0);

  const getService = useCallback(() => {
    if (!serviceRef.current) {
      piperRef.current = new PiperRussianProvider();
      serviceRef.current = new SpeechService({
        russian: piperRef.current,
        uzbek: new UzbekSpeechProvider(),
        browser: new BrowserSpeechProvider(),
      });
    }
    return serviceRef.current;
  }, []);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    serviceRef.current?.stop();
    setState("idle");
    setNotice(null);
    setModelLoading(false);
  }, []);

  const speak = useCallback(
    (text: string, request?: SpeakRequest) => {
      if (request?.auto ? !settings.voiceAssist : !settings.voiceEnabled) return;
      if (request?.sensitive && !settings.voiceSpeakSensitive) {
        setState("privacy");
        return;
      }
      lastRef.current = { text, request };
      const service = getService();
      const token = ++tokenRef.current;
      const allowModelDownload = request?.allowModelDownload ?? true;
      setNotice(null);
      setState("loading");
      setModelLoading(locale === "ru" && allowModelDownload && !piperRef.current?.isModelReady());

      // Stale results are ignored: a later speak() or stop() has taken over.
      const isCurrent = () => token === tokenRef.current;
      const poll = window.setInterval(() => {
        if (isCurrent() && piperRef.current?.getStatus() === "speaking") {
          setState("speaking");
          setModelLoading(false);
        }
      }, 200);
      void service
        .speak(text, {
          locale,
          rate: rateValues[settings.voiceRate],
          volume: volumeValues[settings.voiceVolume],
          allowModelDownload,
          onNotice: (value) => {
            if (!isCurrent()) return;
            setNotice(value);
            setModelLoading(false);
            setState("speaking");
          },
        })
        .then((outcome) => {
          window.clearInterval(poll);
          if (!isCurrent()) return;
          setModelLoading(false);
          if (outcome.kind === "unavailable") setState("unavailable");
          else if (outcome.kind === "finished") setState("finished");
          else setState("idle");
        });
    },
    [getService, locale, settings],
  );

  const repeat = useCallback(() => {
    if (lastRef.current) speak(lastRef.current.text, lastRef.current.request);
  }, [speak]);

  useEffect(() => () => serviceRef.current?.stop(), []);

  const announce = useCallback(
    (announcement: Announcement) => {
      // Private details become a neutral phrase rather than being read out to the room.
      const text = announcement.sensitive && !settings.voiceSpeakSensitive ? t.voice.privateItem : announcement.text;
      // Never start the 63 MB model download on the emergency screens.
      speak(text, { auto: true, allowModelDownload: !window.location.pathname.startsWith("/sos") });
    },
    [settings.voiceSpeakSensitive, speak, t],
  );

  useVoiceAssist({
    enabled: settings.voiceAssist,
    words: { on: t.voice.on, off: t.voice.off, selected: t.voice.selected },
    pageWords: t.voice.page,
    announce,
  });

  // Turning assistance on confirms it out loud; turning it off silences everything at once.
  const assistOn = settings.voiceAssist;
  const previousAssist = useRef(assistOn);
  useEffect(() => {
    if (previousAssist.current === assistOn) return;
    previousAssist.current = assistOn;
    // Deferred so the switch finishes updating before speech state changes.
    const timer = window.setTimeout(() => (assistOn ? speak(t.voice.assistOn, { auto: true }) : stop()), 0);
    return () => window.clearTimeout(timer);
  }, [assistOn, speak, stop, t]);

  const value = useMemo(
    () => ({ state, notice, modelLoading, speak, stop, repeat }),
    [state, notice, modelLoading, speak, stop, repeat],
  );
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("useVoice must be used inside VoiceProvider");
  return value;
}
