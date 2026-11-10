import "server-only";
import { createHash } from "node:crypto";
import type { ErrorKey } from "@/lib/account/validation";
import { createAdminClient } from "@/lib/supabase/admin";

/** The same hash the database uses: SHA-256 of the trimmed, upper-case code, in hex. */
export function codeHash(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase(), "utf8").digest("hex");
}

type Kind = { kind: "invitation" | "request"; mine: boolean } | null;

/**
 * Which kind of open code this is, if any. CareMate has two: an invitation, made by
 * the person being helped and entered by the helper, and a request, made by the
 * helper and entered by the person being helped. Typed into the wrong box, a valid
 * code would otherwise look "invalid or expired". Only hashes are compared; the
 * code is never stored or logged. Null when the check is unavailable.
 */
export async function identifyCode(code: string, userId: string): Promise<Kind> {
  const admin = createAdminClient();
  if (!admin || !code.trim()) return null;
  const hash = codeHash(code);
  const now = new Date().toISOString();
  const [invitation, request] = await Promise.all([
    admin.from("caregiver_invitations").select("patient_id").eq("code_hash", hash).eq("status", "pending").gt("expires_at", now).maybeSingle(),
    admin.from("caregiver_requests").select("caregiver_id").eq("code_hash", hash).eq("status", "pending").gt("expires_at", now).maybeSingle(),
  ]);
  if (invitation.data) return { kind: "invitation", mine: invitation.data.patient_id === userId };
  if (request.data) return { kind: "request", mine: request.data.caregiver_id === userId };
  return null;
}

/** The message for a code typed where it does not belong. */
export function wrongPlaceError(found: Kind, expected: "invitation" | "request"): ErrorKey {
  if (!found) return "invalidCode";
  if (found.kind === expected) return found.mine ? "ownInvite" : "invalidCode";
  if (found.kind === "request") return found.mine ? "codeIsOwnRequest" : "codeIsRequest";
  return found.mine ? "codeIsOwnInvitation" : "codeIsInvitation";
}
