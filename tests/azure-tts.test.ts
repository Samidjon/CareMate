import { describe, expect, it, vi } from "vitest";
import { azureConfig, buildSsml, synthesize } from "@/lib/voice/azure";

describe("Azure configuration", () => {
  it("needs both a key and a region", () => {
    expect(azureConfig({})).toBeNull();
    expect(azureConfig({ AZURE_SPEECH_KEY: "k" })).toBeNull();
    expect(azureConfig({ AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "westeurope" })).toEqual({
      key: "k",
      region: "westeurope",
      voice: "uz-UZ-MadinaNeural",
      endpoint: "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1",
    });
  });

  it("refuses a region that could redirect the request elsewhere", () => {
    expect(azureConfig({ AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "evil.example/" })).toBeNull();
  });
});

describe("SSML", () => {
  it("uses the voice's language, a calmer pace, and escapes the text", () => {
    const ssml = buildSsml(`Salom <b> & "do'st"`, "uz-UZ-MadinaNeural", 1);
    expect(ssml).toContain("xml:lang='uz-UZ'");
    expect(ssml).toContain("<voice name='uz-UZ-MadinaNeural'>");
    expect(ssml).toContain("rate='-8%'");
    expect(ssml).toContain("Salom &lt;b&gt; &amp; &quot;do&apos;st&quot;");
  });

  it("applies the person's speed setting", () => {
    expect(buildSsml("x", "uz-UZ-MadinaNeural", 1.25)).toContain("rate='+15%'");
    expect(buildSsml("x", "uz-UZ-MadinaNeural", 0.8)).toContain("rate='-26%'");
  });
});

describe("synthesis", () => {
  const config = azureConfig({ AZURE_SPEECH_KEY: "secret", AZURE_SPEECH_REGION: "westeurope" })!;

  it("sends the key only in the header Azure expects", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } }));
    const result = await synthesize(config, "Assalomu alaykum", 1, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    expect((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("secret");
    expect(String(init.body)).not.toContain("secret");
  });

  it("reports failure instead of throwing", async () => {
    const refused = await synthesize(config, "x", 1, (async () => new Response("no", { status: 401 })) as unknown as typeof fetch);
    expect(refused).toEqual({ ok: false, status: 401 });
    const offline = await synthesize(config, "x", 1, (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch);
    expect(offline).toEqual({ ok: false, status: 502 });
  });
});
