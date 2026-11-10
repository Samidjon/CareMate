"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MapPin, TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { isPlausible, shouldSend, type SentPosition } from "@/lib/location/logic";

async function report(body: object) {
  try {
    const response = await fetch("/api/location/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

/**
 * While the patient shares their location, keeps their last known position up to
 * date as long as CareMate is open, and always says so on screen. Nothing runs
 * when sharing is off, and nothing runs when the page is closed or asleep.
 */
export function LocationReporter() {
  const { t } = useI18n();
  const [problem, setProblem] = useState(false);
  const [stopped, setStopped] = useState(false);
  const last = useRef<SentPosition | null>(null);
  const reportedProblem = useRef(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let active = true;
    const watch = navigator.geolocation.watchPosition(
      async ({ coords, timestamp }) => {
        const point = { latitude: coords.latitude, longitude: coords.longitude, accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null };
        if (!isPlausible(point)) return;
        setProblem(false);
        reportedProblem.current = false;
        if (!shouldSend(last.current, point, Date.now())) return;
        last.current = { ...point, at: Date.now() };
        const status = await report({ kind: "position", ...point, recordedAt: new Date(timestamp).toISOString() });
        if (!active) return;
        if (status === 409) setStopped(true);
        // Not sent: try again with the next reading rather than waiting two minutes.
        else if (status !== 200 && status !== 429) last.current = null;
      },
      async () => {
        setProblem(true);
        if (reportedProblem.current) return;
        reportedProblem.current = true;
        if ((await report({ kind: "unavailable" })) === 409 && active) setStopped(true);
      },
      // Low power: no constant GPS, and a reading up to a minute old is fine.
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watch);
    };
  }, []);

  if (stopped) return null;
  return (
    <div role="status" className={`border-b-2 ${problem ? "border-amber-ink bg-amber-pale text-amber-ink" : "border-brand bg-brand-pale"}`}>
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-1.5">
        <span className="flex items-center gap-2 font-bold">
          {problem ? <TriangleAlert aria-hidden size={20} /> : <MapPin aria-hidden size={20} />}
          {problem ? t.location.bannerProblem : t.location.banner}
        </span>
        <Link href="/location" className="flex min-h-[48px] items-center font-bold underline">
          {t.location.bannerManage}
        </Link>
      </div>
    </div>
  );
}
