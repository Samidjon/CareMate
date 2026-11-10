import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { AppointmentForm } from "@/components/appointment-form";
import { requireSession } from "@/lib/account/guard";
import { getCareRecipients } from "@/lib/caregiver/queries";
import { getMessages } from "@/lib/i18n/server";

export default async function CaregiverNewAppointmentPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const t = await getMessages();
  const session = await requireSession(`/caregiver/${patientId}/appointments/new`);
  if (!session) return <AccountsNotConfigured t={t} title={t.appointments.addTitle} />;
  const { people } = await getCareRecipients(session.supabase);
  const person = people.find((item) => item.patient_id === patientId);
  if (!person?.can_manage_reminders) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="break-words">
        {t.appointments.addTitle}: {person.first_name}
      </h1>
      <p className="notice">{t.caregiver.detail.visibleNote}</p>
      <AppointmentForm patientId={patientId} />
      <Link href={`/caregiver/${patientId}`} className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
