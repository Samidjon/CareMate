import { setting } from "@/lib/env";
// Microsoft Azure AI Speech, used for Uzbek: uz-UZ-MadinaNeural is a calm female
// voice in Uzbek Latin. Pure functions with an injectable fetch, so they can be
// tested; the API key only ever lives on the server.

export type AzureConfig = { key: string; region: string; voice: string; endpoint: string };

/** Null unless both the key and the region are set. */
export function azureConfig(env: Record<string, string | undefined> = process.env): AzureConfig | null {
  const key = setting("AZURE_SPEECH_KEY", env);
  const region = setting("AZURE_SPEECH_REGION", env);
  if (!key || !region || !/^[a-z0-9]+$/.test(region)) return null;
  const voice = setting("AZURE_SPEECH_VOICE", env) || "uz-UZ-MadinaNeural";
  const endpoint = setting("AZURE_SPEECH_ENDPOINT", env) || `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  return { key, region, voice, endpoint };
}

const escapeXml = (text: string) =>
  text.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]!);

/**
 * SSML for one phrase. A slightly slower default suits older listeners; the
 * person's own speed setting is applied on top.
 */
export function buildSsml(text: string, voice: string, rate: number) {
  const lang = voice.split("-").slice(0, 2).join("-");
  const percent = Math.round((rate * 0.92 - 1) * 100);
  const prosody = `${percent >= 0 ? "+" : ""}${percent}%`;
  return `<speak version='1.0' xml:lang='${escapeXml(lang)}'><voice name='${escapeXml(voice)}'><prosody rate='${prosody}'>${escapeXml(text)}</prosody></voice></speak>`;
}

export type SynthesisResult = { ok: true; audio: ArrayBuffer; contentType: string } | { ok: false; status: number };

export async function synthesize(
  config: AzureConfig,
  text: string,
  rate: number,
  fetchImpl: typeof fetch = fetch,
): Promise<SynthesisResult> {
  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": config.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "CareMate",
      },
      body: buildSsml(text, config.voice, rate),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, audio: await response.arrayBuffer(), contentType: response.headers.get("content-type") || "audio/mpeg" };
  } catch {
    return { ok: false, status: 502 };
  }
}
