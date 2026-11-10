import { describe, expect, it } from "vitest";
import { normalizeEmergencyNumber } from "@/lib/config";
import { defaultSettings, parseSettings, parseSettingsCookie, settingsToHtmlAttributes } from "@/lib/settings/schema";

describe("settings", () => {
  it("has safe defaults", () => {
    expect(defaultSettings.textSize).toBe("normal");
    expect(defaultSettings.voiceEnabled).toBe(true);
    expect(defaultSettings.voiceSpeakSensitive).toBe(false);
  });

  it("keeps valid values and repairs invalid ones", () => {
    const parsed = parseSettings({ textSize: "xl", highContrast: "yes", voiceRate: "warp" });
    expect(parsed.textSize).toBe("xl");
    expect(parsed.highContrast).toBe(false);
    expect(parsed.voiceRate).toBe("medium");
  });

  it("survives a corrupted cookie", () => {
    expect(parseSettingsCookie("%%%not-json")).toEqual(defaultSettings);
    expect(parseSettingsCookie(undefined)).toEqual(defaultSettings);
  });

  it("maps settings to html attributes", () => {
    const attributes = settingsToHtmlAttributes({ ...defaultSettings, highContrast: true, textSize: "large" });
    expect(attributes["data-contrast"]).toBe("high");
    expect(attributes["data-text-size"]).toBe("large");
  });
});

describe("emergency number", () => {
  it("uses the configured number", () => {
    expect(normalizeEmergencyNumber("112")).toBe("112");
    expect(normalizeEmergencyNumber("+99871103")).toBe("+99871103");
  });

  it("never lets anything but a phone number reach a tel: link", () => {
    expect(normalizeEmergencyNumber("")).toBe("103");
    expect(normalizeEmergencyNumber(undefined)).toBe("103");
    expect(normalizeEmergencyNumber("103;drop")).toBe("103");
  });
});
