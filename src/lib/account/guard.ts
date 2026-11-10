import "server-only";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";

/** For signed-in pages: sends visitors to login, returns null if accounts are not set up. */
export async function requireSession(nextPath: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return { supabase, user };
}
