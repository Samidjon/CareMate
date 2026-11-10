"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ErrorKey, FormState } from "@/lib/account/validation";
import { isWithinRateLimit } from "@/lib/security/rate-limit";
import { identifyCode, wrongPlaceError } from "./code-kind";
import { createClient, getUser } from "@/lib/supabase/server";
import { permissionFields, permissionsFromForm, type Permissions } from "./permissions";

export type InviteState = FormState & { code?: string };
export type PreviewState = FormState & { code?: string; inviter?: string; permissions?: Permissions };

const fail = (error: ErrorKey): FormState => ({ status: "error", error });

async function session() {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  return supabase && user ? { supabase, user } : null;
}

export async function createInvitationAction(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const current = await session();
  if (!current) return fail("noAccess");
  if (!(await isWithinRateLimit("invite", current.user.id, 20, 3600))) return fail("rateLimited");

  const shared = permissionsFromForm(formData);
  const args = Object.fromEntries(permissionFields.map((field) => [field.argument, shared[field.key]]));
  const { data, error } = await current.supabase.rpc("create_caregiver_invitation", args);
  if (error || !data) {
    console.error("Invitation failed:", error?.code);
    return fail(error?.code === "P0001" ? "tooManyInvites" : "generic");
  }
  revalidatePath("/circle");
  return { status: "success", code: data };
}

export async function revokeInvitationAction(formData: FormData) {
  const current = await session();
  if (!current) return;
  const { error } = await current.supabase
    .from("caregiver_invitations")
    .update({ status: "revoked" })
    .eq("id", String(formData.get("id")))
    .eq("patient_id", current.user.id);
  if (error) console.error("Invitation revoke failed:", error.code);
  revalidatePath("/circle");
}

export async function updatePermissionsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const current = await session();
  if (!current) return fail("noAccess");
  const shared = permissionsFromForm(formData);
  const changes = Object.fromEntries(permissionFields.map((field) => [field.column, shared[field.key]]));
  const { error } = await current.supabase
    .from("caregiver_links")
    .update(changes)
    .eq("id", String(formData.get("linkId")))
    .eq("patient_id", current.user.id);
  if (error) {
    console.error("Permission update failed:", error.code);
    return fail("saveFailed");
  }
  revalidatePath("/circle");
  return { status: "success" };
}

/** Either side can end a link: the patient revoking, or the helper stepping away. */
export async function revokeLinkAction(formData: FormData) {
  const current = await session();
  if (!current) return;
  const { error } = await current.supabase.rpc("revoke_caregiver_link", { link: String(formData.get("linkId")) });
  if (error) console.error("Link revoke failed:", error.code);
  revalidatePath("/circle");
  revalidatePath("/caregiver");
  if (formData.get("leaving") === "true") redirect("/caregiver");
}

export async function previewInvitationAction(_previous: PreviewState, formData: FormData): Promise<PreviewState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { status: "error", fieldErrors: { code: "required" } };
  const current = await session();
  if (!current) return fail("noAccess");
  if (!(await isWithinRateLimit("accept-invite", current.user.id, 15, 900))) return fail("rateLimited");

  const { data, error } = await current.supabase.rpc("preview_caregiver_invitation", { code });
  if (error) {
    console.error("Invitation preview failed:", error.code);
    return fail("generic");
  }
  const row = data?.[0];
  if (!row) return { status: "error", fieldErrors: { code: wrongPlaceError(await identifyCode(code, current.user.id), "invitation") } };
  return { status: "success", code, inviter: row.first_name, permissions: row };
}

export async function acceptInvitationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const current = await session();
  if (!current) return fail("noAccess");
  if (!(await isWithinRateLimit("accept-invite", current.user.id, 15, 900))) return fail("rateLimited");
  const { error } = await current.supabase.rpc("accept_caregiver_invitation", { code: String(formData.get("code") ?? "") });
  if (error) {
    if (error.code === "P0001") return fail("ownInvite");
    if (error.code === "P0002") return fail(wrongPlaceError(await identifyCode(String(formData.get("code") ?? ""), current.user.id), "invitation"));
    console.error("Invitation accept failed:", error.code);
    return fail("generic");
  }
  revalidatePath("/caregiver");
  redirect("/caregiver");
}

export async function acknowledgeEmergencyAction(formData: FormData) {
  const current = await session();
  if (!current) return;
  const { error } = await current.supabase.rpc("acknowledge_emergency", { event: String(formData.get("eventId")) });
  if (error) console.error("Acknowledgement failed:", error.code);
  revalidatePath("/caregiver/alerts");
  revalidatePath("/caregiver");
}
