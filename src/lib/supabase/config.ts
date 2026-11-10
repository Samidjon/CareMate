// A computed name, because the compiler replaces process.env.NEXT_PUBLIC_X, and even
// process.env["NEXT_PUBLIC_X"], with its value at build time. These settings are read
// when the server runs, so changing them needs a restart rather than a rebuild.
function runtimeEnv(name: string) {
  return process.env[name];
}

export function getSupabaseConfig() {
  const url = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  // A placeholder left in the settings counts as "not configured", not as an address.
  return url && /^https?:\/\//.test(url) && anonKey ? { url, anonKey } : null;
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}
