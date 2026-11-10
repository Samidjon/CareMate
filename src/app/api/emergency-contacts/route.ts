import { NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";

// Fetched from the browser, so the SOS page itself never waits on the database.
export async function GET() {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  if (!supabase || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("emergency_contacts")
    .select("id, name, phone, relationship")
    .eq("patient_id", user.id)
    .order("priority")
    .order("created_at");
  if (error) {
    console.error("Contacts load failed:", error.code);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
  return NextResponse.json({ contacts: data }, { headers: { "Cache-Control": "no-store" } });
}
