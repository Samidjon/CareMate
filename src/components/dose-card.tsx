"use client";

import Link from "next/link";
import { Check, Clock, HelpCircle, SkipForward } from "lucide-react";
import { idleState } from "@/lib/account/validation";
import { recordDoseAction } from "@/lib/care/actions";
import { useI18n } from "@/lib/i18n/provider";
import { tashkentTime, type Dose } from "@/lib/routine/schedule";
import { FormMessage, useKeptAction } from "./form-parts";
import { VoiceHint } from "./voice-hint";

/** `patientId` means a helper is viewing; `readOnly` means they may look but not answer. */
export function DoseCard({ dose, patientId, readOnly = false }: { dose: Dose; patientId?: string; readOnly?: boolean }) {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(recordDoseAction, idleState);
  const r = t.routine;

  const stateText = {
    upcoming: r.state.upcoming,
    due: r.state.due,
    missed: r.state.missed,
    snoozed: r.state.snoozed(dose.snoozedUntil ? tashkentTime(dose.snoozedUntil) : ""),
    taken: `✓ ${r.state.taken}`,
    skipped: r.state.skipped,
  }[dose.state];
  const open = dose.state === "due" || dose.state === "missed" || dose.state === "snoozed" || dose.state === "upcoming";
  const urgent = dose.state === "due" || dose.state === "missed";

  const button = (status: string, label: string, Icon: typeof Check, className: string) => (
    <button type="submit" name="status" value={status} className={className} disabled={pending}>
      <Icon aria-hidden size={22} /> {label}
    </button>
  );

  return (
    <li className={`card flex flex-col gap-2 ${urgent ? "border-brand" : ""}`} data-voice-sensitive>
      <p className="text-[1.1rem] font-extrabold">{r.at(dose.time)}</p>
      <p className="font-extrabold break-words">{dose.name}</p>
      {dose.instructions && <p className="break-words">{dose.instructions}</p>}
      <p className="font-bold">{stateText}</p>

      {dose.needsHelp && patientId && <p className="notice notice-warn font-bold">{r.needHelpFlag}</p>}

      {open && !readOnly && (
        <form action={action} onSubmit={onSubmit} className="flex flex-col gap-2">
          {patientId && <input type="hidden" name="patientId" value={patientId} />}
          <input type="hidden" name="scheduleId" value={dose.scheduleId} />
          <input type="hidden" name="medicationId" value={dose.medicationId} />
          <input type="hidden" name="scheduledFor" value={dose.scheduledFor} />
          {button("taken", r.taken, Check, "btn btn-primary")}
          {dose.state !== "upcoming" && (
            <>
              {button("snoozed", r.later, Clock, "btn btn-secondary")}
              {button("skipped", r.skip, SkipForward, "btn btn-secondary")}
              {button("need_help", r.needHelp, HelpCircle, "btn btn-secondary")}
            </>
          )}
        </form>
      )}
      <FormMessage state={state} />
      {dose.needsHelp && open && !patientId && (
        <div className="notice notice-warn flex-col">
          <p>{r.needHelpNotice}</p>
          <Link href="/sos" className="btn btn-sos">
            {r.needHelpLink}
          </Link>
        </div>
      )}
      {urgent && <VoiceHint text={`${r.at(dose.time)}. ${dose.name}. ${dose.instructions ?? ""}`} sensitive />}
    </li>
  );
}
