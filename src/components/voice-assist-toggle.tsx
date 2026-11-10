"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useSettings } from "@/lib/settings/provider";

/** The one-tap switch for voice assistance, on the home screen. */
export function VoiceAssistToggle() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const on = settings.voiceAssist;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-voice-ignore
      onClick={() => update({ voiceAssist: !on })}
      className={`btn ${on ? "btn-primary" : "btn-secondary"}`}
    >
      {on ? <Volume2 aria-hidden size={24} /> : <VolumeX aria-hidden size={24} />}
      {/* Written state, not colour alone. */}
      <span>
        {t.voice.assistToggle}: {on ? t.voice.on : t.voice.off}
      </span>
    </button>
  );
}
