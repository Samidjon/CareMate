import { z } from "zod";

export const SETTINGS_COOKIE = "cm_settings";

export const settingsSchema = z.object({
  textSize: z.enum(["normal", "large", "xl"]).catch("normal"),
  highContrast: z.boolean().catch(false),
  reducedMotion: z.boolean().catch(false),
  simplified: z.boolean().catch(false),
  soundFeedback: z.boolean().catch(false),
  voiceEnabled: z.boolean().catch(true),
  // Off by default: announcing every tap suits some people and gets in the way of
  // others, especially those already using a screen reader.
  voiceAssist: z.boolean().catch(false),
  voiceRate: z.enum(["slow", "medium", "fast"]).catch("medium"),
  voiceVolume: z.enum(["quiet", "medium", "loud"]).catch("loud"),
  // Off by default: medicine names are not read aloud unless the user opts in.
  voiceSpeakSensitive: z.boolean().catch(false),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings: Settings = settingsSchema.parse({});

export function parseSettings(raw: unknown): Settings {
  const result = settingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : defaultSettings;
}

export function parseSettingsCookie(value: string | undefined): Settings {
  if (!value) return defaultSettings;
  try {
    return parseSettings(JSON.parse(decodeURIComponent(value)));
  } catch {
    return defaultSettings;
  }
}

export function settingsToHtmlAttributes(settings: Settings) {
  return {
    "data-text-size": settings.textSize,
    "data-contrast": settings.highContrast ? "high" : "normal",
    "data-motion": settings.reducedMotion ? "reduced" : "normal",
    "data-simplified": settings.simplified ? "on" : "off",
  } as const;
}
