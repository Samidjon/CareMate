import "server-only";
import { headers } from "next/headers";
import { setting } from "@/lib/env";

/**
 * The public address used in invitation and password-reset links. In order:
 * NEXT_PUBLIC_APP_URL; on Vercel, the production domain Vercel provides; otherwise
 * the address the request came in on. Never localhost on a deployed site.
 */
export async function appUrl(env: Record<string, string | undefined> = process.env) {
  const configured = setting("NEXT_PUBLIC_APP_URL", env);
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/+$/, "");
  const vercel = setting("VERCEL_PROJECT_PRODUCTION_URL", env);
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
