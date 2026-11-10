import { openStreetMapUrl, type Coordinates } from "@/lib/geo";
import type { Messages } from "@/lib/i18n/dictionaries";

/** The text placed in the person's own SMS app. They see it and press send themselves. */
export function buildSmsBody(t: Messages, location: Coordinates | null) {
  return t.sos.smsText(location ? t.sos.smsLocation(openStreetMapUrl(location)) : t.sos.smsNoLocation);
}

export function smsHref(phone: string, body: string) {
  // "?&body=" is the form both Android and iPhone understand.
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}
