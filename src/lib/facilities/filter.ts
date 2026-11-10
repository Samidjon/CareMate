import { distanceKm, type Coordinates } from "@/lib/geo";
import type { AccessibilityFeature, Facility, FacilityCategory } from "./types";

export type FacilityFilters = {
  query: string;
  category: FacilityCategory | "all";
  maxKm: number | null;
  origin: Coordinates | null;
  features: AccessibilityFeature[];
};

export type FacilityResult = Facility & { distance: number | null };

// Uzbek apostrophes are typed in many ways: O‘, Oʻ, O', O`.
function normalize(text: string) {
  return text.toLowerCase().replace(/['`‘’ʻʼ"«»]/g, "").trim();
}

// Not localeCompare: its order follows the device's language, so a Russian browser
// would disagree with the server and the page would fail to hydrate.
function compareNames(a: string, b: string) {
  const left = normalize(a);
  const right = normalize(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function filterFacilities(facilities: Facility[], filters: FacilityFilters): FacilityResult[] {
  const query = normalize(filters.query);
  const results: FacilityResult[] = [];
  for (const facility of facilities) {
    if (filters.category !== "all" && facility.category !== filters.category) continue;
    // Only a confirmed "yes" passes: an unknown feature is not assumed to exist.
    if (!filters.features.every((feature) => facility.accessibility?.[feature] === true)) continue;
    if (query) {
      const haystack = normalize([facility.name_uz, facility.name_ru, facility.address, facility.district].filter(Boolean).join(" "));
      if (!haystack.includes(query)) continue;
    }
    const distance = filters.origin ? distanceKm(filters.origin, facility) : null;
    if (filters.maxKm !== null && distance !== null && distance > filters.maxKm) continue;
    results.push({ ...facility, distance });
  }
  return results.sort((a, b) =>
    a.distance !== null && b.distance !== null ? a.distance - b.distance : compareNames(a.name_uz, b.name_uz),
  );
}
