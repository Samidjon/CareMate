import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase session on account pages only. The home and SOS pages
 * deliberately stay out of this list: they must never wait on an external
 * service, and must still open if Supabase is unreachable.
 */
export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    // The page handles an unavailable session itself.
  }
  return response;
}

export const config = {
  matcher: [
    "/profile/:path*",
    "/settings/:path*",
    "/reset-password",
    "/routine/:path*",
    "/appointments/:path*",
    "/circle/:path*",
    "/caregiver/:path*",
    "/location/:path*",
    "/assistant/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
