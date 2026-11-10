import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

async function clientAddress() {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
}

/**
 * Returns false when the limit is exceeded. Keys are hashed, so the table holds
 * no email or IP address. If the check itself is unavailable the action is
 * allowed: a helper must not be locked out of an account because of it.
 */
export async function isWithinRateLimit(action: string, identifier: string, maxHits: number, windowSeconds: number) {
  const admin = createAdminClient();
  if (!admin) return true;
  const address = await clientAddress();
  const key = `${action}:${createHash("sha256").update(`${address}|${identifier.toLowerCase()}`).digest("hex")}`;
  const { data, error } = await admin.rpc("check_rate_limit", {
    limit_key: key,
    max_hits: maxHits,
    window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Rate limit check failed:", error.code);
    return true;
  }
  return data === true;
}
