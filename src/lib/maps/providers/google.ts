import "server-only";
import type { MapProvider } from "../types";

/**
 * Connection point for Google Maps Platform. Not implemented: no key is
 * available, and Google's terms require Places results to be shown on a Google
 * map, not mixed into the OpenStreetMap map this app draws. Connecting Google
 * means a Google basemap, Places (New) for search and details, Routes API for
 * walking, and Google's attribution rules for text and photos. Until then this
 * provider reports itself as not configured and the app uses OpenStreetMap.
 */
export const googleMapsProvider: MapProvider = {
  id: "google",
  attribution: "Google",
  isConfigured: () => false,
  searchPlaces: async () => ({ ok: false, error: "not_configured" }),
  reverse: async () => ({ ok: false, error: "not_configured" }),
  walkingRoute: async () => ({ ok: false, error: "not_configured" }),
};
