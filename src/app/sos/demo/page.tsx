import { SosScreen } from "@/components/sos-screen";
import { hasSessionCookie } from "@/lib/account/session";
import { emergencyNumber } from "@/lib/config";

// A separate address rather than a setting, so demo mode can never stay switched
// on and take the real call button away from someone in an emergency.
export default async function SosDemoPage() {
  return <SosScreen demo signedIn={await hasSessionCookie()} emergencyNumber={emergencyNumber} />;
}
