"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { getCurrentPosition, openStreetMapUrl } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";

type LocationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; lat: number; lng: number }
  | { kind: "denied" };

export function SosLocation() {
  const { t } = useI18n();
  const [state, setState] = useState<LocationState>({ kind: "idle" });

  async function locate() {
    setState({ kind: "loading" });
    try {
      const position = await getCurrentPosition();
      setState({ kind: "found", lat: position.latitude, lng: position.longitude });
    } catch {
      setState({ kind: "denied" });
    }
  }

  return (
    <section aria-labelledby="sos-location" className="card flex flex-col gap-3">
      <h2 id="sos-location">{t.sos.locationTitle}</h2>
      <p className="secondary-text text-[0.9rem] text-muted">{t.sos.locationHelp}</p>
      <button type="button" className="btn btn-secondary" onClick={locate} disabled={state.kind === "loading"}>
        <MapPin aria-hidden size={24} /> {t.sos.locationButton}
      </button>
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {state.kind === "loading" && <p>{t.sos.locationLoading}</p>}
        {state.kind === "found" && (
          <>
            <p className="font-bold">{t.sos.locationFound(state.lat.toFixed(5), state.lng.toFixed(5))}</p>
            <a
              className="btn btn-secondary"
              href={openStreetMapUrl({ latitude: state.lat, longitude: state.lng })}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.sos.locationOpenMap}
            </a>
          </>
        )}
        {state.kind === "denied" && (
          <p className="notice notice-error">
            {t.errors.locationDenied} {t.sos.locationManual}
          </p>
        )}
      </div>
    </section>
  );
}
