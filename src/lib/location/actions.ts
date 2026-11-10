"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";
import { LOCATION_COOKIE } from "./cookie";

const UUID = z.uuid();

async function session() {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  return supabase && user ? { supabase, user } : null;
}

async function syncCookie(supabase: NonNullable<Awaited<ReturnType<typeof session>>>["supabase"], userId: string) {
  const { data } = await supabase.from("location_shares").select("id").eq("patient_id", userId).eq("status", "active").limit(1);
  const jar = await cookies();
  if (data?.length) jar.set(LOCATION_COOKIE, "1", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  else jar.delete(LOCATION_COOKIE);
}

/**
 * Turns sharing on for the chosen helpers, after the browser has granted
 * location. Everyone not chosen is set to "revoked". The database checks that
 * each helper is really connected to this patient.
 */
export async function startSharingAction(helperIds: string[]): Promise<{ ok: boolean }> {
  const chosen = helperIds.filter((id) => UUID.safeParse(id).success);
  const current = await session();
  if (!current || chosen.length === 0) return { ok: false };
  for (const id of chosen) {
    const { error } = await current.supabase.rpc("set_location_share", { caregiver: id, new_status: "active" });
    if (error) {
      console.error("Location share failed:", error.code);
      return { ok: false };
    }
  }
  await syncCookie(current.supabase, current.user.id);
  revalidatePath("/location");
  return { ok: true };
}

/** One helper on or off. Off means revoked: they lose access at once. */
export async function setHelperShareAction(formData: FormData) {
  const helper = String(formData.get("caregiverId") ?? "");
  const status = formData.get("status") === "active" ? "active" : "revoked";
  const current = await session();
  if (!current || !UUID.safeParse(helper).success) return;
  const { error } = await current.supabase.rpc("set_location_share", { caregiver: helper, new_status: status });
  if (error) console.error("Location share change failed:", error.code);
  await syncCookie(current.supabase, current.user.id);
  revalidatePath("/location");
}

/** Pause, resume or stop for everyone at once. */
export async function setAllSharesAction(formData: FormData) {
  const mode = formData.get("mode");
  const current = await session();
  if (!current || (mode !== "pause" && mode !== "resume" && mode !== "stop")) return;
  const { data: shares } = await current.supabase.from("location_shares").select("caregiver_id, status").eq("patient_id", current.user.id);
  const from = mode === "resume" ? "paused" : "active";
  const to = mode === "pause" ? "paused" : mode === "resume" ? "active" : "revoked";
  for (const share of shares ?? []) {
    const applies = mode === "stop" ? share.status !== "revoked" : share.status === from;
    if (applies) await current.supabase.rpc("set_location_share", { caregiver: share.caregiver_id, new_status: to });
  }
  // Stopping also deletes the stored position: nothing is kept that nobody may see.
  if (mode === "stop") await current.supabase.from("patient_last_locations").delete().eq("patient_id", current.user.id);
  await syncCookie(current.supabase, current.user.id);
  revalidatePath("/location");
}
