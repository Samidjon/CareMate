import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { AppointmentForm } from "@/components/appointment-form";
import { requireSession } from "@/lib/account/guard";
import { cancelAppointmentAction } from "@/lib/care/actions";
import { getLocale, getMessages } from "@/lib/i18n/server";

export default async function AppointmentsPage() {
  const t = await getMessages();
  const locale = await getLocale();
  const a = t.appointments;
  const session = await requireSession("/appointments");
  if (!session) return <AccountsNotConfigured t={t} title={a.title} />;

  const { data, error } = await session.supabase
    .from("appointments")
    .select("id, title, doctor_name, notes, starts_at, status")
    .eq("patient_id", session.user.id)
    .order("starts_at");
  const now = new Date().toISOString();
  const upcoming = (data ?? []).filter((item) => item.status === "scheduled" && item.starts_at >= now);
  const past = (data ?? []).filter((item) => !upcoming.includes(item));
  const when = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  });

  return (
    <div className="flex flex-col gap-4">
      <h1>{a.title}</h1>
      {error && <p className="notice notice-error">{t.errors.generic}</p>}
      {!error && upcoming.length === 0 && <p className="notice">{a.empty}</p>}
      <ul className="flex flex-col gap-2">
        {upcoming.map((item) => (
          <li key={item.id} className="card flex flex-col gap-1">
            <span className="font-extrabold break-words">{item.title}</span>
            <span>{when.format(new Date(item.starts_at))}</span>
            {item.doctor_name && <span className="break-words">{item.doctor_name}</span>}
            {item.notes && <span className="break-words">{item.notes}</span>}
            <form action={cancelAppointmentAction} className="mt-2">
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="btn btn-secondary">
                {a.cancel}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <AppointmentForm />

      {past.length > 0 && (
        <details className="card">
          <summary className="flex min-h-[48px] cursor-pointer items-center font-bold">{a.past}</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {past.map((item) => (
              <li key={item.id} className="flex flex-col">
                <span className="font-bold break-words">{item.title}</span>
                <span>{when.format(new Date(item.starts_at))}</span>
                {item.status === "cancelled" && <span>{a.cancelled}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Link href="/routine" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
