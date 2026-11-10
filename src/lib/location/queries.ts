import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCareRecipients } from "@/lib/caregiver/queries";
import { describeLocation, staleMinutes, type LastLocation, type LocationView, type ShareStatus } from "./logic";

export type SharedPerson = { patientId: string; name: string; view: LocationView };

/**
 * Everyone the signed-in helper cares for who has ever shared a location with
 * them, and what may be shown. Row Level Security returns a position only while
 * sharing is active, so a paused or revoked share never reaches this code.
 */
export async function getSharedLocations(supabase: SupabaseClient, helperId: string): Promise<{ people: SharedPerson[]; failed: boolean }> {
  const { people, failed } = await getCareRecipients(supabase);
  if (failed) return { people: [], failed: true };
  const { data: shares, error } = await supabase.from("location_shares").select("patient_id, status").eq("caregiver_id", helperId);
  if (error) return { people: [], failed: error.code !== "PGRST205" };
  const visible = (shares ?? []).filter((share) => share.status !== "revoked" && people.some((person) => person.patient_id === share.patient_id));
  const ids = visible.filter((share) => share.status === "active").map((share) => share.patient_id);
  const { data: locations } = ids.length
    ? await supabase
        .from("patient_last_locations")
        .select("patient_id, latitude, longitude, accuracy_meters, recorded_at, device_state, device_state_at")
        .in("patient_id", ids)
    : { data: [] };
  const now = new Date();
  const threshold = staleMinutes();
  return {
    failed: false,
    people: visible.map((share) => {
      const person = people.find((item) => item.patient_id === share.patient_id)!;
      const location = (locations ?? []).find((row) => row.patient_id === share.patient_id) as LastLocation | undefined;
      return {
        patientId: share.patient_id,
        name: `${person.first_name} ${person.last_name}`.trim(),
        view: describeLocation(share.status as ShareStatus, location ?? null, now, threshold),
      };
    }),
  };
}
