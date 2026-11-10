import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Globe, PhoneCall, TriangleAlert } from "lucide-react";
import { CategoryPicture } from "@/components/category-picture";
import { FacilityContacts } from "@/components/facility-contacts";
import { FacilityMapLazy } from "@/components/facility-map-lazy";
import { FacilityReportForm } from "@/components/facility-report-form";
import { FacilityWalk } from "@/components/facility-walk";
import { hasSessionCookie } from "@/lib/account/session";
import { toggleSavedFacilityAction } from "@/lib/facilities/actions";
import { formatOpeningHours } from "@/lib/facilities/hours";
import { primaryPhone } from "@/lib/facilities/phones";
import { getFacilities } from "@/lib/facilities/queries";
import { accessibilityFeatures, facilityName } from "@/lib/facilities/types";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { createClient, getUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-bold">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getMessages();
  const locale = await getLocale();
  const result = await getFacilities(id);

  if (result.status !== "ok") {
    return <p className="notice notice-error">{result.status === "error" ? t.map.loadFailed : t.map.notConfigured}</p>;
  }
  const facility = result.facilities[0];
  if (!facility) notFound();

  const f = t.facility;
  const name = facilityName(facility, locale);
  const accessibility = facility.accessibility;
  const dateFormat = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "long", timeZone: "Asia/Tashkent" });
  const hours = facility.opening_hours ? formatOpeningHours(facility.opening_hours, t.hours) : null;
  const specialities = facility.specialities.map((value) => t.specialities[value]).filter(Boolean);
  const phone = primaryPhone(facility);

  // Saving needs an account; the check is skipped entirely for visitors.
  let saved: boolean | null = null;
  let isAdmin = false;
  if (await hasSessionCookie()) {
    const supabase = await createClient();
    const user = await getUser();
    if (supabase && user) {
      const { data, error } = await supabase.from("user_saved_facilities").select("facility_id").eq("user_id", user.id).eq("facility_id", id).maybeSingle();
      saved = error ? null : Boolean(data);
      const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      isAdmin = me?.role === "admin";
    }
  }
  const signedIn = saved !== null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/map" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {f.back}
      </Link>

      <div className="flex items-start gap-3">
        <CategoryPicture facility={facility} size={88} alt={f.photoAlt(name)} />
        <div className="min-w-0">
          <h1 className="break-words">{name}</h1>
          <p>{t.map.categories[facility.category]}</p>
        </div>
      </div>
      {facility.photo_url && facility.photo_author && facility.photo_license ? (
        <p className="text-[0.85rem] text-muted">
          {facility.photo_page_url ? (
            <a className="underline" href={facility.photo_page_url} target="_blank" rel="noopener noreferrer">
              {f.photoCredit(facility.photo_author, facility.photo_license)}
            </a>
          ) : (
            f.photoCredit(facility.photo_author, facility.photo_license)
          )}
        </p>
      ) : (
        <p className="text-[0.9rem] text-muted">{f.noPhoto}</p>
      )}

      {facility.is_demo && (
        <p className="notice notice-warn font-bold">
          <TriangleAlert aria-hidden size={24} className="shrink-0" />
          <span>{f.demoNotice}</span>
        </p>
      )}

      {phone && (
        <a href={`tel:${phone.e164}`} className="btn btn-primary">
          <PhoneCall aria-hidden size={24} /> {f.call(phone.display)}
        </a>
      )}

      <dl className="card flex flex-col gap-3">
        <Row label={f.address}>{[facility.address, facility.district].filter(Boolean).join(", ") || f.unavailable}</Row>
        <Row label={f.hours}>
          {!hours ? (
            f.unavailable
          ) : hours.exact ? (
            hours.lines.map((line) => <span key={line} className="block">{line}</span>)
          ) : (
            <>
              {hours.raw} <span className="text-[0.85rem] text-muted">({f.hoursRaw})</span>
            </>
          )}
        </Row>
        <Row label={f.website}>
          {facility.website ? (
            <a className="inline-flex min-h-[48px] items-center gap-1 underline" href={facility.website} target="_blank" rel="noopener noreferrer">
              <Globe aria-hidden size={18} /> {new URL(facility.website).hostname}
            </a>
          ) : (
            f.unavailable
          )}
        </Row>
        {specialities.length > 0 && <Row label={f.specialities}>{specialities.join(", ")}</Row>}
        <Row label={f.descriptionTitle}>{f.unavailable}</Row>
      </dl>

      <FacilityContacts t={t} facility={facility} />

      <section aria-labelledby="access-title" className="card flex flex-col gap-3">
        <h2 id="access-title">{f.accessibilityTitle}</h2>
        <dl className="flex flex-col gap-2">
          {accessibilityFeatures.map((feature) => {
            const value = accessibility?.[feature] ?? null;
            return (
              <div key={feature} className="flex flex-wrap justify-between gap-x-3">
                <dt>{t.accessibilityFeatures[feature]}</dt>
                <dd className="font-bold">{value === null ? f.unknown : value ? `✓ ${f.yes}` : `✕ ${f.no}`}</dd>
              </div>
            );
          })}
        </dl>
        <p>
          <span className="font-bold">{f.accessibilityStatus}:</span> {f.verification[accessibility?.accessibility_verified ?? "unverified"]}
        </p>
        {accessibility?.accessibility_notes && (
          <p>
            <span className="font-bold">{f.notes}:</span> {accessibility.accessibility_notes}
          </p>
        )}
      </section>

      <FacilityWalk
        id={facility.id}
        name={name}
        category={facility.category}
        destination={{ latitude: facility.latitude, longitude: facility.longitude }}
      />

      <section aria-label={f.mapPreview}>
        <FacilityMapLazy
          origin={null}
          points={[{ id: facility.id, name, category: facility.category, latitude: facility.latitude, longitude: facility.longitude }]}
        />
      </section>

      {signedIn && (
        <form action={toggleSavedFacilityAction}>
          <input type="hidden" name="facilityId" value={facility.id} />
          <input type="hidden" name="saved" value={saved ? "true" : "false"} />
          <button type="submit" className="btn btn-secondary">
            {saved ? f.unsave : f.save}
          </button>
          {saved && <p className="mt-1 font-bold">{f.saved}</p>}
        </form>
      )}

      <dl className="card flex flex-col gap-3 text-[0.9rem]">
        <Row label={f.infoStatus}>{f.verification[facility.verification_status]}</Row>
        <Row label={f.source}>
          {facility.source_url ? (
            <a className="inline-flex items-center gap-1 underline" href={facility.source_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden size={16} /> {facility.data_source}
            </a>
          ) : (
            facility.data_source
          )}
        </Row>
        {facility.provider_id && <Row label={f.providerId}>{facility.provider_id}</Row>}
        <Row label={f.sourceUpdated}>{facility.source_updated_at ? dateFormat.format(new Date(facility.source_updated_at)) : f.unavailable}</Row>
        <Row label={f.lastVerified}>{facility.last_verified_at ? dateFormat.format(new Date(facility.last_verified_at)) : f.never}</Row>
      </dl>

      {isAdmin && (
        <Link href={`/admin/facilities/${facility.id}`} className="btn btn-secondary">
          {f.editContacts}
        </Link>
      )}

      <details className="card">
        <summary className="flex min-h-[48px] cursor-pointer items-center font-bold">{f.reportTitle}</summary>
        <div className="mt-2">
          {signedIn ? (
            <FacilityReportForm facilityId={facility.id} />
          ) : (
            <>
              <p className="mb-2">{f.reportLogin}</p>
              <Link href={`/login?next=/map/${facility.id}`} className="btn btn-secondary">
                {t.auth.loginTitle}
              </Link>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
