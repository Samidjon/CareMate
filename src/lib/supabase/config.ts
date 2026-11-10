import { setting } from "@/lib/env";

/**
 * The project address and public key, read when the server runs, so changing them
 * needs a redeploy or restart rather than a rebuild. A placeholder counts as "not
 * configured", not as an address. A pasted API address (ending in /rest/v1) or a
 * trailing slash is reduced to the project address.
 */
export function getSupabaseConfig(env: Record<string, string | undefined> = process.env) {
  const rawUrl = setting("NEXT_PUBLIC_SUPABASE_URL", env);
  const anonKey = setting("NEXT_PUBLIC_SUPABASE_ANON_KEY", env);
  if (!rawUrl || !/^https?:\/\//.test(rawUrl) || !anonKey) return null;
  const url = rawUrl.replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}
