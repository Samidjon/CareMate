import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { TtlCache } from "@/lib/maps/cache";
import { isWithinRateLimit } from "@/lib/security/rate-limit";
import { azureConfig, synthesize } from "@/lib/voice/azure";

// The same interface phrases are spoken again and again; keep their audio for a day.
const cache = new TtlCache<{ audio: ArrayBuffer; contentType: string }>(24 * 60 * 60 * 1000, 300);

const body = z.object({
  text: z.string().trim().min(1).max(600),
  rate: z.number().min(0.5).max(2).default(1),
});

/** Whether a cloud Uzbek voice is set up, so the browser can choose without guessing. */
export async function GET() {
  const config = azureConfig();
  return NextResponse.json({ configured: Boolean(config), voice: config?.voice ?? null });
}

export async function POST(request: NextRequest) {
  const config = azureConfig();
  if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  let parsed;
  try {
    parsed = body.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { text, rate } = parsed.data;

  // Keyed by a hash, so the text itself is not held as a key.
  const key = createHash("sha256").update(`${config.voice}|${rate}|${text}`).digest("hex");
  let entry = cache.get(key);
  if (!entry) {
    // Each new phrase costs part of the free monthly allowance, so new phrases are limited.
    if (!(await isWithinRateLimit("tts", "address", 120, 3600))) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    const result = await synthesize(config, text, rate);
    if (!result.ok) {
      console.error("Speech synthesis failed:", result.status);
      return NextResponse.json({ error: "unavailable" }, { status: 502 });
    }
    entry = { audio: result.audio, contentType: result.contentType };
    cache.set(key, entry);
  }
  return new NextResponse(entry.audio, { headers: { "Content-Type": entry.contentType, "Cache-Control": "private, max-age=86400" } });
}
