"use client";

import Link from "next/link";
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
} from "@/lib/account/actions";
import { idleState } from "@/lib/account/validation";
import { useI18n } from "@/lib/i18n/provider";
import { Field, FormMessage, SubmitButton, useKeptAction } from "./form-parts";

export function LoginForm({ next }: { next: string }) {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(loginAction, idleState);
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Field state={state} name="email" label={t.auth.email} type="email" autoComplete="email" required />
      <Field state={state} name="password" label={t.auth.password} type="password" autoComplete="current-password" required />
      <SubmitButton pending={pending}>{t.auth.loginButton}</SubmitButton>
      <Link href="/forgot-password" className="btn btn-secondary">
        {t.auth.forgotLink}
      </Link>
      <Link href={next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`} className="btn btn-secondary">
        {t.auth.toRegister}
      </Link>
    </form>
  );
}

export function RegisterForm({ next, defaultRole = "patient" }: { next?: string; defaultRole?: "patient" | "caregiver" }) {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(registerAction, idleState);
  if (state.status === "success") return <FormMessage state={state} success={t.auth.checkEmail} />;

  const roleError = state.fieldErrors?.role;
  const consentError = state.fieldErrors?.consent;
  const roles = [
    { value: "patient", title: t.auth.typePatient, help: t.auth.typePatientHelp },
    { value: "caregiver", title: t.auth.typeCaregiver, help: t.auth.typeCaregiverHelp },
  ];
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <fieldset className="field">
        <legend className="text-[1.2rem]">{t.auth.accountType}</legend>
        <div className="mt-1 flex flex-col gap-2">
          {roles.map((role) => (
            <label key={role.value} className="card flex min-h-[88px] cursor-pointer items-center gap-3 has-[:checked]:border-brand has-[:checked]:bg-brand-pale">
              <input type="radio" name="role" value={role.value} defaultChecked={role.value === defaultRole} className="size-5 shrink-0 accent-brand" />
              <span className="flex flex-col">
                <span className="font-bold">{role.title}</span>
                <span className="secondary-text text-[0.9rem] text-muted">{role.help}</span>
              </span>
            </label>
          ))}
        </div>
        {roleError && <p className="field-error">{t.errors[roleError]}</p>}
      </fieldset>
      <Field state={state} name="firstName" label={t.auth.firstName} autoComplete="given-name" required />
      <Field state={state} name="lastName" label={t.auth.lastName} autoComplete="family-name" required />
      <Field state={state} name="email" label={t.auth.email} type="email" autoComplete="email" required />
      <Field state={state} name="password" label={t.auth.password} type="password" autoComplete="new-password" hint={t.auth.passwordHint} required />
      <label className="flex min-h-[48px] cursor-pointer items-start gap-3 py-2">
        <input
          type="checkbox"
          name="consent"
          className="mt-1 size-6 shrink-0 accent-brand"
          aria-invalid={consentError ? true : undefined}
          aria-describedby={consentError ? "consent-error" : undefined}
        />
        <span>{t.auth.consent}</span>
      </label>
      {consentError && (
        <p id="consent-error" className="field-error">
          {t.errors[consentError]}
        </p>
      )}
      <SubmitButton pending={pending}>{t.auth.registerButton}</SubmitButton>
      <Link href="/login" className="btn btn-secondary">
        {t.auth.toLogin}
      </Link>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(forgotPasswordAction, idleState);
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} success={t.auth.forgotSent} />
      <Field state={state} name="email" label={t.auth.email} type="email" autoComplete="email" required />
      <SubmitButton pending={pending}>{t.auth.forgotButton}</SubmitButton>
      <Link href="/login" className="btn btn-secondary">
        {t.common.back}
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(resetPasswordAction, idleState);
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <Field state={state} name="password" label={t.auth.newPassword} type="password" autoComplete="new-password" hint={t.auth.passwordHint} required />
      <SubmitButton pending={pending}>{t.auth.resetButton}</SubmitButton>
    </form>
  );
}
