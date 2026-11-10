"use client";

import type { Coordinates } from "@/lib/geo";
import type { PlaceSuggestion, ReverseResult, WalkingRoute } from "./types";

type GeoAnswer<T> = { ok: true; value: T } | { ok: false; error: "offline" | "failed" | "rate_limited" | "not_found" };

async function geo<T>(body: object, signal?: AbortSignal): Promise<GeoAnswer<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, error: "offline" };
  try {
    const response = await fetch("/api/geo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(12000),
    });
    if (response.status === 429) return { ok: false, error: "rate_limited" };
    if (response.status === 404) return { ok: false, error: "not_found" };
    if (!response.ok) return { ok: false, error: "failed" };
    return { ok: true, value: (await response.json()).result as T };
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return { ok: false, error: navigator.onLine ? "failed" : "offline" };
  }
}

export const searchPlaces = (query: string, near: Coordinates | null, signal: AbortSignal) =>
  geo<PlaceSuggestion[]>({ action: "search", query, near: near ?? undefined }, signal);

export const reverseGeocode = (point: Coordinates, language: "uz" | "ru") =>
  geo<ReverseResult>({ action: "reverse", point, language });

export const walkingRoute = (from: Coordinates, to: Coordinates) => geo<WalkingRoute>({ action: "route", from, to });

/** Where distances are measured from. Kept for this browser tab only, never sent to our database. */
export type Origin = Coordinates & { label: string };

const ORIGIN_KEY = "cm_origin";

export function loadOrigin(): Origin | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(ORIGIN_KEY) ?? "null");
    return value && typeof value.latitude === "number" && typeof value.longitude === "number" ? value : null;
  } catch {
    return null;
  }
}

export function saveOrigin(origin: Origin | null) {
  try {
    if (origin) sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(origin));
    else sessionStorage.removeItem(ORIGIN_KEY);
  } catch {
    // Storage can be unavailable (private mode); the page still works for this visit.
  }
}

export type LocationProblem = "denied" | "unavailable" | "timeout";

export function locationProblem(error: unknown): LocationProblem {
  const code = (error as GeolocationPositionError | undefined)?.code;
  return code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable";
}
