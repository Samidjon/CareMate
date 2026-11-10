"use client";

import { useEffect, useRef } from "react";
import { idleState } from "@/lib/account/validation";
import { addContactAction } from "@/lib/care/actions";
import { useI18n } from "@/lib/i18n/provider";
import { Field, FormMessage, SubmitButton, useKeptAction } from "./form-parts";

export function ContactForm() {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(addContactAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <h3 className="font-extrabold">{t.circle.addTitle}</h3>
      <Field state={state} name="name" label={t.circle.name} autoComplete="off" required />
      <Field state={state} name="phone" label={t.circle.phone} hint={t.profile.phoneHint} type="tel" autoComplete="off" required />
      <Field state={state} name="relationship" label={`${t.circle.relationship} (${t.common.optional})`} hint={t.circle.relationshipHint} autoComplete="off" />
      <FormMessage state={state} success={t.common.saved} />
      <SubmitButton pending={pending}>{t.circle.add}</SubmitButton>
    </form>
  );
}
