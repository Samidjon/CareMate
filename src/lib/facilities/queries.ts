import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Facility, FacilityAccessibility } from "./types";

const BASE_COLUMNS =
  "id, name_uz, name_ru, category, address, district, latitude, longitude, phone, opening_hours, is_demo, data_source, source_url, verification_status, last_verified_at";
const DIRECTORY_COLUMNS = "website, specialities, provider_id, source_updated_at, photo_url, photo_page_url, photo_author, photo_license";
const CONTACT_COLUMNS = "phone_numbers, contact_source, contact_verification_status, contact_verified_at, contact_updated_at";
const ACCESSIBILITY_BASE =
  "facility_id, wheelchair_ramp, accessible_entrance, elevator, accessible_toilet, wheelchair_route, visual_impairment_assistance, accessibility_verified, accessibility_notes";

export type FacilitiesResult =
  | { status: "ok"; facilities: Facility[] }
  | { status: "not_configured" | "error"; facilities: [] };

// Public data, read with no session: an expired login can never break the map.
function publicClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// 42703: a column the database does not have yet, i.e. a migration still to run.
const missingColumn = (error: { code?: string } | null) => error?.code === "42703";

const EMPTY_DIRECTORY = {
  website: null,
  specialities: [],
  provider_id: null,
  source_updated_at: null,
  photo_url: null,
  photo_page_url: null,
  photo_author: null,
  photo_license: null,
  phone_numbers: [],
  contact_source: null,
  contact_verification_status: null,
  contact_verified_at: null,
  contact_updated_at: null,
};

export async function getFacilities(id?: string): Promise<FacilitiesResult> {
  const supabase = publicClient();
  if (!supabase) return { status: "not_configured", facilities: [] };

  const facilities = (columns: string) => {
    const query = supabase.from("medical_facilities").select(columns).limit(2000);
    return id ? query.eq("id", id) : query;
  };
  const accessibility = (columns: string) => {
    const query = supabase.from("facility_accessibility").select(columns).limit(2000);
    return id ? query.eq("facility_id", id) : query;
  };

  // Newer columns first; if the newest migration has not been run, carry on without them.
  let [facilityRows, accessibilityRows] = await Promise.all([
    facilities(`${BASE_COLUMNS}, ${DIRECTORY_COLUMNS}, ${CONTACT_COLUMNS}`),
    accessibility(`${ACCESSIBILITY_BASE}, hearing_impairment_assistance`),
  ]);
  if (missingColumn(facilityRows.error)) facilityRows = await facilities(`${BASE_COLUMNS}, ${DIRECTORY_COLUMNS}`);
  if (missingColumn(facilityRows.error)) facilityRows = await facilities(BASE_COLUMNS);
  if (missingColumn(accessibilityRows.error)) accessibilityRows = await accessibility(ACCESSIBILITY_BASE);
  if (facilityRows.error || accessibilityRows.error) {
    console.error("Facility load failed:", facilityRows.error?.code ?? accessibilityRows.error?.code);
    return { status: "error", facilities: [] };
  }

  const byFacility = new Map<string, FacilityAccessibility>();
  for (const row of (accessibilityRows.data ?? []) as unknown as (FacilityAccessibility & { facility_id: string })[]) {
    byFacility.set(row.facility_id, { ...row, hearing_impairment_assistance: row.hearing_impairment_assistance ?? null });
  }
  return {
    status: "ok",
    facilities: ((facilityRows.data ?? []) as unknown as Facility[]).map((row) => ({
      ...EMPTY_DIRECTORY,
      ...row,
      specialities: row.specialities ?? [],
      phone_numbers: Array.isArray(row.phone_numbers) ? row.phone_numbers : [],
      accessibility: byFacility.get(row.id) ?? null,
    })),
  };
}
