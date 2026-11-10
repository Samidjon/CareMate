import { describe, expect, it } from "vitest";
import { formatOpeningHours } from "@/lib/facilities/hours";
import { wheelchairAccess } from "@/lib/facilities/types";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { Throttle, TtlCache } from "@/lib/maps/cache";
import { parseNominatim, parseOsrmRoute, parsePhoton } from "@/lib/maps/parsers";

describe("place search answers", () => {
  it("builds readable labels and drops duplicates", () => {
    const data = {
      features: [
        { geometry: { coordinates: [71.78, 40.38] }, properties: { name: "Mustaqillik ko‘chasi", city: "Farg‘ona", type: "street" } },
        { geometry: { coordinates: [71.79, 40.39] }, properties: { name: "Mustaqillik ko‘chasi", city: "Farg‘ona", type: "street" } },
        { geometry: { coordinates: [71.7, 40.3] }, properties: { street: "Yuksalish", housenumber: "104", city: "Farg‘ona", type: "house" } },
        { geometry: {}, properties: { name: "No position" } },
      ],
    };
    expect(parsePhoton(data)).toEqual([
      { label: "Mustaqillik ko‘chasi, Farg‘ona", latitude: 40.38, longitude: 71.78, kind: "street" },
      { label: "Yuksalish 104, Farg‘ona", latitude: 40.3, longitude: 71.7, kind: "address" },
    ]);
  });

  it("copes with an empty or broken answer", () => {
    expect(parsePhoton(null)).toEqual([]);
    expect(parsePhoton({ features: "nope" as unknown })).toEqual([]);
  });
});

describe("address lookup answers", () => {
  it("splits street, district and city", () => {
    const result = parseNominatim({
      display_name: "long",
      address: { road: "Al-Farg‘oniy", house_number: "12", city_district: "Markaz", city: "Farg‘ona" },
    });
    expect(result).toEqual({ address: "Al-Farg‘oniy 12, Markaz, Farg‘ona", street: "Al-Farg‘oniy 12", district: "Markaz", city: "Farg‘ona" });
  });

  it("reports nothing for an error answer", () => {
    expect(parseNominatim({ error: "Unable to geocode" })).toBeNull();
  });
});

describe("walking routes", () => {
  it("uses the service's own walking time, never an invented one", () => {
    const route = parseOsrmRoute({ code: "Ok", routes: [{ distance: 2006.9, duration: 1605.5, geometry: { coordinates: [[71.78, 40.39], [71.79, 40.38]] } }] });
    expect(route).toEqual({ distanceKm: 2.0069, durationMin: 27, line: [[40.39, 71.78], [40.38, 71.79]] });
  });

  it("returns nothing when there is no route", () => {
    expect(parseOsrmRoute({ code: "NoRoute", routes: [] })).toBeNull();
  });
});

describe("opening hours", () => {
  const uz = dictionaries.uz.hours;
  const ru = dictionaries.ru.hours;

  it("translates the common forms", () => {
    expect(formatOpeningHours("Mo-Sa 08:00-18:00", uz)).toEqual({ lines: ["Du–Sh 08:00–18:00"], exact: true });
    expect(formatOpeningHours("Mo-Fr 08:00-17:00; Sa 09:00-13:00; Su off", ru)).toEqual({
      lines: ["Пн–Пт 08:00–17:00", "Сб 09:00–13:00", "Вс выходной"],
      exact: true,
    });
    expect(formatOpeningHours("24/7", ru)).toEqual({ lines: ["Круглосуточно"], exact: true });
    expect(formatOpeningHours("Mo,We 08:00-12:00,14:00-18:00", uz)).toEqual({ lines: ["Du, Ch 08:00–12:00, 14:00–18:00"], exact: true });
  });

  it("does not guess at forms it does not understand", () => {
    expect(formatOpeningHours("Mo-Fr 08:00-17:00; PH off", uz)).toEqual({ raw: "Mo-Fr 08:00-17:00; PH off", exact: false });
    expect(formatOpeningHours("by appointment", uz)).toEqual({ raw: "by appointment", exact: false });
  });
});

describe("wheelchair access", () => {
  const base = { wheelchair_ramp: null, accessible_entrance: null, elevator: null, accessible_toilet: null, wheelchair_route: null, visual_impairment_assistance: null, hearing_impairment_assistance: null, accessibility_verified: "unverified" as const, accessibility_notes: null };
  it("is yes only with evidence, no only when stated, otherwise unknown", () => {
    expect(wheelchairAccess({ accessibility: null })).toBeNull();
    expect(wheelchairAccess({ accessibility: base })).toBeNull();
    expect(wheelchairAccess({ accessibility: { ...base, accessible_entrance: true } })).toBe(true);
    expect(wheelchairAccess({ accessibility: { ...base, accessible_entrance: false } })).toBe(false);
    expect(wheelchairAccess({ accessibility: { ...base, elevator: true } })).toBeNull();
  });
});

describe("politeness to public services", () => {
  it("spaces calls apart and gives up rather than queue for too long", async () => {
    const throttle = new Throttle(120);
    const start = Date.now();
    expect(await throttle.wait(1000)).toBe(true);
    expect(await throttle.wait(1000)).toBe(true);
    expect(Date.now() - start).toBeGreaterThanOrEqual(110);
    expect(await throttle.wait(10)).toBe(false);
  });

  it("caches answers until they expire", async () => {
    const cache = new TtlCache<number>(50, 2);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(cache.get("b")).toBeUndefined();
  });
});
