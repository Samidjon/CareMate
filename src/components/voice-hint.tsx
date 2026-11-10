"use client";

import { RotateCcw, Square, Volume2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useSettings } from "@/lib/settings/provider";
import { useVoice } from "@/lib/voice/provider";

export function VoiceHint({
  text,
  allowModelDownload = true,
  sensitive = false,
}: {
  text: string;
  allowModelDownload?: boolean;
  /** Medical text: read aloud only if the user has opted in. */
  sensitive?: boolean;
}) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const voice = useVoice();
  if (!settings.voiceEnabled) return null;

  const busy = voice.state === "loading" || voice.state === "speaking";
  const canRepeat = voice.state === "finished" || voice.state === "unavailable";

  const status =
    voice.state === "loading"
      ? voice.modelLoading
        ? t.voice.loadingModel
        : t.voice.loading
      : voice.state === "speaking"
        ? t.voice.playing
        : voice.state === "finished"
          ? t.voice.finished
          : voice.state === "unavailable"
            ? t.voice.unavailable
            : voice.state === "privacy"
              ? t.voice.privacyBlocked
              : "";

  return (
    // Its own buttons and status must not trigger voice assistance on top of the hint.
    <div className="flex flex-col gap-2" data-voice-ignore>
      <div className="flex gap-2">
        {busy ? (
          <button type="button" className="btn btn-secondary" onClick={voice.stop}>
            <Square aria-hidden size={22} /> {t.voice.stop}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => voice.speak(text, { allowModelDownload, sensitive })}>
            <Volume2 aria-hidden size={24} /> {t.voice.listen}
          </button>
        )}
        {canRepeat && (
          <button type="button" className="btn btn-secondary" onClick={voice.repeat}>
            <RotateCcw aria-hidden size={22} /> {t.voice.repeat}
          </button>
        )}
      </div>
      <div role="status" aria-live="polite" className="flex flex-col gap-1 text-[0.9rem]">
        {status && <p>{status}</p>}
        {voice.notice && <p className="notice notice-warn">{t.voice[voice.notice]}</p>}
      </div>
    </div>
  );
}
