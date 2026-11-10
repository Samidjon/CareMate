"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Footprints, LocateFixed } from "lucide-react";
import type { FacilityCategory } from "@/lib/facilities/types";
import { distanceKm, getCurrentPosition, type Coordinates } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";
import { loadOrigin, saveOrigin, walkingRoute, type Origin } from "@/lib/maps/client";
import type { WalkingRoute } from "@/lib/maps/types";
import { FacilityMapLazy } from "./facility-map-lazy";

type WalkState = { kind: "idle" } | { kind: "loading" } | { kind: "found"; route: WalkingRoute } | { kind: "failed" };

export function FacilityWalk({
  id,
  name,
  category,
  destination,
}: {
  id: string;
  name: string;
  category: FacilityCategory;
  destination: Coordinates;
}) {
  const { t } = useI18n();
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [walk, setWalk] = useState<WalkState>({ kind: "idle" });
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setOrigin(loadOrigin());
  }, []);

  async function useHere() {
    setLocating(true);
    try {
      const position = await getCurrentPosition();
      const here = { latitude: position.latitude, longitude: position.longitude, label: t.map.originHere };
      saveOrigin(here);
      setOrigin(here);
      setWalk({ kind: "idle" });
    } catch {
      setWalk({ kind: "failed" });
    } finally {
      setLocating(false);
    }
  }

  async function route() {
    if (!origin) return;
    setWalk({ kind: "loading" });
    const answer = await walkingRoute(origin, destination);
    setWalk(answer.ok ? { kind: "found", route: answer.value } : { kind: "failed" });
  }

  const { latitude, longitude } = destination;
  return (
    <section aria-labelledby="walk-title" className="card flex flex-col gap-3">
      <h2 id="walk-title">{t.facility.walkTitle}</h2>
      {origin ? (
        <>
          <p className="font-bold break-words">{t.facility.distanceFrom(origin.label, distanceKm(origin, destination).toFixed(1))}</p>
          <button type="button" className="btn btn-primary" onClick={route} disabled={walk.kind === "loading"}>
            <Footprints aria-hidden size={22} /> {t.facility.walkButton}
          </button>
          <p className="secondary-text text-[0.9rem] text-muted">{t.facility.walkPrivacy}</p>
        </>
      ) : (
        <>
          <p>{t.facility.walkNoOrigin}</p>
          <button type="button" className="btn btn-primary" onClick={useHere} disabled={locating}>
            <LocateFixed aria-hidden size={22} /> {t.map.useMyLocation}
          </button>
        </>
      )}

      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {walk.kind === "loading" && <p>{t.facility.walkLoading}</p>}
        {walk.kind === "found" && (
          <>
            <p className="notice notice-info font-bold">{t.facility.walkResult(walk.route.durationMin, walk.route.distanceKm.toFixed(1))}</p>
            <p className="notice notice-warn">{t.facility.walkSidewalk}</p>
          </>
        )}
        {walk.kind === "failed" && <p className="notice notice-warn">{t.facility.walkFailed}</p>}
      </div>
      {walk.kind === "found" && origin && (
        <FacilityMapLazy origin={origin} route={walk.route.line} points={[{ id, name, category, latitude, longitude }]} />
      )}

      <a
        className="btn btn-secondary"
        href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink aria-hidden size={22} /> {t.facility.walkGoogle}
      </a>
      <a
        className="btn btn-secondary"
        href={`https://yandex.com/maps/?rtext=~${latitude},${longitude}&rtt=pd`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink aria-hidden size={22} /> {t.facility.walkYandex}
      </a>
    </section>
  );
}
