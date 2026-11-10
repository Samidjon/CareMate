import { SosScreen } from "@/components/sos-screen";
import { hasSessionCookie } from "@/lib/account/session";
import { emergencyNumber } from "@/lib/config";

// Renders with no database or network call, so it opens even if Supabase is down.
export default async function SosPage() {
  return <SosScreen demo={false} signedIn={await hasSessionCookie()} emergencyNumber={emergencyNumber} />;
}
