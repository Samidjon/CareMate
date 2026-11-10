import { parsePhoneNumberFromString } from "libphonenumber-js";

export const phoneTypes = ["main", "reception", "appointments", "emergency", "pharmacy", "mobile"] as const;
export type PhoneType = (typeof phoneTypes)[number];

export const contactVerifications = ["officially_verified", "provider_supplied", "user_reported", "unverified", "unavailable"] as const;
export type ContactVerification = (typeof contactVerifications)[number];

export type PhoneEntry = {
  /** As the source wrote it; always shown unchanged. */
  display: string;
  /** For the tel: link. Null when the number cannot be read reliably: then no call button. */
  e164: string | null;
  type: PhoneType;
  source: string;
  verification: ContactVerification;
  verified_at: string | null;
};

/**
 * A number in international form, if it is a real, complete number. Uzbekistan
 * (+998) is assumed when no country code is given. Never guesses: anything
 * ambiguous or incomplete gives null.
 */
export function normalizePhone(raw: string): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), "UZ");
  return parsed?.isValid() ? parsed.number : null;
}

type FacilityContactFields = {
  phone: string | null;
  phone_numbers?: unknown;
  data_source: string;
  contact_verification_status?: string | null;
  contact_verified_at?: string | null;
};

function isEntry(value: unknown): value is Partial<PhoneEntry> & { display: string } {
  return typeof value === "object" && value !== null && typeof (value as { display?: unknown }).display === "string";
}

/**
 * All known numbers for a facility. Structured entries come first; older records
 * that only have a single text field are split on ";" as OpenStreetMap does.
 */
export function phonesOf(facility: FacilityContactFields): PhoneEntry[] {
  const fallbackVerification = (contactVerifications as readonly string[]).includes(facility.contact_verification_status ?? "")
    ? (facility.contact_verification_status as ContactVerification)
    : "unverified";
  const structured = Array.isArray(facility.phone_numbers) ? facility.phone_numbers.filter(isEntry) : [];
  if (structured.length > 0) {
    return structured.map((entry) => ({
      display: entry.display.slice(0, 60),
      // Recomputed rather than trusted, so a bad stored value can never reach a tel: link.
      e164: normalizePhone(entry.display),
      type: (phoneTypes as readonly string[]).includes(entry.type ?? "") ? (entry.type as PhoneType) : "main",
      source: typeof entry.source === "string" ? entry.source : facility.data_source,
      verification: (contactVerifications as readonly string[]).includes(entry.verification ?? "")
        ? (entry.verification as ContactVerification)
        : fallbackVerification,
      verified_at: typeof entry.verified_at === "string" ? entry.verified_at : null,
    }));
  }
  return (facility.phone ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((display) => ({
      display,
      e164: normalizePhone(display),
      type: "main" as const,
      source: facility.data_source,
      verification: fallbackVerification,
      verified_at: facility.contact_verified_at ?? null,
    }));
}

/** The number for the main call button: the first one that can actually be dialled. */
export function primaryPhone(facility: FacilityContactFields): PhoneEntry | null {
  return phonesOf(facility).find((entry) => entry.e164) ?? null;
}
