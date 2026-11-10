import type { Coordinates } from "@/lib/geo";

export type PlaceSuggestion = Coordinates & {
  /** What to show in the list, e.g. "Mustaqillik ko‘chasi, Farg‘ona". */
  label: string;
  kind: "street" | "district" | "city" | "place" | "address";
};

export type ReverseResult = {
  address: string;
  street: string | null;
  district: string | null;
  city: string | null;
};

export type WalkingRoute = {
  distanceKm: number;
  durationMin: number;
  line: [number, number][];
};

export type ProviderError = "not_configured" | "unavailable" | "rate_limited" | "not_found";

export type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: ProviderError };

/**
 * Everything the app needs from a map service. Facility data itself lives in our
 * database; these are the lookups that need an outside service.
 */
export interface MapProvider {
  readonly id: "openstreetmap" | "google";
  isConfigured(): boolean;
  searchPlaces(query: string, near: Coordinates): Promise<ProviderResult<PlaceSuggestion[]>>;
  reverse(point: Coordinates, language: "uz" | "ru"): Promise<ProviderResult<ReverseResult>>;
  walkingRoute(from: Coordinates, to: Coordinates): Promise<ProviderResult<WalkingRoute>>;
  /** Shown on the map and next to results, as each service's terms require. */
  attribution: string;
}
