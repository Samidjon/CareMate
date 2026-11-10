import { NextResponse } from "next/server";
import { staleMinutes } from "@/lib/location/logic";
import { getSharedLocations } from "@/lib/location/queries";
import { createClient, getUser } from "@/lib/supabase/server";

/** For a helper: the people sharing with them, and only what each may show. */
export async function GET() {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  if (!supabase || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { people, failed } = await getSharedLocations(supabase, user.id);
  if (failed) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ people, staleMinutes: staleMinutes() }, { headers: { "Cache-Control": "no-store" } });
}
