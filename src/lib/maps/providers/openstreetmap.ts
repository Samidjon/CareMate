import "server-only";
import { Throttle, TtlCache } from "../cache";
import { parseNominatim, parseOsrmRoute, parsePhoton } from "../parsers";
import type { MapProvider, PlaceSuggestion, ProviderResult, ReverseResult, WalkingRoute } from "../types";

// Identifies the app to the public services, as their policies require.
const USER_AGENT = "CareMate/1.0 (accessible healthcare directory for Fergana; https://github.com/Samidjon/CareMate)";
const TIMEOUT_MS = 8000;

// Photon is built for search-as-you-type; Nominatim forbids it, so Nominatim is
// used only to turn a confirmed location into an address.
// Each can point at a self-hosted instance for heavier use (see README).
const PHOTON_URL = process.env.PLACE_SEARCH_URL || "https://photon.komoot.io/api/";
const NOMINATIM_URL = process.env.REVERSE_GEOCODING_URL || "https://nominatim.openstreetmap.org/reverse";
const ROUTING_URL = (process.env.WALKING_ROUTING_URL || "https://routing.openstreetmap.de/routed-foot").replace(/\/$/, "");

// Uzbekistan's Fergana valley, so searches stay local and cannot be used as a general proxy.
const BBOX = "70.5,40.0,73.2,41.3";

const searchCache = new TtlCache<PlaceSuggestion[]>(24 * 60 * 60 * 1000);
const reverseCache = new TtlCache<ReverseResult>(7 * 24 * 60 * 60 * 1000);
const routeCache = new TtlCache<WalkingRoute>(24 * 60 * 60 * 1000);
const nominatimThrottle = new Throttle(1100);
const routingThrottle = new Throttle(1100);

async function getJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 429) return "rate_limited";
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const round = (value: number) => value.toFixed(5);

export const openStreetMapProvider: MapProvider = {
  id: "openstreetmap",
  attribution: "© OpenStreetMap contributors",
  isConfigured: () => true,

  async searchPlaces(query, near) {
    const key = `${query.toLowerCase()}|${near.latitude.toFixed(2)},${near.longitude.toFixed(2)}`;
    const cached = searchCache.get(key);
    if (cached) return { ok: true, value: cached };
    const url = new URL(PHOTON_URL);
    // No "lang": the public instance rejects uz and ru, and local names come back in Uzbek.
    url.search = new URLSearchParams({ q: query, lat: String(near.latitude), lon: String(near.longitude), bbox: BBOX, limit: "8" }).toString();
    const data = await getJson(url.toString());
    if (data === "rate_limited") return { ok: false, error: "rate_limited" };
    if (data === null) return { ok: false, error: "unavailable" };
    const value = parsePhoton(data);
    searchCache.set(key, value);
    return { ok: true, value };
  },

  async reverse(point, language): Promise<ProviderResult<ReverseResult>> {
    // About 10 m: close enough for an address, and nearby lookups share a cached answer.
    const key = `${round(point.latitude).slice(0, -1)},${round(point.longitude).slice(0, -1)}|${language}`;
    const cached = reverseCache.get(key);
    if (cached) return { ok: true, value: cached };
    if (!(await nominatimThrottle.wait(4000))) return { ok: false, error: "rate_limited" };
    const url = new URL(NOMINATIM_URL);
    url.search = new URLSearchParams({
      lat: round(point.latitude),
      lon: round(point.longitude),
      format: "jsonv2",
      zoom: "18",
      addressdetails: "1",
      "accept-language": language === "ru" ? "ru,uz" : "uz,ru",
    }).toString();
    const data = await getJson(url.toString());
    if (data === "rate_limited") return { ok: false, error: "rate_limited" };
    if (data === null) return { ok: false, error: "unavailable" };
    const value = parseNominatim(data);
    if (!value) return { ok: false, error: "not_found" };
    reverseCache.set(key, value);
    return { ok: true, value };
  },

  async walkingRoute(from, to): Promise<ProviderResult<WalkingRoute>> {
    const path = `${round(from.longitude)},${round(from.latitude)};${round(to.longitude)},${round(to.latitude)}`;
    const cached = routeCache.get(path);
    if (cached) return { ok: true, value: cached };
    if (!(await routingThrottle.wait(4000))) return { ok: false, error: "rate_limited" };
    const data = await getJson(`${ROUTING_URL}/route/v1/foot/${path}?overview=full&geometries=geojson`);
    if (data === "rate_limited") return { ok: false, error: "rate_limited" };
    if (data === null) return { ok: false, error: "unavailable" };
    const value = parseOsrmRoute(data);
    if (!value) return { ok: false, error: "not_found" };
    routeCache.set(path, value);
    return { ok: true, value };
  },
};
