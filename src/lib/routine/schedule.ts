// Uzbekistan has one time zone and no daylight saving, so UTC+5 is exact all year.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const MISSED_AFTER_MS = 60 * 60 * 1000;
const DUE_BEFORE_MS = 15 * 60 * 1000;
export const SNOOZE_MS = 15 * 60 * 1000;

export type MedicationRow = {
  id: string;
  name: string;
  instructions: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
};

export type ScheduleRow = {
  id: string;
  medication_id: string;
  time_of_day: string;
  days_of_week: number[];
  is_active: boolean;
  created_at: string;
};

export type LogRow = {
  schedule_id: string | null;
  scheduled_for: string;
  status: "taken" | "skipped" | "snoozed" | "need_help" | "missed";
  created_at: string;
};

export type DoseState = "upcoming" | "due" | "missed" | "snoozed" | "taken" | "skipped";

export type Dose = {
  scheduleId: string;
  medicationId: string;
  name: string;
  instructions: string | null;
  scheduledFor: string;
  time: string;
  state: DoseState;
  snoozedUntil: string | null;
  needsHelp: boolean;
};

/** Today's date in Fergana, as YYYY-MM-DD. */
export function tashkentDate(now: Date): string {
  return new Date(now.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO weekday of a YYYY-MM-DD date: 1 is Monday, 7 is Sunday. */
export function isoWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

export function tashkentInstant(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00+05:00`);
}

/** Formats an instant as HH:MM in Fergana, whatever the device's own time zone is. */
export function tashkentTime(instant: Date | string): string {
  return new Date(new Date(instant).getTime() + TASHKENT_OFFSET_MS).toISOString().slice(11, 16);
}

export function tashkentDateTimeToInstant(local: string): Date | null {
  const value = new Date(`${local.slice(0, 16)}:00+05:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

/** Works out what is due on a date. Pure, so reminders can be tested for any moment. */
export function dosesForDate(
  date: string,
  medications: MedicationRow[],
  schedules: ScheduleRow[],
  logs: LogRow[],
  now: Date,
): Dose[] {
  const medicationById = new Map(medications.map((medication) => [medication.id, medication]));
  const weekday = isoWeekday(date);
  const doses: Dose[] = [];

  for (const schedule of schedules) {
    const medication = medicationById.get(schedule.medication_id);
    if (!medication || !medication.is_active || !schedule.is_active) continue;
    if (date < medication.start_date || (medication.end_date && date > medication.end_date)) continue;
    if (!schedule.days_of_week.includes(weekday)) continue;

    const scheduled = tashkentInstant(date, schedule.time_of_day);
    // A medicine added at 14:00 should not report the 08:00 dose as missed.
    if (scheduled.getTime() < new Date(schedule.created_at).getTime() - 60_000) continue;

    const own = logs
      .filter((log) => log.schedule_id === schedule.id && new Date(log.scheduled_for).getTime() === scheduled.getTime())
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const final = own.find((log) => log.status === "taken" || log.status === "skipped");
    const lastSnooze = own.filter((log) => log.status === "snoozed").at(-1);
    const snoozedUntil = lastSnooze ? new Date(new Date(lastSnooze.created_at).getTime() + SNOOZE_MS) : null;

    let state: DoseState;
    if (final) state = final.status as DoseState;
    else if (snoozedUntil && snoozedUntil > now) state = "snoozed";
    else if (now.getTime() < scheduled.getTime() - DUE_BEFORE_MS) state = "upcoming";
    else if (now.getTime() > scheduled.getTime() + MISSED_AFTER_MS && !snoozedUntil) state = "missed";
    else state = "due";

    doses.push({
      scheduleId: schedule.id,
      medicationId: medication.id,
      name: medication.name,
      instructions: medication.instructions,
      scheduledFor: scheduled.toISOString(),
      time: schedule.time_of_day.slice(0, 5),
      state,
      snoozedUntil: state === "snoozed" && snoozedUntil ? snoozedUntil.toISOString() : null,
      needsHelp: own.some((log) => log.status === "need_help"),
    });
  }
  return doses.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}
