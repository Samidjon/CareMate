import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Plus } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { DoseCard } from "@/components/dose-card";
import { EmergencyAlertCard } from "@/components/emergency-alert-card";
import { RefreshPeriodically } from "@/components/refresh-periodically";
import { requireSession } from "@/lib/account/guard";
import { setMedicationActiveAction } from "@/lib/care/actions";
import { revokeLinkAction } from "@/lib/caregiver/actions";
import { canSeeAppointments, canSeeMedicines } from "@/lib/caregiver/permissions";
import { getCareRecipients, getRecentEmergencies } from "@/lib/caregiver/queries";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { loadRoutine } from "@/lib/routine/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PatientDetailsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  if (!UUID.test(patientId)) notFound();
  const t = await getMessages();
  const locale = await getLocale();
  const d = t.caregiver.detail;
  const c = t.circle;
  const session = await requireSession(`/caregiver/${patientId}`);
  if (!session) return <AccountsNotConfigured t={t} title={t.caregiver.title} />;
  const { supabase, user } = session;

  const { people } = await getCareRecipients(supabase);
  const person = people.find((item) => item.patient_id === patientId);
  // No active link looks exactly like no such person.
  if (!person) notFound();

  const name = `${person.first_name} ${person.last_name}`.trim();
  const showMedicines = canSeeMedicines(person);
  const showAppointments = canSeeAppointments(person);
  const manage = person.can_manage_reminders;

  // Each query runs only if shared, and Row Level Security would refuse the rest anyway.
  const [profile, health, contacts, routine, appointments, emergencies, acknowledgements] = await Promise.all([
    person.can_view_profile
      ? supabase.from("profiles").select("phone, birth_date, city, district").eq("id", patientId).maybeSingle()
      : null,
    person.can_view_health
      ? supabase.from("patient_health_info").select("blood_type, allergies, conditions").eq("patient_id", patientId).maybeSingle()
      : null,
    person.can_view_contacts
      ? supabase.from("emergency_contacts").select("id, name, phone, relationship").eq("patient_id", patientId).order("priority")
      : null,
    showMedicines ? loadRoutine(supabase, patientId) : null,
    showAppointments
      ? supabase
          .from("appointments")
          .select("id, title, doctor_name, starts_at, status")
          .eq("patient_id", patientId)
          .eq("status", "scheduled")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at")
      : null,
    person.can_receive_sos ? getRecentEmergencies(supabase, [patientId]) : null,
    supabase.from("emergency_acknowledgements").select("event_id").eq("caregiver_id", user.id),
  ]);

  const when = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" });
  const seen = new Set((acknowledgements.data ?? []).map((row) => row.event_id));
  const phone = profile?.data?.phone;
  const place = [profile?.data?.city, profile?.data?.district].filter(Boolean).join(", ");
  const notShared = (what: string) => <p className="notice">{d.notShared(what)}</p>;

  return (
    <div className="flex flex-col gap-5">
      <RefreshPeriodically seconds={30} />
      <Link href="/caregiver" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {d.back}
      </Link>
      <h1 className="break-words">{name}</h1>

      <section aria-labelledby="emergencies-title" className="flex flex-col gap-2">
        <h2 id="emergencies-title">{d.emergencies}</h2>
        {!person.can_receive_sos && notShared(c.permissions.sos)}
        {emergencies?.events.length === 0 && <p className="notice">{d.noEmergencies}</p>}
        <ul className="flex flex-col gap-3">
          {emergencies?.events.map((event) => (
            <EmergencyAlertCard key={event.id} t={t} event={event} name={name} time={when.format(new Date(event.created_at))} acknowledged={seen.has(event.id)} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="profile-title" className="card flex flex-col gap-2">
        <h2 id="profile-title">{d.profile}</h2>
        {!person.can_view_profile ? (
          notShared(c.permissions.profile)
        ) : (
          <>
            {phone ? (
              <a href={`tel:${phone}`} className="btn btn-primary">
                <Phone aria-hidden size={22} /> {d.call(name)}
              </a>
            ) : (
              <p>
                <span className="font-bold">{d.phone}:</span> {d.none}
              </p>
            )}
            <p className="break-words">
              <span className="font-bold">{d.place}:</span> {place || d.none}
            </p>
            {profile?.data?.birth_date && (
              <p>
                <span className="font-bold">{d.birthDate}:</span> {profile.data.birth_date}
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="medicines-title" className="flex flex-col gap-2">
        <h2 id="medicines-title">{d.medicines}</h2>
        {!showMedicines && notShared(c.permissions.medications)}
        {routine?.failed && <p className="notice notice-error">{t.errors.generic}</p>}
        {routine && !routine.failed && routine.doses.length === 0 && <p className="notice">{d.noDoses}</p>}
        <ul className="flex flex-col gap-3">
          {routine?.doses.map((dose) => (
            <DoseCard key={`${dose.scheduleId}-${dose.scheduledFor}`} dose={dose} patientId={patientId} readOnly={!manage} />
          ))}
        </ul>
        {showMedicines && (routine?.medications.length ?? 0) > 0 && (
          <>
            <h3 className="mt-2 font-extrabold">{d.allMedicines}</h3>
            <ul className="flex flex-col gap-2">
              {routine?.medications.map((medication) => (
                <li key={medication.id} className="card flex flex-col gap-2">
                  <p className="font-bold break-words">{medication.name}</p>
                  {medication.instructions && <p className="break-words">{medication.instructions}</p>}
                  {!medication.is_active && <p>{t.routine.stopped}</p>}
                  {manage && (
                    <form action={setMedicationActiveAction}>
                      <input type="hidden" name="id" value={medication.id} />
                      <input type="hidden" name="patientId" value={patientId} />
                      <input type="hidden" name="active" value={medication.is_active ? "false" : "true"} />
                      <button type="submit" className="btn btn-secondary">
                        {medication.is_active ? t.routine.stop : t.routine.resume}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {manage && (
          <>
            <Link href={`/caregiver/${patientId}/medicines/new`} className="btn btn-primary">
              <Plus aria-hidden size={24} /> {d.addMedicine}
            </Link>
            <p className="text-[0.9rem] text-muted">{d.visibleNote}</p>
          </>
        )}
      </section>

      <section aria-labelledby="appointments-title" className="flex flex-col gap-2">
        <h2 id="appointments-title">{d.appointments}</h2>
        {!showAppointments && notShared(c.permissions.appointments)}
        {appointments?.data?.length === 0 && <p className="notice">{d.noAppointments}</p>}
        <ul className="flex flex-col gap-2">
          {appointments?.data?.map((item) => (
            <li key={item.id} className="card flex flex-col">
              <span className="font-bold break-words">{item.title}</span>
              <span>{when.format(new Date(item.starts_at))}</span>
              {item.doctor_name && <span className="break-words">{item.doctor_name}</span>}
            </li>
          ))}
        </ul>
        {manage && (
          <Link href={`/caregiver/${patientId}/appointments/new`} className="btn btn-secondary">
            <Plus aria-hidden size={24} /> {d.addAppointment}
          </Link>
        )}
      </section>

      <section aria-labelledby="contacts-title" className="flex flex-col gap-2">
        <h2 id="contacts-title">{d.contacts}</h2>
        {!person.can_view_contacts && notShared(c.permissions.contacts)}
        <ul className="flex flex-col gap-2">
          {contacts?.data?.map((contact) => (
            <li key={contact.id} className="card flex flex-col gap-2">
              <p className="font-bold break-words">
                {contact.name}
                {contact.relationship && <span className="font-normal"> — {contact.relationship}</span>}
              </p>
              <a href={`tel:${contact.phone}`} className="btn btn-secondary">
                <Phone aria-hidden size={22} /> {d.call(contact.name)}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="health-title" className="card flex flex-col gap-2">
        <h2 id="health-title">{d.health}</h2>
        {!person.can_view_health ? (
          notShared(c.permissions.health)
        ) : (
          <>
            <p className="break-words">
              <span className="font-bold">{t.profile.bloodType}:</span> {health?.data?.blood_type ?? d.none}
            </p>
            <p className="break-words">
              <span className="font-bold">{t.profile.allergies}:</span> {health?.data?.allergies ?? d.none}
            </p>
            <p className="break-words">
              <span className="font-bold">{t.profile.conditions}:</span> {health?.data?.conditions ?? d.none}
            </p>
          </>
        )}
      </section>

      <details className="card">
        <summary className="flex min-h-[48px] cursor-pointer items-center font-bold">{d.leave}</summary>
        <div className="mt-2 flex flex-col gap-3">
          <p>{d.leaveNote}</p>
          <form action={revokeLinkAction}>
            <input type="hidden" name="linkId" value={person.link_id} />
            <input type="hidden" name="leaving" value="true" />
            <button type="submit" className="btn btn-danger">
              {d.leave}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
