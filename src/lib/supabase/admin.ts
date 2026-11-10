import "server-only";
import { createClient } from "@supabase/supabase-js";
import { setting } from "@/lib/env";
import { getSupabaseConfig } from "./config";

/**
 * Bypasses Row Level Security. Only for operations the user's own session cannot
 * perform, such as deleting an account. Null if the service key is not set.
 */
export function createAdminClient() {
  const config = getSupabaseConfig();
  const serviceKey = setting("SUPABASE_SERVICE_ROLE_KEY");
  if (!config || !serviceKey) return null;
  return createClient(config.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
