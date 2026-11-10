"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ErrorKey, FormState } from "@/lib/account/validation";
import { isWithinRateLimit } from "@/lib/security/rate-limit";
import { createClient, getUser } from "@/lib/supabase/server";

const fail = (error: ErrorKey): FormState => ({ status: "error", error });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reportSchema = z.object({
  facilityId: z.string().regex(UUID),
  topic: z.enum(["closed", "address", "phone", "hours", "accessibility", "other"]),
  details: z.string().trim().min(3, { error: "required" }).max(1000, { error: "required" }),
});

async function session() {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  return supabase && user ? { supabase, user } : null;
}

/** A correction goes to an administrator for review; it changes nothing on its own. */
export async function reportFacilityAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = reportSchema.safeParse({
    facilityId: formData.get("facilityId"),
    topic: formData.get("topic"),
    details: formData.get("details"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: { details: "required" } };
  const current = await session();
  if (!current) return fail("noAccess");
  if (!(await isWithinRateLimit("facility-report", current.user.id, 10, 86400))) return fail("rateLimited");

  const { error } = await current.supabase.from("facility_reports").insert({
    facility_id: parsed.data.facilityId,
    reporter_id: current.user.id,
    topic: parsed.data.topic,
    details: parsed.data.details,
  });
  if (error) {
    console.error("Facility report failed:", error.code);
    return fail("saveFailed");
  }
  return { status: "success" };
}

export async function toggleSavedFacilityAction(formData: FormData) {
  const facilityId = String(formData.get("facilityId") ?? "");
  if (!UUID.test(facilityId)) return;
  const current = await session();
  if (!current) return;
  const table = current.supabase.from("user_saved_facilities");
  const { error } =
    formData.get("saved") === "true"
      ? await table.delete().eq("user_id", current.user.id).eq("facility_id", facilityId)
      : await table.insert({ user_id: current.user.id, facility_id: facilityId });
  if (error) console.error("Saved place update failed:", error.code);
  revalidatePath(`/map/${facilityId}`);
  revalidatePath("/settings");
}
