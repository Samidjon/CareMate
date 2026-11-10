"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentPosition, type Coordinates } from "@/lib/geo";

export const COUNTDOWN_SECONDS = 5;

export type SosOutcome = "demo" | "sent" | "partial" | "failed" | "not_configured" | "no_recipients";

export type SosState =
  | { phase: "idle" }
  | { phase: "countdown"; seconds: number }
  | { phase: "preparing" }
  | { phase: "sending" }
  | {
      phase: "done";
      outcome: SosOutcome;
      reached: number;
      eventId: string | null;
      createdAt: string;
      location: Coordinates | null;
    }
  | { phase: "error"; reason: "failed" | "offline" | "rateLimited"; location: Coordinates | null };

async function locate(): Promise<(Coordinates & { accuracy: number }) | null> {
  try {
    return await getCurrentPosition(6000);
  } catch {
    return null; // Never let a missing location delay the alert.
  }
}

/** The steps of raising an alert, with honest states. `signedIn` false in demo runs locally only. */
export function useSosFlow({ demo, signedIn }: { demo: boolean; signedIn: boolean }) {
  const [state, setState] = useState<SosState>({ phase: "idle" });
  const runRef = useRef(0);

  const send = useCallback(async () => {
    const run = ++runRef.current;
    setState({ phase: "preparing" });
    const position = await locate();
    if (run !== runRef.current) return;
    const location = position ? { latitude: position.latitude, longitude: position.longitude } : null;

    if (demo && !signedIn) {
      setState({ phase: "done", outcome: "demo", reached: 0, eventId: null, createdAt: new Date().toISOString(), location });
      return;
    }
    if (!navigator.onLine) {
      setState({ phase: "error", reason: "offline", location });
      return;
    }

    setState({ phase: "sending" });
    try {
      const response = await fetch("/api/sos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          demo,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          accuracy: position?.accuracy ?? null,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (run !== runRef.current) return;
      if (response.status === 429) {
        setState({ phase: "error", reason: "rateLimited", location });
        return;
      }
      if (!response.ok) {
        setState({ phase: "error", reason: "failed", location });
        return;
      }
      const body = await response.json();
      setState({
        phase: "done",
        outcome: body.delivery.status,
        reached: body.delivery.reached,
        eventId: body.eventId,
        createdAt: body.createdAt,
        location,
      });
    } catch {
      if (run === runRef.current) setState({ phase: "error", reason: navigator.onLine ? "failed" : "offline", location });
    }
  }, [demo, signedIn]);

  const phase = state.phase;
  useEffect(() => {
    if (phase !== "countdown") return;
    let remaining = COUNTDOWN_SECONDS;
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setState({ phase: "countdown", seconds: remaining });
      } else {
        window.clearInterval(timer);
        void send();
      }
    }, 1000);
    // Cancelling leaves the countdown phase, which stops the timer before anything is sent.
    return () => window.clearInterval(timer);
  }, [phase, send]);

  return {
    state,
    start: () => setState({ phase: "countdown", seconds: COUNTDOWN_SECONDS }),
    reset: () => {
      runRef.current += 1;
      setState({ phase: "idle" });
    },
  };
}
