"use client";

import { RotateCcw, Square } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useSettings } from "@/lib/settings/provider";
import { useVoice } from "@/lib/voice/provider";

/** Always within reach while voice assistance is on: repeat the last phrase, or stop. */
export function VoiceBar() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const voice = useVoice();
  if (!settings.voiceAssist) return null;
  const busy = voice.state === "loading" || voice.state === "speaking";
  return (
    <div
      role="group"
      aria-label={t.voice.barLabel}
      data-voice-ignore
      className="fixed bottom-[76px] left-3 z-40 flex gap-2 rounded-2xl border-2 border-line-strong bg-surface p-1.5 shadow-lg"
    >
      <button type="button" onClick={voice.repeat} className="flex min-h-[52px] items-center gap-1.5 rounded-xl px-3 font-bold hover:bg-brand-pale">
        <RotateCcw aria-hidden size={22} /> {t.voice.repeat}
      </button>
      <button
        type="button"
        onClick={voice.stop}
        disabled={!busy}
        className="flex min-h-[52px] items-center gap-1.5 rounded-xl px-3 font-bold hover:bg-brand-pale disabled:opacity-60"
      >
        <Square aria-hidden size={20} /> {t.voice.stop}
      </button>
    </div>
  );
}
