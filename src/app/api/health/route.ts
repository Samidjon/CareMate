import { NextResponse } from "next/server";
import { assistantModelConfig } from "@/lib/ai/config";
import { keyProblem, setting } from "@/lib/env";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { azureConfig } from "@/lib/voice/azure";

export const dynamic = "force-dynamic";

/** An error's kind, with anything from the settings removed. */
function describe(error: unknown, secrets: string[]) {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 3; depth++) {
    const item = current as { name?: string; message?: string; code?: string; cause?: unknown };
    parts.push([item.name, item.code, item.message].filter(Boolean).join(" "));
    current = item.cause;
  }
  let text = parts.join(" <- ").slice(0, 300);
  for (const secret of secrets) if (secret) text = text.split(secret).join("[setting]");
  return text;
}

/**
 * Which settings this server sees, as yes or no, whether Supabase answers, and
 * what is wrong if not. Never returns a value, a key or anything about a person:
 * it is safe to open after deploying to check the hosting settings.
 */
export async function GET() {
  const supabase = getSupabaseConfig();
  const anonKey = setting("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = setting("SUPABASE_SERVICE_ROLE_KEY");
  const problems: Record<string, string> = {};
  const anonProblem = keyProblem(anonKey);
  const serviceProblem = keyProblem(serviceKey);
  if (anonProblem) problems.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonProblem;
  if (serviceProblem) problems.SUPABASE_SERVICE_ROLE_KEY = serviceProblem;

  let reachable: boolean | null = null;
  let tables: boolean | null = null;
  let serviceKeyAccepted: boolean | null = null;
  if (supabase) {
    const call = async (path: string, key: string) =>
      fetch(`${supabase.url}${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
    try {
      const auth = await call("/auth/v1/settings", supabase.anonKey);
      reachable = auth.ok;
      if (!auth.ok) problems.supabase = `public key rejected (HTTP ${auth.status}): use the Publishable or anon key of this project`;
      const facilities = await call("/rest/v1/medical_facilities?select=id&limit=1", supabase.anonKey);
      tables = facilities.ok;
      if (auth.ok && !facilities.ok) problems.database = `facility table not readable (HTTP ${facilities.status}): run the SQL files`;
    } catch (error) {
      reachable = false;
      problems.supabase = `request failed: ${describe(error, [supabase.anonKey, serviceKey ?? ""])}`;
    }
    if (serviceKey && !serviceProblem) {
      try {
        const admin = await call("/auth/v1/admin/users?per_page=1", serviceKey);
        serviceKeyAccepted = admin.ok;
        if (!admin.ok) problems.SUPABASE_SERVICE_ROLE_KEY = `rejected (HTTP ${admin.status}): use the Secret or service_role key of this project`;
      } catch (error) {
        serviceKeyAccepted = false;
        problems.SUPABASE_SERVICE_ROLE_KEY = `request failed: ${describe(error, [supabase.anonKey, serviceKey])}`;
      }
    }
  }
  return NextResponse.json(
    {
      supabase: {
        url: Boolean(setting("NEXT_PUBLIC_SUPABASE_URL")),
        anonKey: Boolean(anonKey),
        // Both present and the address starts with https://
        configured: supabase !== null,
        serviceRoleKey: Boolean(serviceKey),
        // Supabase answered and accepted the public key.
        reachable,
        // The facility table can be read, i.e. the SQL files have been run.
        databaseReady: tables,
        serviceRoleKeyAccepted: serviceKeyAccepted,
      },
      appUrl: Boolean(setting("NEXT_PUBLIC_APP_URL")),
      assistantAi: assistantModelConfig() !== null,
      uzbekVoice: azureConfig() !== null,
      problems,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
