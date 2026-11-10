import "server-only";
import { cookies } from "next/headers";

/**
 * A quick look for a session cookie, with no network call, so shared layout code
 * never waits on Supabase. It only chooses what to display: anything that reads
 * or changes data verifies the session properly first.
 */
export async function hasSessionCookie() {
  return (await cookies()).getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}
