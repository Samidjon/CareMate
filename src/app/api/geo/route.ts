import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FERGANA_CENTER } from "@/lib/geo";
import { getMapProvider } from "@/lib/maps";
import { isWithinRateLimit } from "@/lib/security/rate-limit";

// Every lookup goes through here, so keys stay on the server, answers are cached,
// and public services see one polite client instead of every visitor.

const point = z.object({ latitude: z.number().min(39).max(42.5), longitude: z.number().min(69).max(74) });

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: z.string().trim().min(3).max(100), near: point.optional() }),
  z.object({ action: z.literal("reverse"), point, language: z.enum(["uz", "ru"]) }),
  z.object({ action: z.literal("route"), from: point, to: point }),
]);

const status = { not_configured: 503, unavailable: 502, rate_limited: 429, not_found: 404 } as const;

// POST, not GET: a person's position must not end up in URLs and server logs.
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const input = parsed.data;

  const limits = { search: 60, reverse: 10, route: 20 } as const;
  if (!(await isWithinRateLimit(`geo-${input.action}`, "address", limits[input.action], 600))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const provider = getMapProvider();
  const result =
    input.action === "search"
      ? await provider.searchPlaces(input.query, input.near ?? FERGANA_CENTER)
      : input.action === "reverse"
        ? await provider.reverse(input.point, input.language)
        : await provider.walkingRoute(input.from, input.to);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: status[result.error] });
  return NextResponse.json({ result: result.value, attribution: provider.attribution }, { headers: { "Cache-Control": "no-store" } });
}
