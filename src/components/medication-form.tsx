"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { idleState } from "@/lib/account/validation";
import { createMedicationAction, updateMedicationAction } from "@/lib/care/actions";
import { useI18n } from "@/lib/i18n/provider";
import { Field, FormMessage, SubmitButton, useKeptAction } from "./form-parts";

export type MedicationFormValues = {
  id?: string;
  /** Set when a helper is adding this for someone else. */
  patientId?: string;
  name: string;
  instructions: string;
  times: string[];
  days: number[];
  startDate: string;
  endDate: string;
};

const MAX_TIMES = 8;

export function MedicationForm({ initial }: { initial: MedicationFormValues }) {
  const { t } = useI18n();
  const r = t.routine;
  const { state, action, onSubmit, pending } = useKeptAction(initial.id ? updateMedicationAction : createMedicationAction, idleState);
  const [timeCount, setTimeCount] = useState(Math.max(initial.times.length, 1));
  const timesError = state.fieldErrors?.times;
  const daysError = state.fieldErrors?.days;

  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <p className="notice notice-info">{r.doctorNote}</p>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {initial.patientId && <input type="hidden" name="patientId" value={initial.patientId} />}
      <Field state={state} name="name" label={r.name} defaultValue={initial.name} autoComplete="off" required />
      <Field state={state} name="instructions" label={`${r.instructions} (${t.common.optional})`} hint={r.instructionsHint} defaultValue={initial.instructions} autoComplete="off" />

      <fieldset className="field">
        <legend>{r.times}</legend>
        <div className="mt-1 flex flex-col gap-2">
          {Array.from({ length: timeCount }, (_, index) => (
            <div key={index} className="field">
              <label htmlFor={`time-${index}`} className="sr-only">
                {r.time(index + 1)}
              </label>
              <input
                id={`time-${index}`}
                name="times"
                type="time"
                defaultValue={initial.times[index] ?? ""}
                aria-invalid={timesError ? true : undefined}
              />
            </div>
          ))}
        </div>
        {timeCount < MAX_TIMES && (
          <button type="button" className="btn btn-secondary mt-2" onClick={() => setTimeCount(timeCount + 1)}>
            <Plus aria-hidden size={22} /> {r.addTime}
          </button>
        )}
        {timesError && <p className="field-error">{t.errors[timesError]}</p>}
      </fieldset>

      <fieldset className="field">
        <legend>{r.days}</legend>
        <div className="mt-1 flex flex-col">
          {r.weekdays.map((day, index) => (
            <label key={day} className="flex min-h-[48px] cursor-pointer items-center gap-3">
              <input type="checkbox" name="days" value={index + 1} defaultChecked={initial.days.includes(index + 1)} className="size-6 shrink-0 accent-brand" />
              {day}
            </label>
          ))}
        </div>
        {daysError && <p className="field-error">{t.errors[daysError]}</p>}
      </fieldset>

      <Field state={state} name="startDate" label={r.startDate} type="date" defaultValue={initial.startDate} required />
      <Field state={state} name="endDate" label={`${r.endDate} (${t.common.optional})`} type="date" defaultValue={initial.endDate} />

      <FormMessage state={state} />
      <SubmitButton pending={pending}>{t.common.save}</SubmitButton>
    </form>
  );
}
