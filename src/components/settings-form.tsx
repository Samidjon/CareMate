"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useSettings } from "@/lib/settings/provider";
import type { Settings } from "@/lib/settings/schema";
import { VoiceHint } from "./voice-hint";
import { VoiceInfo } from "./voice-info";

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

function Toggle({ setting, label, help }: { setting: BooleanKey; label: string; help?: string }) {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const enabled = settings[setting];
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => update({ [setting]: !enabled })}
        className={`flex min-h-[60px] w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border-2 px-3 py-2 text-left font-bold ${
          enabled ? "border-brand bg-brand-pale" : "border-line-strong bg-surface"
        }`}
      >
        <span className="min-w-0 break-words">{label}</span>
        {/* The state is written out, not shown by colour alone. */}
        <span className="shrink-0 text-[0.85rem]">{enabled ? `✓ ${t.settings.on}` : t.settings.off}</span>
      </button>
      {help && <p className="secondary-text text-[0.9rem] text-muted">{help}</p>}
    </div>
  );
}

function Choice<K extends "textSize" | "voiceRate" | "voiceVolume">({
  setting,
  legend,
  options,
}: {
  setting: K;
  legend: string;
  options: { value: Settings[K]; label: string }[];
}) {
  const { settings, update } = useSettings();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-bold">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = settings[setting] === option.value;
          return (
            <label
              key={String(option.value)}
              className={`flex min-h-[60px] cursor-pointer items-center gap-2 rounded-xl border-2 px-3 font-bold has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${
                selected ? "border-brand bg-brand-pale" : "border-line-strong bg-surface"
              }`}
            >
              <input
                type="radio"
                className="size-5 shrink-0 accent-brand"
                name={setting}
                checked={selected}
                onChange={() => update({ [setting]: option.value } as Partial<Settings>)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SettingsForm() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const s = t.settings;
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="a11y-title" className="card flex flex-col gap-3">
        <h2 id="a11y-title">{s.accessibilityTitle}</h2>
        <Choice
          setting="textSize"
          legend={s.textSize}
          options={[
            { value: "normal", label: s.textNormal },
            { value: "large", label: s.textLarge },
            { value: "xl", label: s.textXl },
          ]}
        />
        <Toggle setting="highContrast" label={s.highContrast} />
        <Toggle setting="reducedMotion" label={s.reducedMotion} />
        <Toggle setting="simplified" label={s.simplified} help={s.simplifiedHelp} />
        <Toggle setting="soundFeedback" label={s.sound} />
      </section>

      <section aria-labelledby="voice-title" className="card flex flex-col gap-3">
        <h2 id="voice-title">{s.voiceTitle}</h2>
        <Toggle setting="voiceAssist" label={s.voiceAssist} help={s.voiceAssistHelp} />
        <Toggle setting="voiceEnabled" label={s.voiceEnabled} />
        {settings.voiceEnabled && (
          <>
            <Choice
              setting="voiceRate"
              legend={s.voiceRate}
              options={[
                { value: "slow", label: s.voiceSlow },
                { value: "medium", label: s.voiceMedium },
                { value: "fast", label: s.voiceFast },
              ]}
            />
            <Choice
              setting="voiceVolume"
              legend={s.voiceVolume}
              options={[
                { value: "quiet", label: s.voiceQuiet },
                { value: "medium", label: s.voiceMedium },
                { value: "loud", label: s.voiceLoud },
              ]}
            />
            <Toggle setting="voiceSpeakSensitive" label={s.voicePrivate} help={s.voicePrivateHelp} />
            <VoiceInfo />
            <VoiceHint text={s.voiceTest} />
          </>
        )}
      </section>
    </div>
  );
}
