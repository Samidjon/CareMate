"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { LocationView } from "@/lib/location/logic";
import { reverseGeocode } from "@/lib/maps/client";
import type { PersonPoint } from "./shared-location-map";

export const SharedLocationMapLazy = dynamic(() => import("./shared-location-map"), {
  ssr: false,
  loading: () => <div className="h-[45vh] min-h-[260px] w-full animate-pulse rounded-2xl bg-brand-pale" />,
});

export function SharedLocations({
  people,
  staleMinutes,
}: {
  people: { patientId: string; name: string; view: LocationView; updated: string | null }[];
  staleMinutes: number;
}) {
  const { t } = useI18n();
  const points: PersonPoint[] = people.flatMap((person) =>
    person.view.kind === "active" || person.view.kind === "stale" || person.view.kind === "unavailable"
      ? [{ id: person.patientId, name: person.name, latitude: person.view.location.latitude, longitude: person.view.location.longitude, kind: person.view.kind }]
      : [],
  );
  return (
    <div className="flex flex-col gap-4">
      {points.length > 0 && <SharedLocationMapLazy points={points} label={t.sharedLocations.mapLabel} />}
      <ul className="flex flex-col gap-3">
        {people.map((person) => (
          <li key={person.patientId}>
            <PersonCard name={person.name} view={person.view} updated={person.updated} staleMinutes={staleMinutes} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonCard({ name, view, updated, staleMinutes }: { name: string; view: LocationView; updated: string | null; staleMinutes: number }) {
  const { t, locale } = useI18n();
  const s = t.sharedLocations;
  const [address, setAddress] = useState<{ kind: "idle" | "loading" | "failed" } | { kind: "found"; text: string }>({ kind: "idle" });
  if (view.kind === "revoked") return null;

  const badge = { active: "border-brand text-brand-dark", stale: "border-line-strong text-muted", unavailable: "border-amber-ink text-amber-ink", waiting: "border-line-strong", paused: "border-line-strong text-muted" }[view.kind];
  const message =
    view.kind === "stale" ? s.states.stale(staleMinutes) : s.states[view.kind as "active" | "unavailable" | "waiting" | "paused"];
  const location = "location" in view ? view.location : null;

  async function lookUp() {
    if (!location) return;
    setAddress({ kind: "loading" });
    const answer = await reverseGeocode(location, locale);
    setAddress(answer.ok && answer.value.address ? { kind: "found", text: answer.value.address } : { kind: "failed" });
  }

  return (
    <article className="card flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.2rem] break-words">{name}</h2>
        <span className={`rounded-lg border-2 px-2 font-extrabold ${badge}`}>{s.badge[view.kind as keyof typeof s.badge]}</span>
      </div>
      <p className={view.kind === "active" ? "" : "notice notice-warn"}>{message}</p>
      {location && (
        <>
          {updated && <p className="font-bold">{s.updated(updated)}</p>}
          <p>
            {s.accuracy(location.accuracy_meters === null ? t.location.accuracyUnknown : t.location.approx(Math.round(location.accuracy_meters)))}
          </p>
          <p className="text-[0.9rem]">{s.coordinates(location.latitude.toFixed(5), location.longitude.toFixed(5))}</p>
          <div role="status" aria-live="polite">
            {address.kind === "found" && <p className="font-bold break-words">{address.text}</p>}
            {address.kind === "failed" && <p className="notice notice-warn">{s.addressFailed}</p>}
          </div>
          {address.kind !== "found" && (
            <button type="button" className="btn btn-secondary" onClick={lookUp} disabled={address.kind === "loading"}>
              {s.address}
            </button>
          )}
          <a
            className="btn btn-primary"
            href={`https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink aria-hidden size={22} /> {s.directions}
          </a>
        </>
      )}
    </article>
  );
}
