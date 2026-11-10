"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/account/validation";
import { createClient, getUser } from "@/lib/supabase/server";
import { contactVerifications, normalizePhone, phoneTypes, type ContactVerification, type PhoneEntry, type PhoneType } from "./phones";

export type ContactFormState = FormState & { message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "reception: +998 73 244 93 93" lines into entries; returns the numbers of lines that are wrong. */
export async function parseContactLines(text: string): Promise<{ entries: { type: PhoneType; display: string; e164: string }[]; bad: number[] }> {
  const entries: { type: PhoneType; display: string; e164: string }[] = [];
  const bad: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const match = /^([a-z_]+)\s*:\s*(.+)$/i.exec(line);
    const type = (match?.[1].toLowerCase() ?? "main") as PhoneType;
    const display = (match ? match[2] : line).trim();
    const e164 = normalizePhone(display);
    if (!(phoneTypes as readonly string[]).includes(type) || !e164) bad.push(index + 1);
    else entries.push({ type, display: display.slice(0, 60), e164 });
  });
  return { entries, bad };
}

/**
 * An administrator sets a facility's numbers and how far they are verified.
 * Row Level Security allows this to administrators only, and the audit trigger
 * records every change.
 */
export async function saveContactsAction(_previous: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const id = String(formData.get("facilityId") ?? "");
  const status = String(formData.get("status") ?? "");
  const source = String(formData.get("source") ?? "").trim().slice(0, 200);
  const website = String(formData.get("website") ?? "").trim();
  if (!UUID.test(id) || !(contactVerifications as readonly string[]).includes(status)) return { status: "error", error: "generic" };

  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  if (!supabase || !user) return { status: "error", error: "noAccess" };

  const { entries, bad } = await parseContactLines(String(formData.get("numbers") ?? ""));
  if (bad.length) return { status: "error", fieldErrors: { numbers: "invalidPhone" }, message: bad.join(", ") };
  if (status === "officially_verified" && !source) return { status: "error", fieldErrors: { source: "required" } };
  if (website && !/^https:\/\/[^\s'"<>]+$/i.test(website)) return { status: "error", fieldErrors: { website: "generic" } };

  const now = new Date().toISOString();
  const verification = status as ContactVerification;
  const phoneNumbers: PhoneEntry[] = entries.map((entry) => ({
    ...entry,
    source: source || "CareMate",
    verification,
    verified_at: verification === "officially_verified" ? now : null,
  }));
  const { data, error } = await supabase
    .from("medical_facilities")
    .update({
      phone_numbers: phoneNumbers,
      phone: entries[0]?.display ?? null,
      website: website || null,
      contact_source: source || null,
      contact_verification_status: entries.length ? verification : "unavailable",
      contact_verified_at: verification === "officially_verified" ? now : null,
      contact_updated_at: now,
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    console.error("Contact update failed:", error?.code ?? "no rows");
    return { status: "error", error: "noAccess" };
  }
  revalidatePath(`/map/${id}`);
  revalidatePath(`/admin/facilities/${id}`);
  return { status: "success" };
}
