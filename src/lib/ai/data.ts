import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCareRecipients } from "@/lib/caregiver/queries";
import { canSeeMedicines, permissionFields, type CareRecipient } from "@/lib/caregiver/permissions";
import { filterFacilities } from "@/lib/facilities/filter";
import { phonesOf } from "@/lib/facilities/phones";
import { getFacilities } from "@/lib/facilities/queries";
import { accessibilityFeatures, facilityCategories, facilityName, wheelchairAccess, type Facility, type FacilityCategory } from "@/lib/facilities/types";
import { getSharedLocations } from "@/lib/location/queries";
import { dosesForDate, tashkentDate, tashkentInstant, tashkentTime, type LogRow, type MedicationRow, type ScheduleRow } from "@/lib/routine/schedule";
import type { ToolContextBase } from "./types";

/**
 * The assistant's only way to read personal data. Every query runs with the
 * signed-in person's own session, so Row Level Security applies exactly as it
 * does on the screens; the extra checks below only make refusals clear.
 */
export type ToolContext = ToolContextBase & { supabase: SupabaseClient };

const fullName = (first: string | null | undefined, last: string | null | undefined) => `${first ?? ""} ${last ?? ""}`.trim();

type DoseSummary = { medicine: string; time: string; state: string; instructions: string | null; day: "today" | "tomorrow" };

/** Today's doses and the next one, worked out in Fergana time from the saved schedule. */
export async function loadMedicines(ctx: ToolContext, patientId: string) {
  const today = tashkentDate(ctx.now);
  const tomorrow = tashkentDate(new Date(ctx.now.getTime() + 24 * 60 * 60 * 1000));
  const [medications, schedules, logs] = await Promise.all([
    ctx.supabase.from("medications").select("id, name, instructions, start_date, end_date, is_active").eq("patient_id", patientId),
    ctx.supabase.from("medication_schedules").select("id, medication_id, time_of_day, days_of_week, is_active, created_at").eq("patient_id", patientId).eq("is_active", true),
    ctx.supabase.from("medication_logs").select("schedule_id, scheduled_for, status, created_at").eq("patient_id", patientId).gte("scheduled_for", tashkentInstant(today, "00:00").toISOString()),
  ]);
  if (medications.error || schedules.error || logs.error) return { status: "failed" as const };
  const meds = (medications.data ?? []) as MedicationRow[];
  const scheduleRows = (schedules.data ?? []) as ScheduleRow[];
  const logRows = (logs.data ?? []) as LogRow[];
  const summarize = (day: "today" | "tomorrow") => (dose: ReturnType<typeof dosesForDate>[number]): DoseSummary => ({
    medicine: dose.name,
    time: dose.time,
    state: dose.state,
    instructions: dose.instructions,
    day,
  });
  const todayDoses = dosesForDate(today, meds, scheduleRows, logRows, ctx.now).map(summarize("today"));
  const tomorrowDoses = dosesForDate(tomorrow, meds, scheduleRows, [], ctx.now).map(summarize("tomorrow"));
  const next = todayDoses.find((dose) => dose.state === "upcoming" || dose.state === "due" || dose.state === "snoozed") ?? tomorrowDoses[0] ?? null;
  return {
    status: "ok" as const,
    timeZone: "Asia/Tashkent",
    currentTime: tashkentTime(ctx.now),
    activeMedicines: meds.filter((medication) => medication.is_active).map((medication) => medication.name),
    today: todayDoses,
    missedToday: todayDoses.filter((dose) => dose.state === "missed").length,
    next,
  };
}

const sharedPermissions = (person: CareRecipient) => permissionFields.filter((field) => person[field.column]).map((field) => field.key);

/** Who helps the person, and whom the person helps, with what each may see. */
export async function loadCareCircle(ctx: ToolContext) {
  const [links, recipients] = await Promise.all([
    ctx.supabase.from("caregiver_links").select("caregiver_id, " + permissionFields.map((field) => field.column).join(", ")).eq("patient_id", ctx.userId).eq("status", "active"),
    getCareRecipients(ctx.supabase),
  ]);
  if (links.error || recipients.failed) return { status: "failed" as const };
  const rows = (links.data ?? []) as unknown as (Record<string, boolean> & { caregiver_id: string })[];
  const ids = rows.map((row) => row.caregiver_id);
  const { data: profiles } = ids.length ? await ctx.supabase.from("profiles").select("id, first_name, last_name").in("id", ids) : { data: [] };
  return {
    status: "ok" as const,
    myHelpers: rows.map((row) => {
      const profile = profiles?.find((item) => item.id === row.caregiver_id);
      return {
        name: fullName(profile?.first_name, profile?.last_name) || "—",
        canSee: permissionFields.filter((field) => row[field.column]).map((field) => field.key),
      };
    }),
    peopleIHelp: recipients.people.map((person) => ({
      patientId: person.patient_id,
      name: fullName(person.first_name, person.last_name) || "—",
      sharedWithMe: sharedPermissions(person),
    })),
  };
}

/** Medicines of someone the helper cares for, only if that person shared them. */
export async function loadPersonMedicines(ctx: ToolContext, patientId: string) {
  const { people, failed } = await getCareRecipients(ctx.supabase);
  if (failed) return { status: "failed" as const };
  const person = people.find((item) => item.patient_id === patientId);
  if (!person) return { status: "not_connected" as const };
  if (!canSeeMedicines(person)) return { status: "not_shared" as const, name: fullName(person.first_name, person.last_name) };
  return { name: fullName(person.first_name, person.last_name), ...(await loadMedicines(ctx, patientId)) };
}

