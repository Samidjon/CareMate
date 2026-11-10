import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { requireSession } from "@/lib/account/guard";
import { getLocale, getMessages } from "@/lib/i18n/server";

type HistoryRow = {
  id: string;
  medication_id: string;
  scheduled_for: string;
  status: "taken" | "skipped" | "snoozed" | "need_help" | "missed";
  acted_by: string | null;
};

export default async function HistoryPage() {
  const t = await getMessages();
  const locale = await getLocale();
  const r = t.routine;
  const session = await requireSession("/routine/history");
  if (!session) return <AccountsNotConfigured t={t} title={r.history} />;

  const [logs, medications] = await Promise.all([
    session.supabase
      .from("medication_logs")
      .select("id, medication_id, scheduled_for, status, acted_by")
      .eq("patient_id", session.user.id)
      .order("scheduled_for", { ascending: false })
      .limit(100),
    session.supabase.from("medications").select("id, name").eq("patient_id", session.user.id),
  ]);
  const names = new Map((medications.data ?? []).map((row) => [row.id, row.name]));
  const helperIds = [...new Set((logs.data ?? []).map((row) => row.acted_by).filter((id) => id && id !== session.user.id))];
  const { data: helpers } = helperIds.length ? await session.supabase.from("profiles").select("id, first_name").in("id", helperIds) : { data: [] };
  const when = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  });

  return (
    <div className="flex flex-col gap-4">
      <h1>{r.history}</h1>
      {logs.error && <p className="notice notice-error">{t.errors.generic}</p>}
      {!logs.error && logs.data?.length === 0 && <p className="notice">{r.historyEmpty}</p>}
      <ul className="flex flex-col gap-2">
        {(logs.data as HistoryRow[] | null)?.map((log) => (
          <li key={log.id} className="card flex flex-col">
            <span className="font-bold break-words">{names.get(log.medication_id) ?? "—"}</span>
            <span>{when.format(new Date(log.scheduled_for))}</span>
            <span>{r.historyStatus[log.status]}</span>
            {log.acted_by && log.acted_by !== session.user.id && (
              <span className="text-[0.9rem]">{r.markedBy(helpers?.find((row) => row.id === log.acted_by)?.first_name || r.helperFallback)}</span>
            )}
          </li>
        ))}
      </ul>
      <Link href="/routine" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
