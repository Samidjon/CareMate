import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { EmergencyAlertCard } from "@/components/emergency-alert-card";
import { RefreshPeriodically } from "@/components/refresh-periodically";
import { requireSession } from "@/lib/account/guard";
import { getCareRecipients, getRecentEmergencies } from "@/lib/caregiver/queries";
import { getLocale, getMessages } from "@/lib/i18n/server";

export default async function AlertsPage() {
  const t = await getMessages();
  const locale = await getLocale();
  const a = t.caregiver.alerts;
  const session = await requireSession("/caregiver/alerts");
  if (!session) return <AccountsNotConfigured t={t} title={a.title} />;
  const { supabase, user } = session;

  const { people } = await getCareRecipients(supabase);
  const { events, failed } = await getRecentEmergencies(
    supabase,
    people.filter((person) => person.can_receive_sos).map((person) => person.patient_id),
  );
  const { data: acknowledgements } = await supabase.from("emergency_acknowledgements").select("event_id").eq("caregiver_id", user.id);
  const seen = new Set((acknowledgements ?? []).map((row) => row.event_id));
  const names = new Map(people.map((person) => [person.patient_id, `${person.first_name} ${person.last_name}`.trim()]));
  const when = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" });
  const active = events.filter((event) => event.status === "active");
  const recent = events.filter((event) => event.status !== "active");

  const card = (event: (typeof events)[number]) => (
    <EmergencyAlertCard
      key={event.id}
      t={t}
      event={event}
      name={names.get(event.patient_id) ?? ""}
      time={when.format(new Date(event.created_at))}
      acknowledged={seen.has(event.id)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <RefreshPeriodically seconds={30} />
      <h1>{a.title}</h1>
      {failed && <p className="notice notice-error">{t.errors.generic}</p>}
      {!failed && active.length === 0 && <p className="notice">{a.empty}</p>}
      <ul className="flex flex-col gap-3">{active.map(card)}</ul>
      <p className="notice notice-warn">{a.autoRefresh}</p>
      {recent.length > 0 && (
        <>
          <h2>{a.recentTitle}</h2>
          <ul className="flex flex-col gap-3">{recent.map(card)}</ul>
        </>
      )}
      <Link href="/caregiver" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
