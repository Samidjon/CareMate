import { NextResponse, type NextRequest } from "next/server";
import { sosCreateSchema, sosUpdateSchema } from "@/lib/care/validation";
import { channels } from "@/lib/notifications/channels";
import { dispatchEmergency, type DispatchSummary } from "@/lib/notifications/dispatch";
import { isWithinRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUser } from "@/lib/supabase/server";

const failure = (code: string, status: number) => NextResponse.json({ error: code }, { status });

async function session() {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  return supabase && user ? { supabase, user } : null;
}

async function readJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Records an emergency and notifies the people the patient has allowed.
 * A demo event is stored and marked, and contacts nobody.
 */
export async function POST(request: NextRequest) {
  const current = await session();
  if (!current) return failure("unauthorized", 401);
  const parsed = sosCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return failure("invalid", 400);
  if (!(await isWithinRateLimit("sos", current.user.id, 10, 600))) return failure("rate_limited", 429);

  const { demo, latitude, longitude, accuracy } = parsed.data;
  const { data: event, error } = await current.supabase
    .from("emergency_events")
    .insert({ patient_id: current.user.id, is_demo: demo, latitude, longitude, location_accuracy_m: accuracy })
    .select("id, created_at")
    .single();
  if (error || !event) {
    console.error("Emergency event failed:", error?.code);
    return failure("save_failed", 500);
  }

  if (demo) return NextResponse.json({ eventId: event.id, createdAt: event.created_at, delivery: { status: "demo", recipients: 0, reached: 0 } });

  const { data: links, error: linksError } = await current.supabase
    .from("caregiver_links")
    .select("caregiver_id")
    .eq("patient_id", current.user.id)
    .eq("status", "active")
    .eq("can_receive_sos", true);
  if (linksError) console.error("Emergency recipients failed:", linksError.code);

  const admin = createAdminClient();
  const delivery: DispatchSummary = linksError
    ? { status: "failed", recipients: 0, reached: 0 }
    : await dispatchEmergency(
        (links ?? []).map((link) => link.caregiver_id),
        channels,
        {
          eventId: event.id,
          patientId: current.user.id,
          latitude,
          longitude,
          manualAddress: null,
          createdAt: event.created_at,
        },
        async (entries) => {
          if (!admin || entries.length === 0) return;
          const { error: recordError } = await admin.from("emergency_notifications").insert(
            entries.map((entry) => ({
              event_id: event.id,
              patient_id: current.user.id,
              recipient_id: entry.recipientId,
              channel: entry.channel,
              status: entry.status,
              sent_at: entry.status === "sent" ? new Date().toISOString() : null,
            })),
          );
          if (recordError) console.error("Delivery record failed:", recordError.code);
        },
      );

  return NextResponse.json({ eventId: event.id, createdAt: event.created_at, delivery });
}

/** Who has seen an alert. Each entry is a person pressing "I saw this", so it can be trusted. */
export async function GET(request: NextRequest) {
  const current = await session();
  if (!current) return failure("unauthorized", 401);
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return failure("invalid", 400);
  const { data, error } = await current.supabase
    .from("emergency_acknowledgements")
    .select("caregiver_id, created_at")
    .eq("event_id", id)
    .eq("patient_id", current.user.id);
  if (error) {
    console.error("Acknowledgements failed:", error.code);
    return failure("load_failed", 500);
  }
  const ids = (data ?? []).map((row) => row.caregiver_id);
  const { data: people } = ids.length ? await current.supabase.from("profiles").select("id, first_name").in("id", ids) : { data: [] };
  return NextResponse.json(
    {
      acknowledgements: (data ?? []).map((row) => ({
        name: people?.find((person) => person.id === row.caregiver_id)?.first_name ?? "",
        at: row.created_at,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  const current = await session();
  if (!current) return failure("unauthorized", 401);
  const parsed = sosUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return failure("invalid", 400);

  const changes =
    "status" in parsed.data
      ? { status: parsed.data.status, resolved_at: new Date().toISOString() }
      : { manual_address: parsed.data.manualAddress };
  // Row Level Security limits this to the person's own events.
  const { error } = await current.supabase.from("emergency_events").update(changes).eq("id", parsed.data.id).eq("patient_id", current.user.id);
  if (error) {
    console.error("Emergency update failed:", error.code);
    return failure("save_failed", 500);
  }
  return NextResponse.json({ ok: true });
}
