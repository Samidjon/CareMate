"use client";

import { MessageSquare } from "lucide-react";
import { idleState } from "@/lib/account/validation";
import {
  acceptInvitationAction,
  createInvitationAction,
  previewInvitationAction,
  updatePermissionsAction,
  type InviteState,
  type PreviewState,
} from "@/lib/caregiver/actions";
import { permissionFields, type Permissions } from "@/lib/caregiver/permissions";
import { useI18n } from "@/lib/i18n/provider";
import { smsHref } from "@/lib/sos/messages";
import { Field, FormMessage, SubmitButton, useKeptAction } from "./form-parts";

function PermissionBoxes({ current }: { current?: Permissions }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col">
      {permissionFields.map((field) => (
        <label key={field.key} className="flex min-h-[48px] cursor-pointer items-center gap-3 py-1">
          <input
            type="checkbox"
            name={field.key}
            defaultChecked={current ? current[field.column] : field.defaultOn}
            className="size-6 shrink-0 accent-brand"
          />
          <span>{t.circle.permissions[field.key]}</span>
        </label>
      ))}
    </div>
  );
}

export function InviteForm({ appUrl }: { appUrl: string }) {
  const { t } = useI18n();
  const c = t.circle;
  const { state, action, onSubmit, pending } = useKeptAction<InviteState>(createInvitationAction, idleState);
  const link = state.code ? `${appUrl}/caregiver/accept?code=${state.code}` : "";

  return (
    <div className="flex flex-col gap-3">
      {state.code && (
        <div role="status" className="notice notice-info flex-col">
          <p className="font-bold">{c.inviteCodeTitle}</p>
          <p className="text-[1.6rem] font-extrabold tracking-widest break-all" data-testid="invite-code">
            {state.code}
          </p>
          <p>{c.inviteCodeHelp}</p>
          <p className="text-[0.9rem] break-all">
            <span className="font-bold">{c.inviteLink}:</span> {link}
          </p>
          <a className="btn btn-secondary" href={smsHref("", c.inviteShareText(link))}>
            <MessageSquare aria-hidden size={22} /> {c.inviteShare}
          </a>
        </div>
      )}
      <form action={action} onSubmit={onSubmit} className="card flex flex-col gap-3">
        <fieldset>
          <legend className="mb-1 font-bold">{c.inviteLegend}</legend>
          <PermissionBoxes />
        </fieldset>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>{c.inviteButton}</SubmitButton>
      </form>
    </div>
  );
}

export function PermissionsForm({ linkId, name, current }: { linkId: string; name: string; current: Permissions }) {
  const { t } = useI18n();
  const { state, action, onSubmit, pending } = useKeptAction(updatePermissionsAction, idleState);
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="linkId" value={linkId} />
      <fieldset>
        <legend className="mb-1 font-bold">{t.circle.permissionsSummary(name)}</legend>
        <PermissionBoxes current={current} />
      </fieldset>
      <FormMessage state={state} success={t.common.saved} />
      <SubmitButton pending={pending} className="btn btn-secondary">{t.circle.savePermissions}</SubmitButton>
    </form>
  );
}

function AcceptStep({ preview }: { preview: PreviewState }) {
  const { t } = useI18n();
  const a = t.caregiver.accept;
  const { state, action, onSubmit, pending } = useKeptAction(acceptInvitationAction, idleState);
  const shared = permissionFields.filter((field) => preview.permissions?.[field.column]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[1.1rem] font-extrabold">{a.from(preview.inviter ?? "")}</p>
      <div>
        <p className="font-bold">{a.willSee}</p>
        <ul className="list-disc pl-6">
          {shared.map((field) => (
            <li key={field.key}>{t.circle.permissions[field.key]}</li>
          ))}
        </ul>
      </div>
      <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3">
        <input type="hidden" name="code" value={preview.code} />
        <FormMessage state={state} />
        <SubmitButton pending={pending}>{a.confirm}</SubmitButton>
      </form>
    </div>
  );
}

export function AcceptInvitationForm({ initialCode }: { initialCode: string }) {
  const { t } = useI18n();
  const a = t.caregiver.accept;
  const { state, action, onSubmit, pending } = useKeptAction<PreviewState>(previewInvitationAction, idleState);
  return (
    <div className="flex flex-col gap-4">
      {state.status === "success" && state.permissions && (
        <>
          <AcceptStep preview={state} />
          <h2>{a.other}</h2>
        </>
      )}
      <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <Field
          state={state}
          name="code"
          label={a.code}
          defaultValue={initialCode}
          autoComplete="off"
          autoCapitalize="characters"
          required
        />
        <FormMessage state={state} />
        <SubmitButton pending={pending} className={state.status === "success" ? "btn btn-secondary" : "btn btn-primary"}>{a.check}</SubmitButton>
      </form>
    </div>
  );
}
