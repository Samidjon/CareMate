import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/account/validation";
import { createClient } from "@/lib/supabase/server";

// Opened from the confirmation and password-reset emails.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const supabase = await createClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next")), origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
