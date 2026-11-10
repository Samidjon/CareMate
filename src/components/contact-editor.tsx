"use client";

import { idleState } from "@/lib/account/validation";
import { saveContactsAction, type ContactFormState } from "@/lib/facilities/contact-admin";
import { contactVerifications } from "@/lib/facilities/phones";
import { useI18n } from "@/lib/i18n/provider";
import { FormMessage, SubmitButton, useKeptAction } from "./form-parts";

export function ContactEditor({
  facilityId,
  numbers,
  website,
  source,
  status,
}: {
  facilityId: string;
  numbers: string;
  website: string;
  source: string;
  status: string;
}) {
  const { t } = useI18n();
  const a = t.admin;
  const { state, action, onSubmit, pending } = useKeptAction<ContactFormState>(saveContactsAction, idleState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="facilityId" value={facilityId} />
      <div className="field">
        <label htmlFor="numbers">{a.contactsNumbers}</label>
        <p id="numbers-hint" className="field-hint">
          {a.contactsHelp}
        </p>
        <textarea id="numbers" name="numbers" defaultValue={numbers} aria-describedby="numbers-hint" aria-invalid={errors.numbers ? true : undefined} />
        {errors.numbers && <p className="field-error">{a.contactsInvalid(state.message ?? "")}</p>}
      </div>
      <div className="field">
        <label htmlFor="website">{a.contactsWebsite}</label>
        <input id="website" name="website" type="url" defaultValue={website} aria-invalid={errors.website ? true : undefined} />
        {errors.website && <p className="field-error">{a.contactsBadWebsite}</p>}
      </div>
      <div className="field">
        <label htmlFor="source">{a.contactsSource}</label>
        <p id="source-hint" className="field-hint">
          {a.contactsSourceHint}
        </p>
        <input id="source" name="source" defaultValue={source} aria-describedby="source-hint" aria-invalid={errors.source ? true : undefined} />
        {errors.source && <p className="field-error">{a.contactsOfficialNeedsSource}</p>}
      </div>
      <div className="field">
        <label htmlFor="status">{a.contactsStatus}</label>
        <select id="status" name="status" defaultValue={status}>
          {contactVerifications.map((value) => (
            <option key={value} value={value}>
              {t.facility.contactVerification[value]}
            </option>
          ))}
        </select>
      </div>
      <FormMessage state={state} success={a.contactsSaved} />
      <SubmitButton pending={pending}>{a.contactsSave}</SubmitButton>
    </form>
  );
}
