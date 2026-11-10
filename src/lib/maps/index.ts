import "server-only";
import { googleMapsProvider } from "./providers/google";
import { openStreetMapProvider } from "./providers/openstreetmap";
import type { MapProvider } from "./types";

/** The configured provider, falling back to OpenStreetMap so the map never breaks. */
export function getMapProvider(): MapProvider {
  const wanted = process.env.MAP_PROVIDER;
  if (wanted === "google" && googleMapsProvider.isConfigured()) return googleMapsProvider;
  return openStreetMapProvider;
}
