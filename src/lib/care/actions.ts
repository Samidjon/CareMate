"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFormError, type ErrorKey, type FormState } from "@/lib/account/validation";
import { tashkentDateTimeToInstant } from "@/lib/routine/schedule";
import { createClient, getUser } from "@/lib/supabase/server";
import { appointmentSchema, contactSchema, doseSchema, medicationSchema } from "./validation";

const MAX_CONTACTS = 20;

const fail = (error: ErrorKey): FormState => ({ status: "error", error });
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

async function session() {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  return supabase && user ? { supabase, user } : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whose data this is: the user's own, or a patient's. Row Level Security checks the permission. */
function targetPatient(formData: FormData, userId: string) {
  const requested = text(formData, "patientId");
  return UUID.test(requested) ? requested : userId;
}

function refreshPatient(patientId: string, userId: string) {
  revalidatePath("/routine");
  revalidatePath("/appointments");
  if (patientId !== userId) revalidatePath(`/caregiver/${patientId}`);
}

const writeError = (code: string | undefined): ErrorKey => (code === "42501" ? "noAccess" : "saveFailed");

// Contacts ---------------------------------------------------------------------

export async function addContactAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = contactSchema.safeParse({
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    relationship: text(formData, "relationship"),
  });
  if (!parsed.success) return toFormError(parsed.error);
  const current = await session();
  if (!current) return fail("noAccess");

  const { count } = await current.supabase
    .from("emergency_contacts")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", current.user.id);
  if ((count ?? 0) >= MAX_CONTACTS) return fail("tooManyContacts");

  const { error } = await current.supabase.from("emergency_contacts").insert({
    patient_id: current.user.id,
    name: parsed.data.name,
    phone: parsed.data.phone,
    relationship: parsed.data.relationship,
    priority: Math.min((count ?? 0) + 1, MAX_CONTACTS),
  });
  if (error) {
    console.error("Contact save failed:", error.code);
    return fail("saveFailed");
  }
  revalidatePath("/circle");
  return { status: "success" };
}

export async function removeContactAction(formData: FormData) {
  const current = await session();
  if (!current) return;
  const { error } = await current.supabase.from("emergency_contacts").delete().eq("id", text(formData, "id")).eq("patient_id", current.user.id);
  if (error) console.error("Contact removal failed:", error.code);
  revalidatePath("/circle");
}

// Medicines --------------------------------------------------------------------

function parseMedication(formData: FormData) {
  return medicationSchema.safeParse({
    name: text(formData, "name"),
    instructions: text(formData, "instructions"),
    times: formData.getAll("times").map(String),
    days: formData.getAll("days").map(String),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
  });
}

export async function createMedicationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseMedication(formData);
  if (!parsed.success) return toFormError(parsed.error);
  const current = await session();
  if (!current) return fail("noAccess");
  const data = parsed.data;
  const patientId = targetPatient(formData, current.user.id);

  const { data: medication, error } = await current.supabase
    .from("medications")
    .insert({
      patient_id: patientId,
      name: data.name,
      instructions: data.instructions,
      start_date: data.startDate,
      end_date: data.endDate,
    })
    .select("id")
    .single();
  if (error || !medication) {
    console.error("Medication save failed:", error?.code);
    return fail(writeError(error?.code));
  }

  const schedules = await current.supabase.from("medication_schedules").insert(
    data.times.map((time) => ({
      medication_id: medication.id,
      patient_id: patientId,
      time_of_day: time,
      days_of_week: data.days,
    })),
  );
  if (schedules.error) {
    // No half-saved medicine that looks scheduled but never reminds.
    console.error("Schedule save failed:", schedules.error.code);
    await current.supabase.from("medications").delete().eq("id", medication.id);
    return fail("saveFailed");
  }
  refreshPatient(patientId, current.user.id);
  redirect(patientId === current.user.id ? "/routine" : `/caregiver/${patientId}`);
}