/** Last known locations the helper may see. Paused or stopped sharing gives no position. */
export async function loadSharedLocations(ctx: ToolContext) {
  const { people, failed } = await getSharedLocations(ctx.supabase, ctx.userId);
  if (failed) return { status: "failed" as const };
  return {
    status: "ok" as const,
    note: "Positions are the last known location, not live tracking.",
    people: people.map(({ name, view }) => {
      if (view.kind === "paused" || view.kind === "revoked" || view.kind === "waiting") return { name, sharing: view.kind };
      const minutesAgo = Math.max(0, Math.round((ctx.now.getTime() - new Date(view.location.recorded_at).getTime()) / 60_000));
      return {
        name,
        sharing: view.kind,
        lastUpdated: tashkentTime(view.location.recorded_at),
        minutesAgo,
        accuracyMeters: view.location.accuracy_meters,
        latitude: Number(view.location.latitude.toFixed(5)),
        longitude: Number(view.location.longitude.toFixed(5)),
      };
    }),
  };
}

/** Whom the person shares their own location with right now. */
export async function loadMySharing(ctx: ToolContext) {
  const [shares, last] = await Promise.all([
    ctx.supabase.from("location_shares").select("caregiver_id, status").eq("patient_id", ctx.userId),
    ctx.supabase.from("patient_last_locations").select("recorded_at").eq("patient_id", ctx.userId).maybeSingle(),
  ]);
  if (shares.error) return { status: shares.error.code === "PGRST205" ? ("not_set_up" as const) : ("failed" as const) };
  const rows = (shares.data ?? []).filter((row) => row.status !== "revoked");
  const ids = rows.map((row) => row.caregiver_id);
  const { data: profiles } = ids.length ? await ctx.supabase.from("profiles").select("id, first_name, last_name").in("id", ids) : { data: [] };
  return {
    status: "ok" as const,
    shares: rows.map((row) => {
      const profile = profiles?.find((item) => item.id === row.caregiver_id);
      return { helper: fullName(profile?.first_name, profile?.last_name) || "—", status: row.status as "active" | "paused" };
    }),
    lastSent: last.data?.recorded_at ? tashkentTime(last.data.recorded_at) : null,
  };
}

const wheelchairWord = (value: boolean | null) => (value === true ? "yes" : value === false ? "no" : "unknown");

export type FacilitySearch = { query: string; category: FacilityCategory | "all"; wheelchairOnly: boolean; nearMe: boolean; limit: number };

/** Search of the public directory. "Near me" needs a position the person agreed to give. */
export async function searchFacilities(ctx: ToolContext, search: FacilitySearch) {
  if (search.nearMe && !ctx.origin) return { status: "needs_location" as const };
  const result = await getFacilities();
  if (result.status !== "ok") return { status: "failed" as const };
  let found = filterFacilities(result.facilities, {
    query: search.query,
    category: search.category,
    maxKm: null,
    origin: search.nearMe ? ctx.origin : null,
    features: [],
  });
  if (search.wheelchairOnly) found = found.filter((facility) => wheelchairAccess(facility) === true);
  return {
    status: "ok" as const,
    total: found.length,
    facilities: found.slice(0, Math.min(Math.max(search.limit, 1), 8)).map((facility) => ({
      id: facility.id,
      name: facilityName(facility, ctx.locale),
      category: facility.category,
      address: facility.address,
      distanceKm: facility.distance === null ? null : Number(facility.distance.toFixed(1)),
      wheelchairAccess: wheelchairWord(wheelchairAccess(facility)),
      hasPhone: phonesOf(facility).some((phone) => phone.e164),
      demo: facility.is_demo,
    })),
  };
}

/** Everything known about one place, with unknown kept as unknown. */
export async function loadFacility(ctx: ToolContext, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: "not_found" as const };
  const result = await getFacilities(id);
  if (result.status !== "ok") return { status: "failed" as const };
  const facility: Facility | undefined = result.facilities[0];
  if (!facility) return { status: "not_found" as const };
  const features = Object.fromEntries(
    accessibilityFeatures.map((feature) => [feature, wheelchairWord(facility.accessibility?.[feature] ?? null)]),
  );
  return {
    status: "ok" as const,
    id: facility.id,
    name: facilityName(facility, ctx.locale),
    category: facility.category,
    address: facility.address,
    district: facility.district,
    openingHours: facility.opening_hours,
    website: facility.website,
    demo: facility.is_demo,
    dataSource: facility.data_source,
    phones: phonesOf(facility).map((phone) => ({
      number: phone.display,
      callable: phone.e164 !== null,
      e164: phone.e164,
      type: phone.type,
      verification: phone.verification,
      source: phone.source,
    })),
    accessibility: {
      wheelchairAccess: wheelchairWord(wheelchairAccess(facility)),
      features,
      verification: facility.accessibility?.accessibility_verified ?? "unverified",
      notes: facility.accessibility?.accessibility_notes ?? null,
    },
  };
}

export async function loadProfile(ctx: ToolContext) {
  const { data, error } = await ctx.supabase.from("profiles").select("first_name, last_name, role, city, district, locale").eq("id", ctx.userId).maybeSingle();
  if (error || !data) return { status: "failed" as const };
  return { status: "ok" as const, name: fullName(data.first_name, data.last_name), role: data.role, city: data.city, district: data.district, language: data.locale };
}

export const searchableCategories = ["all", ...facilityCategories] as const;
