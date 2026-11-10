// Reads a setting when the server runs. The name is computed on purpose: the
// compiler replaces process.env.NEXT_PUBLIC_X, and even process.env["NEXT_PUBLIC_X"],
// with its build-time value, so changing it would otherwise need a rebuild.
//
// Values pasted into a hosting dashboard often carry stray spaces, line breaks or
// quotes; those are removed so a correct value is not rejected for them.
export function setting(name: string, env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const value = raw.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  return value === "" ? undefined : value;
}
