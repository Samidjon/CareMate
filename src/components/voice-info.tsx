"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

/** Says which voice will speak, and where the text goes, so nothing about it is hidden. */
export function VoiceInfo() {
  const { t, locale } = useI18n();
  const [azureVoice, setAzureVoice] = useState<string | null>(null);

  useEffect(() => {
    if (locale !== "uz") return;
    let active = true;
    fetch("/api/tts", { signal: AbortSignal.timeout(6000) })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => active && setAzureVoice(body?.configured ? body.voice : null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [locale]);

  const s = t.settings;
  const current = locale === "ru" ? s.voicePiper : azureVoice ? s.voiceAzure(azureVoice) : s.voiceSystem;
  return (
    <div className="flex flex-col gap-1">
      <p>
        <span className="font-bold">{s.voiceCurrent}:</span> {current}
      </p>
      {locale === "uz" && azureVoice && <p className="text-[0.9rem] text-muted">{s.voiceAzurePrivacy}</p>}
    </div>
  );
}
