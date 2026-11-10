import { describe, expect, it, vi } from "vitest";
import { filterFacilities, type FacilityFilters } from "@/lib/facilities/filter";
import type { Facility } from "@/lib/facilities/types";
import { distanceKm, FERGANA_CENTER } from "@/lib/geo";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { dispatchEmergency, type EmergencyMessage, type NotificationChannel } from "@/lib/notifications/dispatch";
import { channels } from "@/lib/notifications/channels";
import {
  dosesForDate,
  isoWeekday,
  tashkentDate,
  tashkentTime,
  type LogRow,
  type MedicationRow,
  type ScheduleRow,
} from "@/lib/routine/schedule";
import { buildSmsBody, smsHref } from "@/lib/sos/messages";
import { categoryOf, toRow, toSql } from "../scripts/import-osm-facilities.mjs";

const facility = (overrides: Partial<Facility>): Facility => ({
  id: "1",
  name_uz: "Shifo",
  name_ru: "Шифо",
  category: "clinic",
  address: null,
  district: null,
  latitude: FERGANA_CENTER.latitude,
  longitude: FERGANA_CENTER.longitude,
  phone: null,
  opening_hours: null,
  is_demo: false,
  data_source: "test",
  source_url: null,
  verification_status: "unverified",
  last_verified_at: null,
  website: null,
  specialities: [],
  provider_id: null,
  source_updated_at: null,
  photo_url: null,
  photo_page_url: null,
  photo_author: null,
  photo_license: null,
  phone_numbers: [],
  contact_source: null,
  contact_verification_status: null,
  contact_verified_at: null,
  contact_updated_at: null,
  accessibility: null,
  ...overrides,
});

const noFilters: FacilityFilters = { query: "", category: "all", maxKm: null, origin: null, features: [] };

describe("facility filters", () => {
  it("searches names and addresses in either language, ignoring apostrophe style", () => {
    const list = [facility({ id: "a", name_uz: "Farg‘ona klinikasi", name_ru: "Клиника" }), facility({ id: "b", name_uz: "Boshqa", address: "Mustaqillik ko‘chasi" })];
    expect(filterFacilities(list, { ...noFilters, query: "fargona" }).map((f) => f.id)).toEqual(["a"]);
    expect(filterFacilities(list, { ...noFilters, query: "клиника" }).map((f) => f.id)).toEqual(["a"]);
    expect(filterFacilities(list, { ...noFilters, query: "ko'chasi" }).map((f) => f.id)).toEqual(["b"]);
  });

  it("filters by category", () => {
    const list = [facility({ id: "a", category: "pharmacy" }), facility({ id: "b", category: "hospital" })];
    expect(filterFacilities(list, { ...noFilters, category: "pharmacy" }).map((f) => f.id)).toEqual(["a"]);
  });

  it("treats an unknown accessibility feature as not confirmed", () => {
    const base = { wheelchair_ramp: null, accessible_entrance: null, elevator: null, accessible_toilet: null, wheelchair_route: null, visual_impairment_assistance: null, hearing_impairment_assistance: null, accessibility_verified: "unverified" as const, accessibility_notes: null };
    const list = [
      facility({ id: "yes", accessibility: { ...base, elevator: true } }),
      facility({ id: "no", accessibility: { ...base, elevator: false } }),
      facility({ id: "unknown", accessibility: { ...base } }),
      facility({ id: "none", accessibility: null }),
    ];
    expect(filterFacilities(list, { ...noFilters, features: ["elevator"] }).map((f) => f.id)).toEqual(["yes"]);
  });

  it("sorts by distance and applies the limit when location is known", () => {
    const list = [facility({ id: "far", latitude: 40.6 }), facility({ id: "near", latitude: 40.39 })];
    const results = filterFacilities(list, { ...noFilters, origin: FERGANA_CENTER });
    expect(results.map((f) => f.id)).toEqual(["near", "far"]);
    expect(filterFacilities(list, { ...noFilters, origin: FERGANA_CENTER, maxKm: 5 }).map((f) => f.id)).toEqual(["near"]);
  });

  it("ignores the distance limit without a location, rather than hiding everything", () => {
    expect(filterFacilities([facility({})], { ...noFilters, maxKm: 1 })).toHaveLength(1);
  });

  it("sorts names the same on every device, ignoring quotation marks", () => {
    // The server and a Russian browser must agree, or the page fails to hydrate.
    const list = ['"Мадад Шифо"', "«Инновацион»", "Аптека", "Shifo"].map((name_uz, index) => facility({ id: String(index), name_uz }));
    expect(filterFacilities(list, noFilters).map((f) => f.name_uz)).toEqual(["Shifo", "Аптека", "«Инновацион»", '"Мадад Шифо"']);
  });

  it("computes real distances", () => {
    // Fergana to Tashkent is roughly 235 km in a straight line.
    const km = distanceKm(FERGANA_CENTER, { latitude: 41.3111, longitude: 69.2797 });
    expect(km).toBeGreaterThan(220);
    expect(km).toBeLessThan(250);
  });
});

