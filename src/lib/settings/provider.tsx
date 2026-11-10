"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { saveSettingsToAccount } from "@/lib/account/actions";
import { SETTINGS_COOKIE, settingsToHtmlAttributes, type Settings } from "./schema";

type SettingsContextValue = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function playClick() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  gain.gain.value = 0.08;
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.07);
  oscillator.onended = () => void context.close();
}

export function SettingsProvider({
  initial,
  signedIn,
  children,
}: {
  initial: Settings;
  signedIn: boolean;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState(initial);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      document.cookie = `${SETTINGS_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; samesite=lax`;
      for (const [name, value] of Object.entries(settingsToHtmlAttributes(next))) {
        document.documentElement.setAttribute(name, value);
      }
      // The device keeps working if this fails; the account copy catches up on the next change.
      if (signedIn) void saveSettingsToAccount(next).catch(() => {});
    },
    [settings, signedIn],
  );

  useEffect(() => {
    if (!settings.soundFeedback) return;
    const handleClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest("a, button")) playClick();
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [settings.soundFeedback]);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
