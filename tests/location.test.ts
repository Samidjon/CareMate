import { describe, expect, it } from "vitest";
import { describeLocation, isPlausible, shouldSend, staleMinutes, type LastLocation } from "@/lib/location/logic";

const now = new Date("2026-11-09T09:32:00Z");
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
const location = (overrides: Partial<LastLocation> = {}): LastLocation => ({
  latitude: 40.3864,
  longitude: 71.7864,
  accuracy_meters: 15,
  recorded_at: at(2),
  device_state: "ok",
  device_state_at: at(2),
  ...overrides,
});

describe("what a helper is told", () => {
  it("never reveals a position unless sharing is active", () => {
    expect(describeLocation("paused", location(), now, 15)).toEqual({ kind: "paused" });
    expect(describeLocation("revoked", location(), now, 15)).toEqual({ kind: "revoked" });
    expect(describeLocation(null, location(), now, 15)).toEqual({ kind: "revoked" });
  });

  it("calls a recent position active, and an old one stale", () => {
    expect(describeLocation("active", location({ recorded_at: at(14) }), now, 15).kind).toBe("active");
    expect(describeLocation("active", location({ recorded_at: at(16) }), now, 15).kind).toBe("stale");
  });

  it("keeps the last known position when the device stops reporting", () => {
    const view = describeLocation("active", location({ recorded_at: at(5), device_state: "unavailable", device_state_at: at(1) }), now, 15);
    expect(view.kind).toBe("unavailable");
    expect(view.kind !== "paused" && view.kind !== "revoked" && view.kind !== "waiting" && view.location.latitude).toBe(40.3864);
  });

  it("a fresh position after a problem counts again", () => {
    expect(describeLocation("active", location({ recorded_at: at(1), device_state: "unavailable", device_state_at: at(3) }), now, 15).kind).toBe("active");
  });

  it("says when nothing has been shared yet", () => {
    expect(describeLocation("active", null, now, 15)).toEqual({ kind: "waiting" });
  });
});

describe("when to send a position", () => {
  const start = { latitude: 40.3864, longitude: 71.7864, at: 0 };
  it("sends the first reading", () => {
    expect(shouldSend(null, start, 0)).toBe(true);
  });
  it("never sends more than once every 30 seconds", () => {
    expect(shouldSend(start, { latitude: 40.5, longitude: 71.9 }, 10_000)).toBe(false);
  });
  it("sends after a real move, or every two minutes", () => {
    expect(shouldSend(start, { latitude: 40.3866, longitude: 71.7864 }, 40_000)).toBe(false);
    expect(shouldSend(start, { latitude: 40.3870, longitude: 71.7864 }, 40_000)).toBe(true);
    expect(shouldSend(start, start, 121_000)).toBe(true);
  });
});

describe("plausible readings", () => {
  it("accepts real positions and rejects impossible ones", () => {
    expect(isPlausible({ latitude: 40.38, longitude: 71.78, accuracy: 12 })).toBe(true);
    expect(isPlausible({ latitude: 0, longitude: 0, accuracy: 5 })).toBe(false);
    expect(isPlausible({ latitude: 95, longitude: 71, accuracy: 5 })).toBe(false);
    expect(isPlausible({ latitude: Number.NaN, longitude: 71, accuracy: null })).toBe(false);
    expect(isPlausible({ latitude: 40, longitude: 71, accuracy: -1 })).toBe(false);
  });
});

describe("stale threshold", () => {
  it("is configurable within sensible limits", () => {
    expect(staleMinutes({})).toBe(15);
    expect(staleMinutes({ LOCATION_STALE_MINUTES: "30" })).toBe(30);
    expect(staleMinutes({ LOCATION_STALE_MINUTES: "0" })).toBe(15);
    expect(staleMinutes({ LOCATION_STALE_MINUTES: "abc" })).toBe(15);
  });
});
