import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { RefreshPeriodically } from "@/components/refresh-periodically";
import { SharedLocations } from "@/components/shared-location-card";
import { requireSession } from "@/lib/account/guard";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { staleMinutes } from "@/lib/location/logic";
import { getSharedLocations } from "@/lib/location/queries";

export default async function SharedLocationsPage() {
  const t = await getMessages();
  const locale = await getLocale();
  const s = t.sharedLocations;
  const session = await requireSession("/caregiver/locations");
  if (!session) return <AccountsNotConfigured t={t} title={s.title} />;

  const { people, failed } = await getSharedLocations(session.supabase, session.user.id);
  const when = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tashkent" });
  const shown = people.map((person) => ({
    ...person,
    updated: "location" in person.view ? when.format(new Date(person.view.location.recorded_at)) : null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <RefreshPeriodically seconds={30} />
      <h1>{s.title}</h1>
      {failed && <p className="notice notice-error">{t.errors.generic}</p>}
      {!failed && shown.length === 0 && (
        <>
          <p className="notice">{s.empty}</p>
          <p>{s.howTo}</p>
        </>
      )}
      {shown.length > 0 && <SharedLocations people={shown} staleMinutes={staleMinutes()} />}
      <p className="text-[0.9rem] text-muted">{s.autoRefresh}</p>
      <Link href="/caregiver" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
