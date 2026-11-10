import { notFound } from "next/navigation";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { MedicationForm } from "@/components/medication-form";
import { requireSession } from "@/lib/account/guard";
import { getCareRecipients } from "@/lib/caregiver/queries";
import { getMessages } from "@/lib/i18n/server";
import { tashkentDate } from "@/lib/routine/schedule";

export default async function CaregiverNewMedicinePage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const t = await getMessages();
  const session = await requireSession(`/caregiver/${patientId}/medicines/new`);
  if (!session) return <AccountsNotConfigured t={t} title={t.routine.newTitle} />;
  const { people } = await getCareRecipients(session.supabase);
  const person = people.find((item) => item.patient_id === patientId);
  if (!person?.can_manage_reminders) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="break-words">
        {t.routine.newTitle}: {person.first_name}
      </h1>
      <p className="notice">{t.caregiver.detail.visibleNote}</p>
      <MedicationForm
        initial={{
          patientId,
          name: "",
          instructions: "",
          times: [],
          days: [1, 2, 3, 4, 5, 6, 7],
          startDate: tashkentDate(new Date()),
          endDate: "",
        }}
      />
    </div>
  );
}