describe("OpenStreetMap import", () => {
  it("skips places with no name or position", () => {
    expect(toRow({ type: "node", id: 1, lat: 40, lon: 71, tags: {} })).toBeNull();
    expect(toRow({ type: "way", id: 2, tags: { name: "X" } })).toBeNull();
  });

  it("assigns categories and uses the centre of buildings", () => {
    expect(categoryOf({ amenity: "pharmacy" })).toBe("pharmacy");
    expect(categoryOf({ amenity: "hospital" })).toBe("hospital");
    expect(categoryOf({ amenity: "clinic", name: "3-poliklinika" })).toBe("polyclinic");
    expect(toRow({ type: "way", id: 3, center: { lat: 40.1, lon: 71.1 }, tags: { name: "X" } })!.latitude).toBe(40.1);
  });

  it("never lets a place name break out of the SQL", () => {
    const row = toRow({ type: "node", id: 4, lat: 40, lon: 71, tags: { name: "x'); drop table users; --" } });
    const sql = toSql([row]);
    expect(sql).toContain("x''); drop table users; --");
    expect(sql).not.toMatch(/'x'\)/);
  });

  it("derives accessibility only from tags", () => {
    expect(toRow({ type: "node", id: 5, lat: 40, lon: 71, tags: { name: "X" } })!.entrance).toBeNull();
    expect(toRow({ type: "node", id: 6, lat: 40, lon: 71, tags: { name: "X", wheelchair: "yes" } })!.entrance).toBe(true);
    expect(toRow({ type: "node", id: 7, lat: 40, lon: 71, tags: { name: "X", wheelchair: "limited" } })!.entrance).toBeNull();
    expect(toRow({ type: "node", id: 8, lat: 40, lon: 71, tags: { name: "X", wheelchair: "no" } })!.entrance).toBe(false);
  });
});

describe("Tashkent time", () => {
  it("rolls over the date at midnight in Fergana, not at midnight UTC", () => {
    expect(tashkentDate(new Date("2026-11-06T18:59:00Z"))).toBe("2026-11-06");
    expect(tashkentDate(new Date("2026-11-06T19:00:00Z"))).toBe("2026-11-07");
    expect(tashkentTime("2026-11-06T03:00:00Z")).toBe("08:00");
  });

  it("numbers weekdays from Monday", () => {
    expect(isoWeekday("2026-11-02")).toBe(1); // A Monday.
    expect(isoWeekday("2026-11-08")).toBe(7); // A Sunday.
  });
});

