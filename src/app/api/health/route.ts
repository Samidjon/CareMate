import { NextResponse } from "next/server";
import { assistantModelConfig } from "@/lib/ai/config";
import { setting } from "@/lib/env";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { azureConfig } from "@/lib/voice/azure";

export const dynamic = "force-dynamic";

/**
 * Which settings this server sees, as yes or no, and whether Supabase answers.
 * Never returns a value, a key or anything about a person: it is safe to open
 * after deploying to check the hosting settings.
 */
export async function GET() {
  const supabase = getSupabaseConfig();
  let reachable: boolean | null = null;
  let tables: boolean | null = null;
  if (supabase) {
    const headers = { apikey: supabase.anonKey, Authorization: `Bearer ${supabase.anonKey}` };
    try {
      const auth = await fetch(`${supabase.url}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(5000), cache: "no-store" });
      reachable = auth.ok;
      const facilities = await fetch(`${supabase.url}/rest/v1/medical_facilities?select=id&limit=1`, { headers, signal: AbortSignal.timeout(5000), cache: "no-store" });
      tables = facilities.ok;
    } catch {
      reachable = false;
    }
  }
  return NextResponse.json(
    {
      supabase: {
        url: Boolean(setting("NEXT_PUBLIC_SUPABASE_URL")),
        anonKey: Boolean(setting("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
        // Both present and the address starts with https://
        configured: supabase !== null,
        serviceRoleKey: Boolean(setting("SUPABASE_SERVICE_ROLE_KEY")),
        // Supabase answered and accepted the public key.
        reachable,
        // The facility table can be read, i.e. the SQL files have been run.
        databaseReady: tables,
      },
      appUrl: Boolean(setting("NEXT_PUBLIC_APP_URL")),
      assistantAi: assistantModelConfig() !== null,
      uzbekVoice: azureConfig() !== null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
