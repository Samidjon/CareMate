"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MapPin, Pause, Play, Square } from "lucide-react";
import { getCurrentPosition } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";
import { setAllSharesAction, setHelperShareAction, startSharingAction } from "@/lib/location/actions";
import { locationProblem } from "@/lib/maps/client";

export type HelperShare = { id: string; name: string; status: "active" | "paused" | "revoked" | null };
type Permission = "granted" | "denied" | "prompt" | "unknown";
type StartState = { kind: "idle" } | { kind: "asking" } | { kind: "started" } | { kind: "problem"; reason: "denied" | "unavailable" | "timeout" | "network" };

export function LocationSharingPanel({
  helpers,
  lastUpdate,
}: {
  helpers: HelperShare[];
  /** Already formatted for display, or null if nothing has been shared yet. */
  lastUpdate: string | null;
}) {
  const { t } = useI18n();
  const l = t.location;
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [permission, setPermission] = useState<Permission>("unknown");
  const [start, setStart] = useState<StartState>({ kind: "idle" });

  const active = helpers.filter((helper) => helper.status === "active");
  const paused = helpers.filter((helper) => helper.status === "paused");
  const state = active.length ? "on" : paused.length ? "paused" : "off";

  useEffect(() => {
    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        status = result;
        setPermission(result.state);
        result.onchange = () => setPermission(result.state);
      })
      .catch(() => setPermission("unknown"));
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  async function begin() {
    setStart({ kind: "asking" });
    let position;
    try {
      // The browser asks the person here, after they have read the explanation above.
      position = await getCurrentPosition(15000);
    } catch (error) {
      setStart({ kind: "problem", reason: locationProblem(error) });
      return;
    }
    if (!navigator.onLine) {
      setStart({ kind: "problem", reason: "network" });
      return;
    }
    const result = await startSharingAction(chosen);
    if (!result.ok) {
      setStart({ kind: "problem", reason: "network" });
      return;
    }
    await fetch("/api/location/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "position",
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: Number.isFinite(position.accuracy) ? position.accuracy : null,
        recordedAt: new Date().toISOString(),
      }),
    }).catch(() => {});
    setStart({ kind: "started" });
    router.refresh();
  }

  const permissionText = { granted: l.permissionGranted, denied: l.permissionDenied, prompt: l.permissionPrompt, unknown: l.permissionUnknown }[permission];

  return (
    <div className="flex flex-col gap-4">
      <p className="notice notice-info">{l.explain}</p>
      <p className="secondary-text text-[0.9rem]">{l.limits}</p>

      <dl className="card flex flex-col gap-2">
        <div>
          <dt className="font-bold">{l.statusLabel}</dt>
          <dd className="text-[1.15rem] font-extrabold">{state === "on" ? `● ${l.statusOn}` : state === "paused" ? `❚❚ ${l.statusPaused}` : `○ ${l.statusOff}`}</dd>
        </div>
        <div>
          <dt className="font-bold">{l.lastUpdate}</dt>
          <dd>{lastUpdate ?? l.never}</dd>
        </div>
        <div>
          <dt className="font-bold">{l.permission}</dt>
          <dd>{permissionText}</dd>
        </div>
      </dl>

      <section aria-labelledby="choose-title" className="card flex flex-col gap-2">
        <h2 id="choose-title">{l.chooseTitle}</h2>
        <p className="secondary-text text-[0.9rem] text-muted">{l.chooseHelp}</p>
        {helpers.length === 0 && <p className="notice">{l.noHelpers}</p>}
        {state === "off"
          ? helpers.map((helper) => (
              <label key={helper.id} className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 border-line px-3">
                <input
                  type="checkbox"
                  className="size-6 shrink-0 accent-brand"
                  checked={chosen.includes(helper.id)}
                  onChange={(event) =>
                    setChosen((current) => (event.target.checked ? [...current, helper.id] : current.filter((id) => id !== helper.id)))
                  }
                />
                <span className="font-bold break-words">{helper.name}</span>
              </label>
            ))
          : helpers.map((helper) => {
              const on = helper.status === "active" || helper.status === "paused";
              return (
                <form key={helper.id} action={setHelperShareAction}>
                  <input type="hidden" name="caregiverId" value={helper.id} />
                  <input type="hidden" name="status" value={on ? "revoked" : "active"} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={on}
                    className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border-2 px-3 text-left font-bold ${
                      on ? "border-brand bg-brand-pale" : "border-line-strong bg-surface"
                    }`}
                  >
                    <span className="break-words">{on ? l.helperOn(helper.name) : l.helperOff(helper.name)}</span>
                    <span aria-hidden>{on ? "✓" : "✕"}</span>
                  </button>
                </form>
              );
            })}
      </section>

      {state === "off" && helpers.length > 0 && (
        <>
          <button type="button" className="btn btn-primary min-h-[72px] text-[1.15rem]" onClick={begin} disabled={chosen.length === 0 || start.kind === "asking"}>
            <MapPin aria-hidden size={26} /> {l.start}
          </button>
          {chosen.length === 0 && <p className="text-[0.9rem] text-muted">{l.startNeedsHelper}</p>}
        </>
      )}

      <div role="status" aria-live="polite">
        {start.kind === "asking" && <p>{l.asking}</p>}
        {start.kind === "started" && <p className="notice notice-info">{l.started}</p>}
        {start.kind === "problem" && <p className="notice notice-warn">{l[start.reason]}</p>}
      </div>

      {state !== "off" && (
        <div className="flex flex-col gap-2">
          <form action={setAllSharesAction}>
            <input type="hidden" name="mode" value={state === "on" ? "pause" : "resume"} />
            <button type="submit" className="btn btn-secondary">
              {state === "on" ? <Pause aria-hidden size={22} /> : <Play aria-hidden size={22} />}
              {state === "on" ? l.pause : l.resume}
            </button>
          </form>
          <form action={setAllSharesAction} className="flex flex-col gap-1">
            <input type="hidden" name="mode" value="stop" />
            <button type="submit" className="btn btn-danger">
              <Square aria-hidden size={20} /> {l.stop}
            </button>
            <p className="text-[0.9rem] text-muted">{l.stopHelp}</p>
          </form>
        </div>
      )}
    </div>
  );
}
