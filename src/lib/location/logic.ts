import { distanceKm, type Coordinates } from "@/lib/geo";

/** After this long without an update, a position is shown as possibly outdated. */
export const DEFAULT_STALE_MINUTES = 15;

export function staleMinutes(env: Record<string, string | undefined> = process.env) {
  const value = Number(env.LOCATION_STALE_MINUTES);
  return Number.isFinite(value) && value >= 1 && value <= 24 * 60 ? value : DEFAULT_STALE_MINUTES;
}

export type ShareStatus = "active" | "paused" | "revoked";

export type LastLocation = Coordinates & {
  accuracy_meters: number | null;
  recorded_at: string;
  device_state: "ok" | "unavailable";
  device_state_at: string;
};

/**
 * What a helper should be told about someone's location. A position is only ever
 * "last known": "active" means recent, never "live".
 */
export type LocationView =
  | { kind: "active" | "stale" | "unavailable"; location: LastLocation }
  | { kind: "waiting" }
  | { kind: "paused" }
  | { kind: "revoked" };

export function describeLocation(status: ShareStatus | null, location: LastLocation | null, now: Date, staleAfterMinutes: number): LocationView {
  if (status === "paused") return { kind: "paused" };
  if (status !== "active") return { kind: "revoked" };
  if (!location) return { kind: "waiting" };
  if (location.device_state === "unavailable" && location.device_state_at >= location.recorded_at) {
    return { kind: "unavailable", location };
  }
  const age = now.getTime() - new Date(location.recorded_at).getTime();
  return { kind: age > staleAfterMinutes * 60_000 ? "stale" : "active", location };
}

// Enough to notice a real move, and few enough sends to spare battery and database.
const MIN_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 2 * 60_000;
const MIN_MOVE_KM = 0.025;

export type SentPosition = Coordinates & { at: number };

/** Whether a new reading is worth sending. Never more than once every 30 seconds. */
export function shouldSend(previous: SentPosition | null, next: Coordinates, now: number) {
  if (!previous) return true;
  const elapsed = now - previous.at;
  if (elapsed < MIN_INTERVAL_MS) return false;
  return elapsed >= MAX_INTERVAL_MS || distanceKm(previous, next) >= MIN_MOVE_KM;
}

/** Rejects readings no real device produces, such as 0,0 or impossible values. */
export function isPlausible(point: { latitude: number; longitude: number; accuracy: number | null }) {
  const { latitude, longitude, accuracy } = point;
  if (![latitude, longitude].every(Number.isFinite)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return accuracy === null || (Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100_000);
}
