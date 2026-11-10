import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { requireSession } from "@/lib/account/guard";
import { reviewReportAction } from "@/lib/facilities/admin-actions";
import { getLocale, getMessages } from "@/lib/i18n/server";

type Report = { id: string; facility_id: string; topic: string; details: string; created_at: string };

/** Corrections people have reported, for an administrator to accept or reject. */
export default async function ReportsPage() {
  const t = await getMessages();
  const locale = await getLocale();
  const session = await requireSession("/admin/reports");
  if (!session) return <AccountsNotConfigured t={t} title={t.admin.reportsTitle} />;
  const { supabase, user } = session;

  // Only administrators: everyone else sees no such page.
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") notFound();

  const { data, error } = await supabase
    .from("facility_reports")
    .select("id, facility_id, topic, details, created_at")
    .eq("status", "open")
    .order("created_at");
  const reports = (data ?? []) as Report[];
  const ids = [...new Set(reports.map((report) => report.facility_id))];
  const { data: facilities } = ids.length ? await supabase.from("medical_facilities").select("id, name_uz, name_ru").in("id", ids) : { data: [] };
  const nameOf = (id: string) => {
    const facility = facilities?.find((row) => row.id === id);
    return (locale === "ru" && facility?.name_ru) || facility?.name_uz || id;
  };
  const when = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" });
  const topics = t.facility.reportTopics as Record<string, string>;

  return (
    <div className="flex flex-col gap-4">
      <h1>{t.admin.reportsTitle}</h1>
      <p className="notice">{t.admin.reportsNote}</p>
      {error && <p className="notice notice-error">{t.errors.generic}</p>}
      {!error && reports.length === 0 && <p className="notice">{t.admin.reportsEmpty}</p>}
      <ul className="flex flex-col gap-3">
        {reports.map((report) => (
          <li key={report.id} className="card flex flex-col gap-2">
            <p className="font-extrabold break-words">{nameOf(report.facility_id)}</p>
            <p>
              <span className="font-bold">{topics[report.topic] ?? report.topic}:</span> <span className="break-words">{report.details}</span>
            </p>
            <p className="text-[0.9rem] text-muted">{when.format(new Date(report.created_at))}</p>
            <Link href={`/map/${report.facility_id}`} className="btn btn-secondary">
              {t.admin.openFacility}
            </Link>
            <form action={reviewReportAction} className="flex flex-col gap-2 min-[420px]:flex-row">
              <input type="hidden" name="id" value={report.id} />
              <button type="submit" name="decision" value="accepted" className="btn btn-primary">
                {t.admin.accept}
              </button>
              <button type="submit" name="decision" value="rejected" className="btn btn-danger">
                {t.admin.reject}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
