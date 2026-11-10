"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import type { FormState } from "@/lib/account/validation";
import { useI18n } from "@/lib/i18n/provider";

type FieldProps = ComponentProps<"input"> & {
  name: string;
  label: string;
  hint?: string;
  state: FormState;
};

export function Field({ name, label, hint, state, ...input }: FieldProps) {
  const { t } = useI18n();
  const errorKey = state.fieldErrors?.[name];
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = errorKey ? `${name}-error` : undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      <input
        id={name}
        name={name}
        aria-invalid={errorKey ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...input}
      />
      {errorKey && (
        <p id={errorId} className="field-error">
          {t.errors[errorKey]}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ state, success }: { state: FormState; success?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite">
      {state.status === "error" && state.error && <p className="notice notice-error">{t.errors[state.error]}</p>}
      {state.status === "success" && success && <p className="notice notice-info">{success}</p>}
    </div>
  );
}

export function SubmitButton({
  children,
  className = "btn btn-primary",
  pending: pendingProp = false,
}: {
  children: ReactNode;
  className?: string;
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = status.pending || pendingProp;
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {children}
    </button>
  );
}

/**
 * Like useActionState, but the form keeps what the person typed. React resets a
 * form after its action runs, which on a validation error would wipe every field
 * and make someone start again. With JavaScript, submission goes through
 * onSubmit instead (no reset); without it, the plain form action still works.
 */
export function useKeptAction<State>(fn: (previous: State, formData: FormData) => Promise<State>, initial: State) {
  // States are plain objects, never promises, so Awaited<State> is State itself.
  const [state, action, pending] = useActionState<State, FormData>(
    fn as (previous: Awaited<State>, formData: FormData) => Promise<State>,
    initial as Awaited<State>,
  );
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Keeps the pressed button's name and value, e.g. "approve" or "reject".
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => action(formData));
  };
  return { state, action, onSubmit, pending };
}
