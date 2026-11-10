import Link from "next/link";
import { HeartHandshake, MapPin, Phone, Trash2 } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { ContactForm } from "@/components/contact-form";
import { ReviewRequestForm } from "@/components/care-request-forms";
import { InviteForm, PermissionsForm } from "@/components/caregiver-forms";
import { requireSession } from "@/lib/account/guard";
import { removeContactAction } from "@/lib/care/actions";
import { revokeInvitationAction, revokeLinkAction } from "@/lib/caregiver/actions";
import type { Permissions } from "@/lib/caregiver/permissions";
import { getLocale, getMessages } from "@/lib/i18n/server";

type LinkRow = Permissions & { id: string; caregiver_id: string };

function appUrl() {
  return (process.env["NEXT_PUBLIC_APP_URL"] || "http://localhost:3000").replace(/\/$/, "");
}

export default async function CirclePage() {
  const t = await getMessages();
  const locale = await getLocale();
  const c = t.circle;
  const session = await requireSession("/circle");
  if (!session) return <AccountsNotConfigured t={t} title={c.title} />;
  const { supabase, user } = session;

  const [contacts, links, invitations] = await Promise.all([
    supabase.from("emergency_contacts").select("id, name, phone, relationship").eq("patient_id", user.id).order("priority").order("created_at"),
    supabase
      .from("caregiver_links")
      .select("id, caregiver_id, can_view_profile, can_view_health, can_view_contacts, can_view_medications, can_view_appointments, can_receive_sos, can_manage_reminders")
      .eq("patient_id", user.id)
      .eq("status", "active"),
    supabase.from("caregiver_invitations").select("id, expires_at").eq("patient_id", user.id).eq("status", "pending").gte("expires_at", new Date().toISOString()),
  ]);

  const helperRows = (links.data ?? []) as LinkRow[];
  const { data: helperProfiles } = helperRows.length
    ? await supabase.from("profiles").select("id, first_name, last_name, phone").in("id", helperRows.map((row) => row.caregiver_id))
    : { data: [] };
  const helperById = new Map((helperProfiles ?? []).map((row) => [row.id, row]));
  const dateFormat = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "long", timeZone: "Asia/Tashkent" });

  return (
    <div className="flex flex-col gap-6">
      <h1>{c.title}</h1>

      <Link href="/location" className="btn btn-primary">
        <MapPin aria-hidden size={24} /> {t.location.openLink}
      </Link>
      <Link href="/caregiver" className="btn btn-secondary">
        <HeartHandshake aria-hidden size={24} /> {c.careForLink}
      </Link>

      <section aria-labelledby="helpers-title" className="flex flex-col gap-3">
        <h2 id="helpers-title">{c.helpersTitle}</h2>
        <p className="secondary-text text-[0.9rem] text-muted">{c.helpersHelp}</p>
        {links.error && <p className="notice notice-error">{t.errors.generic}</p>}
        {!links.error && helperRows.length === 0 && <p className="notice">{c.helpersEmpty}</p>}
        <ul className="flex flex-col gap-3">
          {helperRows.map((row) => {
            const helper = helperById.get(row.caregiver_id);
            const name = helper ? `${helper.first_name} ${helper.last_name}`.trim() : t.routine.helperFallback;
            return (
              <li key={row.id} className="card flex flex-col gap-3">
                <p className="font-extrabold break-words">{name}</p>
                {helper?.phone && (
                  <a href={`tel:${helper.phone}`} className="btn btn-primary">
                    <Phone aria-hidden size={22} /> {c.call(name)}
                  </a>
                )}
                <PermissionsForm linkId={row.id} name={name} current={row} />
                <form action={revokeLinkAction}>
                  <input type="hidden" name="linkId" value={row.id} />
                  <button type="submit" className="btn btn-danger">
                    {c.revokeAccess(name)}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="invites-title" className="flex flex-col gap-3">
        <h2 id="invites-title">{c.invitesTitle}</h2>
        <InviteForm appUrl={appUrl()} />
        <p className="text-[0.9rem] text-muted">{c.emailInvite}</p>
        {(invitations.data?.length ?? 0) > 0 && (
          <>
            <h3 className="font-extrabold">{c.pendingTitle}</h3>
            <ul className="flex flex-col gap-2">
              {invitations.data?.map((invitation) => (
                <li key={invitation.id} className="card flex flex-col gap-2">
                  <p>{c.pendingUntil(dateFormat.format(new Date(invitation.expires_at)))}</p>
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="id" value={invitation.id} />
                    <button type="submit" className="btn btn-secondary">
                      {c.revokeInvite}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="request-title" className="card flex flex-col gap-3">
        <h2 id="request-title">{c.requestTitle}</h2>
        <p className="secondary-text text-[0.9rem] text-muted">{c.requestHelp}</p>
        <ReviewRequestForm />
      </section>

      <section aria-labelledby="contacts-title" className="flex flex-col gap-3">
        <h2 id="contacts-title">{c.contactsTitle}</h2>
        <p className="secondary-text text-[0.9rem] text-muted">{c.contactsHelp}</p>
        {contacts.error && <p className="notice notice-error">{t.sos.contactsFailed}</p>}
        {!contacts.error && contacts.data?.length === 0 && <p className="notice">{c.empty}</p>}
        <ul className="flex flex-col gap-2">
          {contacts.data?.map((contact) => (
            <li key={contact.id} className="card flex flex-col gap-2">
              <p className="font-extrabold break-words">
                {contact.name}
                {contact.relationship && <span className="font-normal"> — {contact.relationship}</span>}
              </p>
              <p>{contact.phone}</p>
              <a href={`tel:${contact.phone}`} className="btn btn-primary">
                <Phone aria-hidden size={22} /> {c.call(contact.name)}
              </a>
              <form action={removeContactAction}>
                <input type="hidden" name="id" value={contact.id} />
                <button type="submit" className="btn btn-secondary">
                  <Trash2 aria-hidden size={22} /> {c.remove(contact.name)}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <div className="card">
          <ContactForm />
        </div>
      </section>
    </div>
  );
}
