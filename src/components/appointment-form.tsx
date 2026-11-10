"use client";

import { useEffect, useRef } from "react";
import { idleState } from "@/lib/account/validation";
import { addAppointmentAction } from "@/lib/care/actions";
import { useI18n } from "@/lib/i18n/provider";
import { Field, FormMessage, SubmitButton, useKeptAction } from "./form-parts";

export function AppointmentForm({ patientId }: { patientId?: string }) {
  const { t } = useI18n();
  const a = t.appointments;
  const { state, action, onSubmit, pending } = useKeptAction(addAppointmentAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="card flex flex-col gap-3" noValidate>
      <h2>{a.addTitle}</h2>
      {patientId && <input type="hidden" name="patientId" value={patientId} />}
      <Field state={state} name="title" label={a.what} autoComplete="off" required />
      <Field state={state} name="startsAt" label={a.when} type="datetime-local" required />
      <Field state={state} name="doctor" label={`${a.doctor} (${t.common.optional})`} autoComplete="off" />
      <Field state={state} name="notes" label={`${a.notes} (${t.common.optional})`} autoComplete="off" />
      <FormMessage state={state} success={t.common.saved} />
      <SubmitButton pending={pending}>{a.add}</SubmitButton>
    </form>
  );
}
