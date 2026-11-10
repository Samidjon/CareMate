import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { MedicationForm } from "@/components/medication-form";
import { requireSession } from "@/lib/account/guard";
import { deleteMedicationAction, setMedicationActiveAction } from "@/lib/care/actions";
import { getMessages } from "@/lib/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MedicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getMessages();
  const r = t.routine;
  const session = await requireSession(`/routine/${id}`);
  if (!session) return <AccountsNotConfigured t={t} title={r.editTitle} />;

  const [{ data: medication }, { data: schedules }] = await Promise.all([
    session.supabase
      .from("medications")
      .select("id, name, instructions, start_date, end_date, is_active")
      .eq("id", id)
      .eq("patient_id", session.user.id)
      .maybeSingle(),
    session.supabase.from("medication_schedules").select("time_of_day, days_of_week").eq("medication_id", id).eq("patient_id", session.user.id).eq("is_active", true),
  ]);
  if (!medication) notFound();

  const times = (schedules ?? []).map((schedule) => schedule.time_of_day.slice(0, 5)).sort();
  const days = schedules?.[0]?.days_of_week ?? [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="flex flex-col gap-4">
      <h1>{r.editTitle}</h1>
      {!medication.is_active && <p className="notice notice-warn font-bold">{r.stopped}</p>}
      <MedicationForm
        initial={{
          id: medication.id,
          name: medication.name,
          instructions: medication.instructions ?? "",
          times,
          days,
          startDate: medication.start_date,
          endDate: medication.end_date ?? "",
        }}
      />
      <form action={setMedicationActiveAction}>
        <input type="hidden" name="id" value={medication.id} />
        <input type="hidden" name="active" value={medication.is_active ? "false" : "true"} />
        <button type="submit" className="btn btn-secondary">
          {medication.is_active ? r.stop : r.resume}
        </button>
      </form>
      <details className="card">
        <summary className="flex min-h-[48px] cursor-pointer items-center font-bold">{r.deleteTitle}</summary>
        <div className="mt-2 flex flex-col gap-3">
          <p>{r.deleteHelp}</p>
          <form action={deleteMedicationAction}>
            <input type="hidden" name="id" value={medication.id} />
            <button type="submit" className="btn btn-danger">
              {r.delete}
            </button>
          </form>
        </div>
      </details>
      <Link href="/routine" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
