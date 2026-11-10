import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { MedicationForm } from "@/components/medication-form";
import { requireSession } from "@/lib/account/guard";
import { getMessages } from "@/lib/i18n/server";
import { tashkentDate } from "@/lib/routine/schedule";

export default async function NewMedicationPage() {
  const t = await getMessages();
  const session = await requireSession("/routine/new");
  if (!session) return <AccountsNotConfigured t={t} title={t.routine.newTitle} />;
  return (
    <div className="flex flex-col gap-4">
      <h1>{t.routine.newTitle}</h1>
      <MedicationForm
        initial={{ name: "", instructions: "", times: [], days: [1, 2, 3, 4, 5, 6, 7], startDate: tashkentDate(new Date()), endDate: "" }}
      />
      <Link href="/routine" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
