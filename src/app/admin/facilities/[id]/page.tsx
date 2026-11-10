import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { ContactEditor } from "@/components/contact-editor";
import { requireSession } from "@/lib/account/guard";
import { phonesOf } from "@/lib/facilities/phones";
import { getFacilities } from "@/lib/facilities/queries";
import { facilityName } from "@/lib/facilities/types";
import { getLocale, getMessages } from "@/lib/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** For administrators: a facility's phone numbers, website and verification. */
export default async function FacilityContactsAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getMessages();
  const locale = await getLocale();
  const session = await requireSession(`/admin/facilities/${id}`);
  if (!session) return <AccountsNotConfigured t={t} title={t.admin.contactsTitle} />;
  const { data: me } = await session.supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
  if (me?.role !== "admin") notFound();

  const result = await getFacilities(id);
  const facility = result.status === "ok" ? result.facilities[0] : null;
  if (!facility) notFound();
  const numbers = phonesOf(facility)
    .map((phone) => `${phone.type}: ${phone.display}`)
    .join("\n");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="break-words">{t.admin.contactsTitle}</h1>
      <p className="text-[1.1rem] font-bold break-words">{facilityName(facility, locale)}</p>
      <ContactEditor
        facilityId={facility.id}
        numbers={numbers}
        website={facility.website ?? ""}
        source={facility.contact_source ?? ""}
        status={facility.contact_verification_status ?? "unverified"}
      />
      <Link href={`/map/${facility.id}`} className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
