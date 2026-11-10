export const facilityCategories = [
  "hospital",
  "clinic",
  "polyclinic",
  "pharmacy",
  "emergency",
  "rehabilitation",
  "dental",
  "diagnostic",
  "specialist",
] as const;
export type FacilityCategory = (typeof facilityCategories)[number];

export const accessibilityFeatures = [
  "wheelchair_ramp",
  "accessible_entrance",
  "elevator",
  "accessible_toilet",
  "wheelchair_route",
  "visual_impairment_assistance",
  "hearing_impairment_assistance",
] as const;
export type AccessibilityFeature = (typeof accessibilityFeatures)[number];

export type VerificationStatus = "verified" | "partially_verified" | "unverified";

export type FacilityAccessibility = Record<AccessibilityFeature, boolean | null> & {
  accessibility_verified: VerificationStatus;
  accessibility_notes: string | null;
};

export type Facility = {
  id: string;
  name_uz: string;
  name_ru: string | null;
  category: FacilityCategory;
  address: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  opening_hours: string | null;
  is_demo: boolean;
  data_source: string;
  source_url: string | null;
  verification_status: VerificationStatus;
  last_verified_at: string | null;
  // Added by migration 20261109000005; null or empty until it has been run.
  website: string | null;
  specialities: string[];
  provider_id: string | null;
  source_updated_at: string | null;
  photo_url: string | null;
  photo_page_url: string | null;
  photo_author: string | null;
  photo_license: string | null;
  // Added by migration 20261110000006; empty until it has been run.
  phone_numbers: unknown[];
  contact_source: string | null;
  contact_verification_status: string | null;
  contact_verified_at: string | null;
  contact_updated_at: string | null;
  accessibility: FacilityAccessibility | null;
};

export function facilityName(facility: Pick<Facility, "name_uz" | "name_ru">, locale: string) {
  return locale === "ru" && facility.name_ru ? facility.name_ru : facility.name_uz;
}

/** Yes, no or unknown for getting in with a wheelchair: a confirmed entrance or route counts. */
export function wheelchairAccess(facility: Pick<Facility, "accessibility">): boolean | null {
  const a = facility.accessibility;
  if (!a) return null;
  if (a.accessible_entrance === true || a.wheelchair_route === true || a.wheelchair_ramp === true) return true;
  if (a.accessible_entrance === false) return false;
  return null;
}
