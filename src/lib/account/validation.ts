import { z } from "zod";
import type { Messages } from "@/lib/i18n/dictionaries";

export type ErrorKey = keyof Messages["errors"];

export type FormState = {
  status: "idle" | "error" | "success";
  error?: ErrorKey;
  fieldErrors?: Record<string, ErrorKey>;
};

export const idleState: FormState = { status: "idle" };

// Each message is a key into the errors dictionary, so it reaches the user translated.
const message = (key: ErrorKey) => ({ error: key });

const email = z.string().trim().toLowerCase().pipe(z.email(message("invalidEmail")));
const password = z.string().min(8, message("weakPassword")).max(72, message("weakPassword"));
const requiredName = z.string().trim().min(1, message("required")).max(100, message("required"));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, message("generic"))
    .transform((value) => value || null);

const today = () => new Date().toISOString().slice(0, 10);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, message("required")),
});

export const registerSchema = z.object({
  email,
  password,
  firstName: requiredName,
  lastName: requiredName,
  // "admin" is not an option here, and the database refuses it as well.
  role: z.enum(["patient", "caregiver"], message("required")),
  consent: z.literal("on", message("consentRequired")),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z.object({ password });

export const profileSchema = z.object({
  firstName: requiredName,
  lastName: requiredName,
  birthDate: z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d{4}-\d{2}-\d{2}$/.test(value) && value > "1900-01-01" && value <= today()), message("invalidDate"))
    .transform((value) => value || null),
  phone: z
    .string()
    .transform((value) => value.replace(/[\s()-]/g, ""))
    .refine((value) => value === "" || /^\+?[0-9]{7,15}$/.test(value), message("invalidPhone"))
    .transform((value) => value || null),
  locale: z.enum(["uz", "ru"], message("required")),
  city: requiredName,
  district: optionalText(100),
  address: optionalText(300),
  bloodType: optionalText(10),
  allergies: optionalText(2000),
  conditions: optionalText(4000),
});

export function toFormError(error: z.ZodError): FormState {
  const fieldErrors: Record<string, ErrorKey> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!fieldErrors[field]) fieldErrors[field] = (issue.message as ErrorKey) || "generic";
  }
  return { status: "error", fieldErrors };
}

/** Only same-site paths, so a crafted link cannot send someone elsewhere after login. */
export function safeNextPath(value: unknown): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/";
}
