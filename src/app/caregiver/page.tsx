import Link from "next/link";
import { BellRing, ChevronRight, MapPinned, TicketCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { RequestCodeForm } from "@/components/care-request-forms";
import { RefreshPeriodically } from "@/components/refresh-periodically";
import { requireSession } from "@/lib/account/guard";
import { getCareRecipients, getRecentEmergencies } from "@/lib/caregiver/queries";
import { getMessages } from "@/lib/i18n/server";

export default async function CaregiverPage() {
  const t = await getMessages();
  const g = t.caregiver;
  const session = await requireSession("/caregiver");
  if (!session) return <AccountsNotConfigured t={t} title={g.title} />;

  const { people, failed } = await getCareRecipients(session.supabase);
  const { events } = await getRecentEmergencies(
    session.supabase,
    people.filter((person) => person.can_receive_sos).map((person) => person.patient_id),
  );
  const activeFor = new Set(events.filter((event) => event.status === "active").map((event) => event.patient_id));

  return (
    <div className="flex flex-col gap-4">
      <RefreshPeriodically seconds={30} />
      <BrandLogo alt={t.header.logoAlt} size={72} />
      <h1>{g.title}</h1>
      {failed && <p className="notice notice-error">{t.errors.generic}</p>}
      {!failed && people.length === 0 && <p className="notice">{g.empty}</p>}

      <ul className="flex flex-col gap-3">
        {people.map((person) => (
          <li key={person.link_id}>
            <Link href={`/caregiver/${person.patient_id}`} className="card flex min-h-[88px] items-center gap-3 hover:bg-brand-pale">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[1.2rem] font-extrabold break-words">
                  {person.first_name} {person.last_name}
                </span>
                {activeFor.has(person.patient_id) && (
                  <span className="w-fit rounded-md bg-sos px-2 font-extrabold text-white">{g.cardAlert}</span>
                )}
              </span>
              <ChevronRight aria-hidden size={28} className="shrink-0 text-brand-dark" />
            </Link>
          </li>
        ))}
      </ul>

      <Link href="/caregiver/locations" className="btn btn-secondary">
        <MapPinned aria-hidden size={24} /> {t.sharedLocations.link}
      </Link>
      <Link href="/caregiver/alerts" className={activeFor.size > 0 ? "btn btn-sos" : "btn btn-secondary"}>
        <BellRing aria-hidden size={24} /> {g.alertsLink}
      </Link>
      <Link href="/caregiver/accept" className={people.length === 0 ? "btn btn-primary" : "btn btn-secondary"}>
        <TicketCheck aria-hidden size={24} /> {g.acceptLink}
      </Link>
      <RequestCodeForm />
    </div>
  );
}
