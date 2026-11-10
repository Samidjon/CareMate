"use client";

import { deleteAccountAction, updateProfileAction } from "@/lib/account/actions";
import { idleState } from "@/lib/account/validation";
import { localeLabels, locales } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";
import { AddressAutofill } from "./address-autofill";
import { Field, FormMessage, SubmitButton, useKeptAction } from "./form-parts";

export type ProfileData = {
  first_name: string;
  last_name: string;
  birth_date: string | null;
  phone: string | null;
  locale: string;
  city: string;
  district: string | null;
  address?: string | null;
};

export type HealthData = {
  blood_type: string | null;
  allergies: string | null;
  conditions: string | null;
} | null;

export function ProfileForm({ profile, health }: { profile: ProfileData; health: HealthData }) {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(updateProfileAction, idleState);
  const p = t.profile;
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <Field state={state} name="firstName" label={t.auth.firstName} defaultValue={profile.first_name} autoComplete="given-name" required />
      <Field state={state} name="lastName" label={t.auth.lastName} defaultValue={profile.last_name} autoComplete="family-name" required />
      <Field state={state} name="phone" label={`${p.phone} (${t.common.optional})`} hint={p.phoneHint} type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" />
      <Field state={state} name="birthDate" label={`${p.birthDate} (${t.common.optional})`} type="date" defaultValue={profile.birth_date ?? ""} />
      <Field state={state} name="city" label={p.city} defaultValue={profile.city} required />
      <Field state={state} name="district" label={`${p.district} (${t.common.optional})`} defaultValue={profile.district ?? ""} />
      <Field state={state} name="address" label={`${p.address} (${t.common.optional})`} hint={p.addressHint} defaultValue={profile.address ?? ""} autoComplete="street-address" />
      <AddressAutofill />
      <div className="field">
        <label htmlFor="locale">{p.language}</label>
        <select id="locale" name="locale" defaultValue={profile.locale}>
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {localeLabels[locale]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="card flex flex-col gap-3">
        <legend className="px-1 font-extrabold">{p.healthTitle}</legend>
        <p className="text-[0.9rem] text-muted">{p.healthHelp}</p>
        <Field state={state} name="bloodType" label={p.bloodType} defaultValue={health?.blood_type ?? ""} autoComplete="off" />
        <Field state={state} name="allergies" label={p.allergies} defaultValue={health?.allergies ?? ""} autoComplete="off" />
        <Field state={state} name="conditions" label={p.conditions} defaultValue={health?.conditions ?? ""} autoComplete="off" />
      </fieldset>

      <FormMessage state={state} success={t.common.saved} />
      <SubmitButton pending={pending}>{t.common.save}</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(deleteAccountAction, idleState);
  const p = t.profile;
  return (
    <section aria-labelledby="delete-title" className="card flex flex-col gap-3">
      <h2 id="delete-title">{p.dangerTitle}</h2>
      <p>{p.dangerHelp}</p>
      <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <FormMessage state={state} />
        <Field state={state} name="confirm" label={p.deleteConfirmLabel(p.deleteWord)} autoComplete="off" required />
        <SubmitButton pending={pending} className="btn btn-danger">{p.deleteButton}</SubmitButton>
      </form>
    </section>
  );
}
