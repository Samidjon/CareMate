"use server";

import { revalidatePath } from "next/cache";
import type { ErrorKey, FormState } from "@/lib/account/validation";
import { isWithinRateLimit } from "@/lib/security/rate-limit";
import { identifyCode, wrongPlaceError } from "./code-kind";
import { createClient, getUser } from "@/lib/supabase/server";
import { permissionFields, permissionsFromForm } from "./permissions";

export type RequestCodeState = FormState & { code?: string };
export type ReviewState = FormState & { code?: string; requester?: string; decided?: "approved" | "rejected" };

const fail = (error: ErrorKey): FormState => ({ status: "error", error });

async function session() {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  return supabase && user ? { supabase, user } : null;
}

/** A helper asks to connect: they get a code to give to the person they help. */
export async function createRequestAction(): Promise<RequestCodeState> {
  const current = await session();
  if (!current) return fail("noAccess");
  if (!(await isWithinRateLimit("care-request", current.user.id, 20, 3600))) return fail("rateLimited");
  const { data, error } = await current.supabase.rpc("create_caregiver_request");
  if (error || !data) {
    console.error("Care request failed:", error?.code);
    return fail(error?.code === "P0001" ? "tooManyInvites" : error?.code === "PGRST202" ? "notConfigured" : "generic");
  }
  return { status: "success", code: data };
}

/** The patient enters the code: first they see who is asking, then they decide. */
export async function reviewRequestAction(_previous: ReviewState, formData: FormData): Promise<ReviewState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { status: "error", fieldErrors: { code: "required" } };
  const current = await session();
  if (!current) return fail("noAccess");
  if (!(await isWithinRateLimit("care-request-check", current.user.id, 15, 900))) return fail("rateLimited");

  const decision = formData.get("decision");
  if (decision !== "approve" && decision !== "reject") {
    const { data, error } = await current.supabase.rpc("preview_caregiver_request", { code });
    if (error) return fail(error.code === "PGRST202" ? "notConfigured" : "generic");
    const row = data?.[0];
    if (!row) return { status: "error", fieldErrors: { code: wrongPlaceError(await identifyCode(code, current.user.id), "request") } };
    return { status: "idle", code, requester: `${row.first_name} ${row.last_name}`.trim() };
  }

  const shared = permissionsFromForm(formData);
  const { error } = await current.supabase.rpc("decide_caregiver_request", {
    code,
    approve: decision === "approve",
    ...Object.fromEntries(permissionFields.map((field) => [field.argument, shared[field.key]])),
  });
  if (error) {
    if (error.code === "P0002") return { status: "error", fieldErrors: { code: wrongPlaceError(await identifyCode(code, current.user.id), "request") } };
    if (error.code === "P0001") return fail("ownInvite");
    console.error("Care request decision failed:", error.code);
    return fail("generic");
  }
  revalidatePath("/circle");
  return { status: "success", decided: decision === "approve" ? "approved" : "rejected" };
}
