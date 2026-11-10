import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareRecipient } from "./permissions";

export async function getCareRecipients(supabase: SupabaseClient): Promise<{ people: CareRecipient[]; failed: boolean }> {
  const { data, error } = await supabase.rpc("my_care_recipients");
  if (error) {
    console.error("Care recipients failed:", error.code);
    return { people: [], failed: true };
  }
  return { people: (data ?? []) as CareRecipient[], failed: false };
}

export type EmergencyRow = {
  id: string;
  patient_id: string;
  status: "active" | "cancelled" | "resolved";
  latitude: number | null;
  longitude: number | null;
  manual_address: string | null;
  created_at: string;
};

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** Real alerts only: a patient trying out demo mode must never alarm their helpers. */
export async function getRecentEmergencies(supabase: SupabaseClient, patientIds: string[]) {
  if (patientIds.length === 0) return { events: [] as EmergencyRow[], failed: false };
  const { data, error } = await supabase
    .from("emergency_events")
    .select("id, patient_id, status, latitude, longitude, manual_address, created_at")
    .in("patient_id", patientIds)
    .eq("is_demo", false)
    .gte("created_at", new Date(Date.now() - RECENT_MS).toISOString())
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Emergencies failed:", error.code);
    return { events: [] as EmergencyRow[], failed: true };
  }
  return { events: (data ?? []) as EmergencyRow[], failed: false };
}
