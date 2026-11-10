// Turns answers from the public map services into our own shapes. Pure, so they
// can be tested without a network.
import type { PlaceSuggestion, ReverseResult, WalkingRoute } from "./types";

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    county?: string;
    type?: string;
  };
};

export function parsePhoton(data: unknown): PlaceSuggestion[] {
  const features = (data as { features?: PhotonFeature[] })?.features ?? [];
  const seen = new Set<string>();
  const results: PlaceSuggestion[] = [];
  for (const feature of features) {
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    const p = feature.properties ?? {};
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    const main = p.name ?? [p.street, p.housenumber].filter(Boolean).join(" ");
    if (!main) continue;
    const label = [main, p.district, p.city ?? p.county].filter((part, index, all) => part && all.indexOf(part) === index).join(", ");
    if (seen.has(label)) continue;
    seen.add(label);
    const kind = p.type === "street" ? "street" : p.type === "district" ? "district" : p.type === "city" ? "city" : p.type === "house" ? "address" : "place";
    results.push({ label: label.slice(0, 160), latitude, longitude, kind });
  }
  return results.slice(0, 6);
}

type NominatimAddress = {
  road?: string;
  house_number?: string;
  suburb?: string;
  city_district?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
};

export function parseNominatim(data: unknown): ReverseResult | null {
  const result = data as { display_name?: string; address?: NominatimAddress; error?: string };
  if (!result || result.error || !result.address) return null;
  const a = result.address;
  const street = a.road ? [a.road, a.house_number].filter(Boolean).join(" ") : null;
  const district = a.city_district ?? a.suburb ?? a.county ?? null;
  const city = a.city ?? a.town ?? a.village ?? null;
  const address = [street, district, city].filter((part, index, all) => part && all.indexOf(part) === index).join(", ");
  return { address: address || (result.display_name ?? "").slice(0, 300), street, district, city };
}

export function parseOsrmRoute(data: unknown): WalkingRoute | null {
  const route = (data as { code?: string; routes?: { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }[] })?.routes?.[0];
  if (typeof route?.distance !== "number" || typeof route.duration !== "number") return null;
  return {
    distanceKm: route.distance / 1000,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
    line: (route.geometry?.coordinates ?? []).map(([longitude, latitude]) => [latitude, longitude]),
  };
}
