"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageSquare, Phone, PhoneCall, TriangleAlert, Users } from "lucide-react";
import { openStreetMapUrl, type Coordinates } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";
import { tashkentTime } from "@/lib/routine/schedule";
import { buildSmsBody, smsHref } from "@/lib/sos/messages";
import { useSosFlow, type SosOutcome } from "@/lib/sos/use-sos-flow";
import { SosLocation } from "./sos-location";
import { VoiceHint } from "./voice-hint";

type Contact = { id: string; name: string; phone: string; relationship: string | null };
type ContactsState = { kind: "loading" } | { kind: "ready"; contacts: Contact[] } | { kind: "failed" };

function useContacts(enabled: boolean) {
  const [state, setState] = useState<ContactsState>({ kind: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch("/api/emergency-contacts", { signal: AbortSignal.timeout(6000) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("load failed"))))
      .then((body) => active && setState({ kind: "ready", contacts: body.contacts }))
      .catch(() => active && setState({ kind: "failed" }));
    return () => {
      active = false;
    };
  }, [enabled]);
  return state;
}

function ContactsBlock({ state, demo, location }: { state: ContactsState; demo: boolean; location: Coordinates | null }) {
  const { t } = useI18n();
  if (state.kind === "loading") return null;
  if (state.kind === "failed") return <p className="notice notice-warn">{t.sos.contactsFailed}</p>;
  if (state.contacts.length === 0) {
    return (
      <>
        <p>{t.sos.contactsEmpty}</p>
        <Link href="/circle" className="btn btn-secondary">
          <Users aria-hidden size={22} /> {t.sos.contactsAdd}
        </Link>
      </>
    );
  }
  const body = buildSmsBody(t, location);
  return (
    <ul className="flex flex-col gap-3">
      {state.contacts.map((contact) => (
        <li key={contact.id} className="flex flex-col gap-2">
          {demo ? (
            <p className="notice notice-warn">
              {t.sos.demoCallDisabled(contact.name)}
            </p>
          ) : (
            <>
              <a href={`tel:${contact.phone}`} className="btn btn-primary">
                <Phone aria-hidden size={22} /> {t.sos.contactCall(contact.name)}
              </a>
              <a href={smsHref(contact.phone, body)} className="btn btn-secondary">
                <MessageSquare aria-hidden size={22} /> {t.sos.contactSms(contact.name)}
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function EventFollowUp({ eventId, createdAt, location, demo }: { eventId: string | null; createdAt: string; location: Coordinates | null; demo: boolean }) {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const [addressState, setAddressState] = useState<"idle" | "saved" | "failed">("idle");
  const [cancelState, setCancelState] = useState<"idle" | "cancelled" | "failed">("idle");
  const [seenBy, setSeenBy] = useState<{ name: string; at: string }[]>([]);

  useEffect(() => {
    if (!eventId || demo) return;
    const poll = () =>
      fetch(`/api/sos?id=${eventId}`, { signal: AbortSignal.timeout(8000) })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => body && setSeenBy(body.acknowledgements))
        .catch(() => {}); // A missed check is simply retried on the next one.
    void poll();
    const timer = window.setInterval(poll, 10_000);
    return () => window.clearInterval(timer);
  }, [eventId, demo]);

  async function patch(body: object) {
    const response = await fetch("/api/sos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: eventId, ...body }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("update failed");
  }

  async function saveAddress() {
    try {
      await patch({ manualAddress: address });
      setAddressState("saved");
    } catch {
      setAddressState("failed");
    }
  }

  async function cancelEvent() {
    try {
      await patch({ status: "cancelled" });
      setCancelState("cancelled");
    } catch {
      setCancelState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p>{t.sos.eventTime(tashkentTime(createdAt))}</p>
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {seenBy.map((entry) => (
          <p key={entry.name + entry.at} className="notice notice-info font-bold">
            {t.sos.acknowledgedBy(entry.name, tashkentTime(entry.at))}
          </p>
        ))}
      </div>
      {location ? (
        <>
          <p className="font-bold">{t.sos.locationFound(location.latitude.toFixed(5), location.longitude.toFixed(5))}</p>
          <a className="btn btn-secondary" href={openStreetMapUrl(location)} target="_blank" rel="noopener noreferrer">
            {t.sos.locationOpenMap}
          </a>
        </>
      ) : (
        eventId && (
          <div className="flex flex-col gap-2">
            <div className="field">
              <label htmlFor="sos-address">{t.sos.noLocationSaved}</label>
              <input id="sos-address" value={address} maxLength={300} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" />
            </div>
            <button type="button" className="btn btn-secondary" disabled={!address.trim()} onClick={saveAddress}>
              {t.sos.addressSave}
            </button>
            <div role="status">
              {addressState === "saved" && <p className="notice notice-info">{t.sos.addressSaved}</p>}
              {addressState === "failed" && <p className="notice notice-error">{t.errors.saveFailed}</p>}
            </div>
          </div>
        )
      )}
      {eventId && !demo && (
        <>
          <button type="button" className="btn btn-danger" disabled={cancelState === "cancelled"} onClick={cancelEvent}>
            {t.sos.eventCancel}
          </button>
          <div role="status">
            {cancelState === "cancelled" && <p className="notice notice-info">{t.sos.eventCancelled}</p>}
            {cancelState === "failed" && <p className="notice notice-error">{t.errors.saveFailed}</p>}
          </div>
        </>
      )}
    </div>
  );
}

export function SosScreen({ demo, signedIn, emergencyNumber }: { demo: boolean; signedIn: boolean; emergencyNumber: string }) {
  const { t } = useI18n();
  const flow = useSosFlow({ demo, signedIn });
  const contacts = useContacts(signedIn);
  const { state } = flow;

  const canNotify = signedIn || demo;
  const location = state.phase === "done" || state.phase === "error" ? state.location : null;
  const outcomeText = (outcome: SosOutcome, reached: number) =>
    ({
      demo: t.sos.status.demo,
      sent: t.sos.status.sent(reached),
      partial: t.sos.status.partial(reached),
      failed: t.sos.status.failed,
      not_configured: t.sos.status.notConfigured,
      no_recipients: t.sos.status.noRecipients,
    })[outcome];

  return (
    <div className="flex flex-col gap-4" data-voice-page={demo ? `${t.sos.demoTitle}. ${t.sos.demoBanner}` : t.sos.pageVoice}>
      <h1>{demo ? t.sos.demoTitle : t.sos.title}</h1>

      {demo && (
        <div className="notice notice-warn flex-col">
          <p className="flex gap-2 font-extrabold">
            <TriangleAlert aria-hidden size={24} className="shrink-0" /> {t.sos.demoBanner}
          </p>
          <Link href="/sos" className="btn btn-sos">
            {t.sos.demoExit}
          </Link>
        </div>
      )}

      <section aria-labelledby="sos-call" className="flex flex-col gap-3">
        <h2 id="sos-call">{t.sos.callTitle}</h2>
        {demo ? (
          <p className="notice notice-warn font-bold">{t.sos.demoCallDisabled(emergencyNumber)}</p>
        ) : (
          <a href={`tel:${emergencyNumber}`} className="btn btn-sos min-h-[88px] text-[1.3rem]">
            <PhoneCall aria-hidden size={32} />
            {t.sos.call(emergencyNumber)}
          </a>
        )}
        <p className="secondary-text text-[0.9rem] text-muted">{t.sos.callNote}</p>
      </section>

      <section aria-labelledby="sos-notify" className="card flex flex-col gap-3">
        <h2 id="sos-notify">{t.sos.notifyTitle}</h2>
        <p className="text-[0.9rem]">{t.sos.notifyNote}</p>

        {!canNotify && (
          <>
            <p className="notice">{t.sos.loginToNotify}</p>
            <Link href="/login?next=/sos" className="btn btn-secondary">
              {t.sos.loginLink}
            </Link>
          </>
        )}

        {canNotify && state.phase === "idle" && (
          <>
            <button type="button" className="btn btn-primary" onClick={flow.start}>
              {t.sos.notifyButton}
            </button>
            <p className="secondary-text text-[0.9rem] text-muted">{t.sos.countdownLocation}</p>
          </>
        )}

        {state.phase === "countdown" && (
          <>
            <p className="notice notice-warn text-[1.2rem] font-extrabold" role="timer">
              {t.sos.countdown(state.seconds)}
            </p>
            <button type="button" className="btn btn-secondary" onClick={flow.reset}>
              {t.sos.cancel}
            </button>
          </>
        )}

        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {(state.phase === "preparing" || state.phase === "sending" || state.phase === "done" || state.phase === "error") && (
            <p className="font-bold">{t.sos.statusTitle}:</p>
          )}
          {state.phase === "preparing" && <p>{t.sos.status.preparing}</p>}
          {state.phase === "sending" && <p>{t.sos.status.sending}</p>}
          {state.phase === "done" && (
            <p className={`notice ${state.outcome === "sent" || state.outcome === "demo" ? "notice-info" : "notice-warn"}`}>
              {outcomeText(state.outcome, state.reached)}
            </p>
          )}
          {state.phase === "error" && <p className="notice notice-error">{t.sos.status[state.reason]}</p>}
        </div>

        {state.phase === "error" && (
          <button type="button" className="btn btn-secondary" onClick={flow.start}>
            {t.sos.retry}
          </button>
        )}

        {state.phase === "done" && (
          <EventFollowUp eventId={state.eventId} createdAt={state.createdAt} location={state.location} demo={demo} />
        )}
      </section>

      {signedIn && (
        <section aria-labelledby="sos-contacts" className="card flex flex-col gap-3">
          <h2 id="sos-contacts">{t.sos.contactsTitle}</h2>
          <ContactsBlock state={contacts} demo={demo} location={location} />
        </section>
      )}

      {!demo && <SosLocation />}

      {/* Never start the 63 MB voice download during an emergency. */}
      <VoiceHint text={t.sos.voiceText} allowModelDownload={false} />

      <Link href="/" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.backHome}
      </Link>
    </div>
  );
}
