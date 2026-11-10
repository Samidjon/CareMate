"use client";

import { idleState } from "@/lib/account/validation";
import { permissionFields } from "@/lib/caregiver/permissions";
import { createRequestAction, reviewRequestAction, type RequestCodeState, type ReviewState } from "@/lib/caregiver/request-actions";
import { useI18n } from "@/lib/i18n/provider";
import { Field, FormMessage, SubmitButton, useKeptAction } from "./form-parts";

/** For helpers: a code to give to the person they want to help. */
export function RequestCodeForm() {
  const { t } = useI18n();
  const g = t.caregiver;
  const { state, action, onSubmit, pending } = useKeptAction<RequestCodeState>(createRequestAction, idleState);
  return (
    <section aria-labelledby="request-title" className="card flex flex-col gap-3">
      <h2 id="request-title">{g.requestTitle}</h2>
      <p className="secondary-text text-[0.9rem] text-muted">{g.requestHelp}</p>
      {state.code && (
        <div role="status" className="notice notice-info flex-col">
          <p className="font-bold">{g.requestCode}</p>
          <p className="text-[1.6rem] font-extrabold tracking-widest break-all" data-testid="request-code">
            {state.code}
          </p>
          <p>{g.requestCodeHelp}</p>
        </div>
      )}
      <form action={action} onSubmit={onSubmit}>
        <FormMessage state={state} />
        <SubmitButton pending={pending} className="btn btn-secondary">{g.requestButton}</SubmitButton>
      </form>
    </section>
  );
}

/** For patients: see who is asking, choose what to share, then approve or reject. */
export function ReviewRequestForm() {
  const { t } = useI18n();
  const c = t.circle;
  const { state, action, onSubmit, pending } = useKeptAction<ReviewState>(reviewRequestAction, idleState);

  if (state.decided) {
    return (
      <p role="status" className="notice notice-info">
        {state.decided === "approved" ? c.requestApproved : c.requestRejected}
      </p>
    );
  }
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      {!state.requester ? (
        <>
          <Field state={state} name="code" label={c.requestCode} autoComplete="off" autoCapitalize="characters" required />
          <FormMessage state={state} />
          <SubmitButton pending={pending} className="btn btn-secondary">{c.requestCheck}</SubmitButton>
        </>
      ) : (
        <>
          <input type="hidden" name="code" value={state.code} />
          <p className="text-[1.1rem] font-extrabold break-words">{c.requestFrom(state.requester)}</p>
          <fieldset>
            <legend className="mb-1 font-bold">{c.inviteLegend}</legend>
            {permissionFields.map((field) => (
              <label key={field.key} className="flex min-h-[48px] cursor-pointer items-center gap-3 py-1">
                <input type="checkbox" name={field.key} defaultChecked={field.defaultOn} className="size-6 shrink-0 accent-brand" />
                <span>{c.permissions[field.key]}</span>
              </label>
            ))}
          </fieldset>
          <FormMessage state={state} />
          <button type="submit" name="decision" value="approve" className="btn btn-primary">
            {c.requestApprove}
          </button>
          <button type="submit" name="decision" value="reject" className="btn btn-danger">
            {c.requestReject}
          </button>
        </>
      )}
    </form>
  );
}
