import Link from "next/link";
import { CalendarDays, ChevronRight, History, Plus } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { DoseCard } from "@/components/dose-card";
import { RefreshPeriodically } from "@/components/refresh-periodically";
import { requireSession } from "@/lib/account/guard";
import { getMessages } from "@/lib/i18n/server";
import { loadRoutine } from "@/lib/routine/queries";

export default async function RoutinePage() {
  const t = await getMessages();
  const r = t.routine;
  const session = await requireSession("/routine");
  if (!session) return <AccountsNotConfigured t={t} title={r.title} />;
  const { supabase, user } = session;

  const { medications: medicationRows, doses, failed } = await loadRoutine(supabase, user.id);
  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        <h1>{r.title}</h1>
        <p className="notice notice-error">{t.errors.generic}</p>
      </div>
    );
  }

  // A helper's change is never silent: the patient sees who made it.
  const helperIds = [...new Set(medicationRows.map((row) => row.updated_by).filter((id): id is string => Boolean(id) && id !== user.id))];
  const { data: helpers } = helperIds.length ? await supabase.from("profiles").select("id, first_name").in("id", helperIds) : { data: [] };
  const helperName = (id: string) => helpers?.find((row) => row.id === id)?.first_name || r.helperFallback;

  return (
    <div className="flex flex-col gap-4">
      <RefreshPeriodically seconds={60} />
      <h1>{r.title}</h1>
      <Link href="/routine/new" className="btn btn-primary">
        <Plus aria-hidden size={24} /> {r.add}
      </Link>

      <section aria-labelledby="today-title" className="flex flex-col gap-2">
        <h2 id="today-title">{r.todayTitle}</h2>
        {doses.length === 0 && <p className="notice">{r.emptyToday}</p>}
        <ul className="flex flex-col gap-3">
          {doses.map((dose) => (
            <DoseCard key={`${dose.scheduleId}-${dose.scheduledFor}`} dose={dose} />
          ))}
        </ul>
        {doses.length > 0 && <p className="secondary-text text-[0.9rem] text-muted">{r.notificationsNote}</p>}
      </section>

      <section aria-labelledby="medicines-title" className="flex flex-col gap-2">
        <h2 id="medicines-title">{r.medicinesTitle}</h2>
        {medicationRows.length === 0 && <p className="notice">{r.emptyMedicines}</p>}
        <ul className="flex flex-col gap-2">
          {medicationRows.map((medication) => (
            <li key={medication.id}>
              <Link href={`/routine/${medication.id}`} data-voice-sensitive data-voice={medication.name} className="card flex min-h-[60px] items-center gap-2 hover:bg-brand-pale">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold break-words">{medication.name}</span>
                  {!medication.is_active && <span className="text-[0.9rem]">{r.stopped}</span>}
                  {medication.updated_by && medication.updated_by !== user.id && (
                    <span className="text-[0.9rem]">{r.changedByHelper(helperName(medication.updated_by))}</span>
                  )}
                </span>
                <ChevronRight aria-hidden size={24} className="shrink-0 text-brand-dark" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link href="/routine/history" className="btn btn-secondary">
        <History aria-hidden size={22} /> {r.history}
      </Link>
      <Link href="/appointments" className="btn btn-secondary">
        <CalendarDays aria-hidden size={22} /> {r.appointments}
      </Link>
    </div>
  );
}