describe("doses", () => {
  const medication: MedicationRow = { id: "m", name: "Dori", instructions: null, start_date: "2026-11-01", end_date: null, is_active: true };
  const schedule: ScheduleRow = { id: "s", medication_id: "m", time_of_day: "08:00:00", days_of_week: [1, 2, 3, 4, 5, 6, 7], is_active: true, created_at: "2026-10-01T00:00:00Z" };
  const date = "2026-11-06";
  const scheduledFor = "2026-11-06T03:00:00.000Z"; // 08:00 in Fergana.
  const at = (time: string) => new Date(`${date}T${time}:00+05:00`);
  const log = (status: LogRow["status"], created = "2026-11-06T03:05:00Z"): LogRow => ({ schedule_id: "s", scheduled_for: scheduledFor, status, created_at: created });
  const state = (now: Date, logs: LogRow[] = [], overrides: Partial<ScheduleRow> = {}, med: Partial<MedicationRow> = {}) =>
    dosesForDate(date, [{ ...medication, ...med }], [{ ...schedule, ...overrides }], logs, now)[0]?.state;

  it("moves from upcoming to due to missed as time passes", () => {
    expect(state(at("07:00"))).toBe("upcoming");
    expect(state(at("07:50"))).toBe("due");
    expect(state(at("08:30"))).toBe("due");
    expect(state(at("09:30"))).toBe("missed");
  });

  it("schedules 08:00 in Fergana time", () => {
    expect(dosesForDate(date, [medication], [schedule], [], at("07:00"))[0].scheduledFor).toBe(scheduledFor);
  });

  it("records final answers", () => {
    expect(state(at("08:10"), [log("taken")])).toBe("taken");
    expect(state(at("23:00"), [log("skipped")])).toBe("skipped");
  });

  it("snoozes for 15 minutes, then is due again rather than missed", () => {
    const logs = [log("snoozed", "2026-11-06T03:05:00Z")];
    expect(state(at("08:10"), logs)).toBe("snoozed");
    expect(state(at("08:25"), logs)).toBe("due");
    expect(state(at("10:00"), logs)).toBe("due");
  });

  it("asking for help does not close the dose", () => {
    const dose = dosesForDate(date, [medication], [schedule], [log("need_help")], at("08:10"))[0];
    expect(dose.state).toBe("due");
    expect(dose.needsHelp).toBe(true);
  });

  it("respects weekdays, dates and stopped medicines", () => {
    expect(state(at("08:00"), [], { days_of_week: [1] })).toBeUndefined(); // 2026-11-06 is a Friday.
    expect(state(at("08:00"), [], { days_of_week: [5] })).toBe("due");
    expect(state(at("08:00"), [], {}, { start_date: "2026-11-07" })).toBeUndefined();
    expect(state(at("08:00"), [], {}, { end_date: "2026-11-05" })).toBeUndefined();
    expect(state(at("08:00"), [], {}, { end_date: date })).toBe("due");
    expect(state(at("08:00"), [], {}, { is_active: false })).toBeUndefined();
    expect(state(at("08:00"), [], { is_active: false })).toBeUndefined();
  });

  it("does not report doses from before the medicine was added", () => {
    expect(state(at("14:00"), [], { created_at: "2026-11-06T09:00:00Z" })).toBeUndefined();
  });

  it("does not mix up doses from another day", () => {
    const other: LogRow = { ...log("taken"), scheduled_for: "2026-11-05T03:00:00.000Z" };
    expect(state(at("08:10"), [other])).toBe("due");
  });
});

describe("emergency dispatch", () => {
  const message: EmergencyMessage = { eventId: "e", patientId: "p", latitude: null, longitude: null, manualAddress: null, createdAt: "now" };
  const channel = (outcome: (id: string) => "sent" | "failed" | Error, configured = true): NotificationChannel => ({
    id: "web_push",
    isConfigured: () => configured,
    send: async (id) => {
      const result = outcome(id);
      if (result instanceof Error) throw result;
      return result;
    },
  });
  const run = async (recipients: string[], list: NotificationChannel[]) => {
    const record = vi.fn(async () => {});
    return { summary: await dispatchEmergency(recipients, list, message, record), record };
  };

  it("says when nobody is linked", async () => {
    expect((await run([], [channel(() => "sent")])).summary.status).toBe("no_recipients");
  });

  it("never claims success when no channel is configured", async () => {
    const { summary, record } = await run(["a"], channels);
    expect(summary).toEqual({ status: "not_configured", recipients: 1, reached: 0 });
    expect(record).toHaveBeenCalledWith([
      { recipientId: "a", channel: "web_push", status: "not_configured" },
      { recipientId: "a", channel: "sms", status: "not_configured" },
    ]);
  });

  it("the shipped channels do not pretend to be connected", () => {
    expect(channels.every((item) => !item.isConfigured())).toBe(true);
  });

  it("reports success, partial success and failure truthfully", async () => {
    expect((await run(["a", "b"], [channel(() => "sent")])).summary).toEqual({ status: "sent", recipients: 2, reached: 2 });
    expect((await run(["a", "b"], [channel((id) => (id === "a" ? "sent" : "failed"))])).summary).toEqual({ status: "partial", recipients: 2, reached: 1 });
    expect((await run(["a"], [channel(() => "failed")])).summary.status).toBe("failed");
  });

  it("treats a crashing provider as a failure", async () => {
    expect((await run(["a"], [channel(() => new Error("boom"))])).summary.status).toBe("failed");
  });
});

describe("SOS messages", () => {
  const t = dictionaries.ru;

  it("includes the location when known", () => {
    expect(buildSmsBody(t, { latitude: 40.38, longitude: 71.78 })).toContain("https://www.openstreetmap.org/?mlat=40.38&mlon=71.78");
  });

  it("says so when the location is unknown", () => {
    expect(buildSmsBody(t, null)).toContain("Местоположение не определено");
  });

  it("does not call this an ambulance", () => {
    expect(buildSmsBody(t, null)).not.toMatch(/скор/i);
  });

  it("encodes the message for the SMS link", () => {
    expect(smsHref("+998901112233", "a b&c")).toBe("sms:+998901112233?&body=a%20b%26c");
  });
});
