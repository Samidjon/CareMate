"use client";

import { idleState } from "@/lib/account/validation";
import { reportFacilityAction } from "@/lib/facilities/actions";
import { useI18n } from "@/lib/i18n/provider";
import { FormMessage, SubmitButton, useKeptAction } from "./form-parts";

const TOPICS = ["closed", "address", "phone", "hours", "accessibility", "other"] as const;

export function FacilityReportForm({ facilityId }: { facilityId: string }) {
  const { t } = useI18n();
  const f = t.facility;
  const { state, action, onSubmit, pending } = useKeptAction(reportFacilityAction, idleState);
  if (state.status === "success") {
    return (
      <p role="status" className="notice notice-info">
        {f.reportSent}
      </p>
    );
  }
  const detailsError = state.fieldErrors?.details;
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="facilityId" value={facilityId} />
      <div className="field">
        <label htmlFor="report-topic">{f.reportTopic}</label>
        <select id="report-topic" name="topic" defaultValue="other">
          {TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {f.reportTopics[topic]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="report-details">{f.reportDetails}</label>
        <textarea
          id="report-details"
          name="details"
          maxLength={1000}
          aria-invalid={detailsError ? true : undefined}
          aria-describedby={detailsError ? "report-details-error" : undefined}
        />
        {detailsError && (
          <p id="report-details-error" className="field-error">
            {t.errors[detailsError]}
          </p>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="btn btn-secondary">{f.reportSend}</SubmitButton>
    </form>
  );
}
