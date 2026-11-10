import { z } from "zod";
import type { ErrorKey } from "@/lib/account/validation";

const message = (key: ErrorKey) => ({ error: key });
const requiredText = (max: number) => z.string().trim().min(1, message("required")).max(max, message("required"));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, message("generic"))
    .transform((value) => value || null);

const uuid = z.uuid(message("generic"));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message("invalidDate"));

export const contactSchema = z.object({
  name: requiredText(120),
  phone: z
    .string()
    .transform((value) => value.replace(/[\s()-]/g, ""))
    .pipe(z.string().regex(/^\+?[0-9]{7,15}$/, message("invalidPhone"))),
  relationship: optionalText(60),
});

export const medicationSchema = z
  .object({
    name: requiredText(200),
    instructions: optionalText(2000),
    times: z
      .array(z.string())
      .transform((times) => [...new Set(times.map((time) => time.trim()).filter(Boolean))])
      .pipe(z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, message("invalidTime"))).min(1, message("timeRequired")).max(8, message("timeRequired"))),
    days: z
      .array(z.coerce.number().int().min(1).max(7))
      .min(1, message("dayRequired"))
      .transform((days) => [...new Set(days)].sort()),
    startDate: date,
    endDate: z.string().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), message("invalidDate")).transform((value) => value || null),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, { path: ["endDate"], ...message("endBeforeStart") });

export const doseSchema = z.object({
  scheduleId: uuid,
  medicationId: uuid,
  scheduledFor: z.iso.datetime(message("generic")),
  status: z.enum(["taken", "skipped", "snoozed", "need_help"], message("generic")),
});

export const appointmentSchema = z.object({
  title: requiredText(200),
  doctor: optionalText(200),
  notes: optionalText(2000),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, message("invalidDate")),
});

export const sosCreateSchema = z
  .object({
    demo: z.boolean(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    accuracy: z.number().min(0).max(1_000_000).nullable(),
  })
  .refine((data) => (data.latitude === null) === (data.longitude === null));

export const sosUpdateSchema = z.union([
  z.object({ id: uuid, status: z.literal("cancelled") }),
  z.object({ id: uuid, manualAddress: z.string().trim().min(1).max(300) }),
]);
