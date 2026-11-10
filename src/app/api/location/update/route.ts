import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isPlausible } from "@/lib/location/logic";
import { LOCATION_COOKIE } from "@/lib/location/cookie";
import { createClient, getUser } from "@/lib/supabase/server";

const MIN_SECONDS_BETWEEN_UPDATES = 20;

const body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("position"),
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number().nullable(),
    recordedAt: z.iso.datetime(),
  }),
  // The device could not report: keep the last position, mark it as not current.
  z.object({ kind: z.literal("unavailable") }),
]);

const answer = (status: number, error?: string) => NextResponse.json(error ? { error } : { ok: true }, { status });

/** Stores the signed-in patient's own last position, and only while they share it. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  if (!supabase || !user) return answer(401, "unauthorized");
  let parsed;
  try {
    parsed = body.safeParse(await request.json());
  } catch {
    return answer(400, "invalid");
  }
  if (!parsed.success) return answer(400, "invalid");
  const input = parsed.data;

  // Nothing is stored unless the patient shares with at least one helper right now.
  const { data: shares, error: shareError } = await supabase.from("location_shares").select("id").eq("patient_id", user.id).eq("status", "active").limit(1);
  if (shareError) return answer(500, "failed");
  if (!shares?.length) {
    (await cookies()).delete(LOCATION_COOKIE);
    return answer(409, "sharing_off");
  }

  const { data: existing } = await supabase.from("patient_last_locations").select("updated_at").eq("patient_id", user.id).maybeSingle();

  if (input.kind === "unavailable") {
    if (!existing) return answer(200);
    const { error } = await supabase
      .from("patient_last_locations")
      .update({ device_state: "unavailable", device_state_at: new Date().toISOString() })
      .eq("patient_id", user.id);
    return error ? answer(500, "failed") : answer(200);
  }

  if (!isPlausible(input)) return answer(400, "invalid");
  const recorded = new Date(input.recordedAt).getTime();
  // A reading must be recent and not from the future (a little clock drift is allowed).
  if (recorded > Date.now() + 60_000 || recorded < Date.now() - 10 * 60_000) return answer(400, "invalid");
  if (existing && Date.now() - new Date(existing.updated_at).getTime() < MIN_SECONDS_BETWEEN_UPDATES * 1000) {
    return answer(429, "too_frequent");
  }

  const { error } = await supabase.from("patient_last_locations").upsert({
    patient_id: user.id,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_meters: input.accuracy === null ? null : Math.round(input.accuracy),
    recorded_at: new Date(recorded).toISOString(),
    device_state: "ok",
    device_state_at: new Date().toISOString(),
  });
  if (error) {
    // The code only: a position never goes into the logs.
    console.error("Location update failed:", error.code);
    return answer(500, "failed");
  }
  return answer(200);
}
