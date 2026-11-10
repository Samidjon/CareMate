import { describe, expect, it, vi } from "vitest";
import { SpeechService, type RequestOptions } from "@/lib/voice/speech-service";
import type { SpeechResult } from "@/lib/voice/types";

function fakeProvider(id: string, behaviour: { supported?: boolean; fail?: boolean } = {}) {
  return {
    id,
    speak: vi.fn(async (): Promise<SpeechResult> => {
      if (behaviour.fail) throw new Error("failed");
      return "finished";
    }),
    stop: vi.fn(),
    isSupported: () => behaviour.supported ?? true,
    getStatus: () => "idle" as const,
  };
}

function setup(options: {
  piperFails?: boolean;
  piperReady?: boolean;
  uzbekSupported?: boolean;
  browserSupported?: boolean;
  browserFails?: boolean;
  hasUzbekVoice?: boolean;
} = {}) {
  const russian = { ...fakeProvider("piper", { fail: options.piperFails }), isModelReady: () => options.piperReady ?? false };
  const uzbek = fakeProvider("uzbek", { supported: options.uzbekSupported ?? false });
  const browser = {
    ...fakeProvider("browser", { supported: options.browserSupported ?? true, fail: options.browserFails }),
    hasVoiceFor: async () => options.hasUzbekVoice ?? false,
  };
  return { russian, uzbek, browser, service: new SpeechService({ russian, uzbek, browser }) };
}

const request = (overrides: Partial<RequestOptions>): RequestOptions => ({
  locale: "ru",
  rate: 1,
  volume: 1,
  allowModelDownload: true,
  ...overrides,
});

describe("SpeechService", () => {
  it("uses Piper for Russian", async () => {
    const { service, russian, browser } = setup();
    expect(await service.speak("текст", request({}))).toEqual({ kind: "finished" });
    expect(russian.speak).toHaveBeenCalledOnce();
    expect(browser.speak).not.toHaveBeenCalled();
  });

  it("falls back to the system voice with a notice when Piper fails", async () => {
    const { service, browser } = setup({ piperFails: true });
    const onNotice = vi.fn();
    const outcome = await service.speak("текст", request({ onNotice }));
    expect(outcome).toEqual({ kind: "finished", notice: "fallbackPiper" });
    expect(onNotice).toHaveBeenCalledWith("fallbackPiper");
    expect(browser.speak).toHaveBeenCalledOnce();
  });

  it("does not start the model download when it is not allowed", async () => {
    const { service, russian, browser } = setup();
    await service.speak("SOS", request({ allowModelDownload: false }));
    expect(russian.speak).not.toHaveBeenCalled();
    expect(browser.speak).toHaveBeenCalledOnce();
  });

  it("still uses Piper on the SOS screen when the model is already loaded", async () => {
    const { service, russian } = setup({ piperReady: true });
    await service.speak("SOS", request({ allowModelDownload: false }));
    expect(russian.speak).toHaveBeenCalledOnce();
  });

  it("uses the Uzbek provider once one is supported", async () => {
    const { service, uzbek, browser } = setup({ uzbekSupported: true });
    expect(await service.speak("matn", request({ locale: "uz" }))).toEqual({ kind: "finished" });
    expect(uzbek.speak).toHaveBeenCalledOnce();
    expect(browser.speak).not.toHaveBeenCalled();
  });

  it("explains the fallback when no Uzbek voice is configured", async () => {
    const withVoice = setup({ hasUzbekVoice: true });
    expect(await withVoice.service.speak("matn", request({ locale: "uz" }))).toEqual({
      kind: "finished",
      notice: "fallbackUzbek",
    });
    const withoutVoice = setup({ hasUzbekVoice: false });
    expect(await withoutVoice.service.speak("matn", request({ locale: "uz" }))).toEqual({
      kind: "finished",
      notice: "fallbackNoUzbekVoice",
    });
  });

  it("reports unavailable instead of claiming success when nothing can speak", async () => {
    const unsupported = setup({ piperFails: true, browserSupported: false });
    expect(await unsupported.service.speak("текст", request({}))).toEqual({ kind: "unavailable" });
    const failing = setup({ piperFails: true, browserFails: true });
    expect(await failing.service.speak("текст", request({}))).toEqual({ kind: "unavailable" });
  });
});
