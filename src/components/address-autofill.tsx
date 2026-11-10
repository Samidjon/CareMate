"use client";

import { useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { getCurrentPosition } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";
import { reverseGeocode } from "@/lib/maps/client";
import type { ReverseResult } from "@/lib/maps/types";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "filled"; address: string }
  | { kind: "confirm"; found: ReverseResult }
  | { kind: "failed" };

const FIELDS = { address: "street", district: "district", city: "city" } as const;

/**
 * Fills the address fields of the surrounding form from the current location,
 * after the person agrees. It never overwrites what they typed without asking,
 * and only the words are kept: coordinates are not saved.
 */
export function AddressAutofill() {
  const { t, locale } = useI18n();
  const p = t.profile;
  const root = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  const field = (name: keyof typeof FIELDS) =>
    root.current?.closest("form")?.elements.namedItem(name) as HTMLInputElement | null | undefined;

  function fill(found: ReverseResult, overwrite: boolean) {
    for (const [name, key] of Object.entries(FIELDS) as [keyof typeof FIELDS, keyof ReverseResult][]) {
      const input = field(name);
      const value = found[key];
      if (input && value && (overwrite || !input.value.trim())) input.value = value;
    }
    setState({ kind: "filled", address: found.address });
  }

  async function locate() {
    setState({ kind: "busy" });
    try {
      const position = await getCurrentPosition();
      const answer = await reverseGeocode({ latitude: position.latitude, longitude: position.longitude }, locale);
      if (!answer.ok) {
        setState({ kind: "failed" });
        return;
      }
      if (field("address")?.value.trim()) setState({ kind: "confirm", found: answer.value });
      else fill(answer.value, false);
    } catch {
      setState({ kind: "failed" });
    }
  }

  return (
    <div ref={root} className="flex flex-col gap-2">
      <button type="button" className="btn btn-secondary" onClick={locate} disabled={state.kind === "busy"}>
        <LocateFixed aria-hidden size={22} /> {p.addressLocate}
      </button>
      <p className="text-[0.9rem] text-muted">{p.addressWhy}</p>
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {state.kind === "filled" && <p className="notice notice-info">{p.addressFilled}</p>}
        {state.kind === "failed" && <p className="notice notice-warn">{p.addressFailed}</p>}
        {state.kind === "confirm" && (
          <>
            <p className="notice break-words">{p.addressFound(state.found.address)}</p>
            <button type="button" className="btn btn-primary" onClick={() => fill(state.found, true)}>
              {p.addressReplace}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setState({ kind: "idle" })}>
              {p.addressKeep}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
