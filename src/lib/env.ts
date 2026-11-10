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

/** What is wrong with a pasted key, without ever saying what the key is. */
export function keyProblem(value: string | undefined): string | null {
  if (!value) return "missing";
  // A masked copy from a dashboard ("sb_secret_abc••••") or a letter from another
  // alphabet cannot be sent in a request header at all.
  if (/[•…·]/.test(value)) return "looks masked: copy the full key with the copy button, not the text shown";
  if (/^[A-Z_]+=/.test(value)) return "includes the variable name: paste only the part after =";
  if (/[^!-~]/.test(value)) return "contains spaces or non-Latin characters: paste the key again";
  return null;
}
