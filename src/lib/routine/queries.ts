import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dosesForDate, tashkentDate, tashkentInstant, type Dose, type LogRow, type ScheduleRow } from "./schedule";

export type MedicationListRow = {
  id: string;
  name: string;
  instructions: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  updated_by: string | null;
};

/** One patient's medicines and today's doses. Row Level Security decides who may read them. */
export async function loadRoutine(
  supabase: SupabaseClient,
  patientId: string,
): Promise<{ medications: MedicationListRow[]; doses: Dose[]; failed: boolean }> {
  const now = new Date();
  const today = tashkentDate(now);
  const [medications, schedules, logs] = await Promise.all([
    supabase.from("medications").select("id, name, instructions, start_date, end_date, is_active, updated_by").eq("patient_id", patientId).order("name"),
    supabase.from("medication_schedules").select("id, medication_id, time_of_day, days_of_week, is_active, created_at").eq("patient_id", patientId).eq("is_active", true),
    supabase.from("medication_logs").select("schedule_id, scheduled_for, status, created_at").eq("patient_id", patientId).gte("scheduled_for", tashkentInstant(today, "00:00").toISOString()),
  ]);
  if (medications.error || schedules.error || logs.error) {
    console.error("Routine load failed:", medications.error?.code ?? schedules.error?.code ?? logs.error?.code);
    return { medications: [], doses: [], failed: true };
  }
  const medicationRows = (medications.data ?? []) as MedicationListRow[];
  return {
    medications: medicationRows,
    doses: dosesForDate(today, medicationRows, (schedules.data ?? []) as ScheduleRow[], (logs.data ?? []) as LogRow[], now),
    failed: false,
  };
}
