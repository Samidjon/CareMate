import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { LocationSharingPanel, type HelperShare } from "@/components/location-sharing-panel";
import { requireSession } from "@/lib/account/guard";
import { getLocale, getMessages } from "@/lib/i18n/server";

/** The patient's own controls for sharing their location with chosen helpers. */
export default async function LocationPage() {
  const t = await getMessages();
  const locale = await getLocale();
  const session = await requireSession("/location");
  if (!session) return <AccountsNotConfigured t={t} title={t.location.title} />;
  const { supabase, user } = session;

  const [links, shares, last] = await Promise.all([
    supabase.from("caregiver_links").select("caregiver_id").eq("patient_id", user.id).eq("status", "active"),
    supabase.from("location_shares").select("caregiver_id, status").eq("patient_id", user.id),
    supabase.from("patient_last_locations").select("recorded_at, accuracy_meters").eq("patient_id", user.id).maybeSingle(),
  ]);
  const ids = (links.data ?? []).map((row) => row.caregiver_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, first_name, last_name").in("id", ids) : { data: [] };
  const helpers: HelperShare[] = ids.map((id) => {
    const profile = profiles?.find((row) => row.id === id);
    const share = shares.data?.find((row) => row.caregiver_id === id);
    return {
      id,
      name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : t.routine.helperFallback,
      status: (share?.status as HelperShare["status"]) ?? null,
    };
  });

  const when = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tashkent" });
  const lastUpdate = last.data
    ? t.location.lastUpdateValue(
        when.format(new Date(last.data.recorded_at)),
        last.data.accuracy_meters === null ? t.location.accuracyUnknown : t.location.approx(Math.round(last.data.accuracy_meters)),
      )
    : null;

  return (
    <div className="flex flex-col gap-4">
      <h1>{t.location.title}</h1>
      {links.error || shares.error ? (
        <p className="notice notice-error">{t.errors.generic}</p>
      ) : (
        <LocationSharingPanel helpers={helpers} lastUpdate={lastUpdate} />
      )}
    </div>
  );
}