export async function updateMedicationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseMedication(formData);
  if (!parsed.success) return toFormError(parsed.error);
  const current = await session();
  if (!current) return fail("noAccess");
  const id = text(formData, "id");
  const data = parsed.data;

  const { error } = await current.supabase
    .from("medications")
    .update({ name: data.name, instructions: data.instructions, start_date: data.startDate, end_date: data.endDate })
    .eq("id", id)
    .eq("patient_id", current.user.id);
  if (error) {
    console.error("Medication update failed:", error.code);
    return fail("saveFailed");
  }

  const { data: existing, error: loadError } = await current.supabase
    .from("medication_schedules")
    .select("id, time_of_day, days_of_week")
    .eq("medication_id", id)
    .eq("patient_id", current.user.id)
    .eq("is_active", true);
  if (loadError) return fail("saveFailed");

  // Unchanged schedules stay, so their history stays attached. Old ones are retired, not deleted.
  const days = data.days.join(",");
  const same = (row: { time_of_day: string; days_of_week: number[] }, time: string) =>
    row.time_of_day.slice(0, 5) === time && [...row.days_of_week].sort().join(",") === days;
  const retired = (existing ?? []).filter((row) => !data.times.some((time) => same(row, time))).map((row) => row.id);
  const added = data.times.filter((time) => !(existing ?? []).some((row) => same(row, time)));

  if (retired.length > 0) {
    const result = await current.supabase.from("medication_schedules").update({ is_active: false }).in("id", retired);
    if (result.error) return fail("saveFailed");
  }
  if (added.length > 0) {
    const result = await current.supabase.from("medication_schedules").insert(
      added.map((time) => ({ medication_id: id, patient_id: current.user.id, time_of_day: time, days_of_week: data.days })),
    );
    if (result.error) return fail("saveFailed");
  }
  revalidatePath("/routine");
  redirect("/routine");
}

export async function setMedicationActiveAction(formData: FormData) {
  const current = await session();
  if (!current) return;
  const patientId = targetPatient(formData, current.user.id);
  const { error } = await current.supabase
    .from("medications")
    .update({ is_active: text(formData, "active") === "true" })
    .eq("id", text(formData, "id"))
    .eq("patient_id", patientId);
  if (error) console.error("Medication toggle failed:", error.code);
  refreshPatient(patientId, current.user.id);
  revalidatePath(`/routine/${text(formData, "id")}`);
}

export async function deleteMedicationAction(formData: FormData) {
  const current = await session();
  if (!current) return;
  const { error } = await current.supabase.from("medications").delete().eq("id", text(formData, "id")).eq("patient_id", current.user.id);
  if (error) console.error("Medication delete failed:", error.code);
  revalidatePath("/routine");
  redirect("/routine");
}

export async function recordDoseAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = doseSchema.safeParse({
    scheduleId: text(formData, "scheduleId"),
    medicationId: text(formData, "medicationId"),
    scheduledFor: text(formData, "scheduledFor"),
    status: text(formData, "status"),
  });
  if (!parsed.success) return fail("saveFailed");
  const current = await session();
  if (!current) return fail("noAccess");

  const patientId = targetPatient(formData, current.user.id);
  const { error } = await current.supabase.from("medication_logs").insert({
    schedule_id: parsed.data.scheduleId,
    medication_id: parsed.data.medicationId,
    patient_id: patientId,
    scheduled_for: parsed.data.scheduledFor,
    status: parsed.data.status,
  });
  // 23505: this dose already has an answer, for example from a double tap.
  if (error && error.code !== "23505") {
    console.error("Dose save failed:", error.code);
    return fail(writeError(error.code));
  }
  refreshPatient(patientId, current.user.id);
  return { status: "success" };
}

// Appointments -----------------------------------------------------------------

export async function addAppointmentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = appointmentSchema.safeParse({
    title: text(formData, "title"),
    doctor: text(formData, "doctor"),
    notes: text(formData, "notes"),
    startsAt: text(formData, "startsAt"),
  });
  if (!parsed.success) return toFormError(parsed.error);
  const startsAt = tashkentDateTimeToInstant(parsed.data.startsAt);
  if (!startsAt) return { status: "error", fieldErrors: { startsAt: "invalidDate" } };
  const current = await session();
  if (!current) return fail("noAccess");

  const patientId = targetPatient(formData, current.user.id);
  const { error } = await current.supabase.from("appointments").insert({
    patient_id: patientId,
    title: parsed.data.title,
    doctor_name: parsed.data.doctor,
    notes: parsed.data.notes,
    starts_at: startsAt.toISOString(),
  });
  if (error) {
    console.error("Appointment save failed:", error.code);
    return fail(writeError(error.code));
  }
  refreshPatient(patientId, current.user.id);
  return { status: "success" };
}

export async function cancelAppointmentAction(formData: FormData) {
  const current = await session();
  if (!current) return;
  const { error } = await current.supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", text(formData, "id"))
    .eq("patient_id", current.user.id);
  if (error) console.error("Appointment cancel failed:", error.code);
  revalidatePath("/appointments");
}
