"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Building2, MapPinned, Search } from "lucide-react";
import { facilityName, type Facility } from "@/lib/facilities/types";
import type { Coordinates } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";
import { searchPlaces } from "@/lib/maps/client";
import type { PlaceSuggestion } from "@/lib/maps/types";

const DEBOUNCE_MS = 400;
const MIN_PLACE_QUERY = 3;

type Option =
  | { kind: "facility"; id: string; label: string; detail: string }
  | { kind: "place"; place: PlaceSuggestion };

function normalize(text: string) {
  return text.toLowerCase().replace(/['`‘’ʻʼ"«»]/g, "").trim();
}

/**
 * One search box for both: facilities from our own list (instant, no network)
 * and addresses from the map service (debounced, with outdated requests cancelled).
 * Built as an ARIA combobox, so it works with a keyboard and a screen reader.
 */
export function PlaceSearch({
  facilities,
  value,
  onChange,
  near,
  onPickFacility,
  onPickPlace,
}: {
  facilities: Facility[];
  value: string;
  onChange: (value: string) => void;
  near: Coordinates | null;
  onPickFacility: (id: string) => void;
  onPickPlace: (place: PlaceSuggestion) => void;
}) {
  const { t, locale } = useI18n();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [placeState, setPlaceState] = useState<"idle" | "loading" | "failed">("idle");
  const controller = useRef<AbortController | null>(null);

  const query = normalize(value);
  const facilityOptions: Option[] = query
    ? facilities
        .filter((facility) => normalize([facility.name_uz, facility.name_ru, facility.address, facility.district].filter(Boolean).join(" ")).includes(query))
        .slice(0, 5)
        .map((facility) => ({
          kind: "facility",
          id: facility.id,
          label: facilityName(facility, locale),
          detail: t.map.categories[facility.category],
        }))
    : [];
  const options: Option[] = [...facilityOptions, ...places.map((place): Option => ({ kind: "place", place }))];

  useEffect(() => {
    controller.current?.abort();
    if (value.trim().length < MIN_PLACE_QUERY) return;
    const current = new AbortController();
    controller.current = current;
    const timer = window.setTimeout(async () => {
      setPlaceState("loading");
      try {
        const answer = await searchPlaces(value.trim(), near, current.signal);
        if (current.signal.aborted) return;
        if (answer.ok) {
          setPlaces(answer.value);
          setPlaceState("idle");
        } else {
          setPlaces([]);
          setPlaceState("failed");
        }
      } catch {
        // Aborted: a newer search has taken over.
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      current.abort();
    };
  }, [value, near]);

  function pick(option: Option) {
    setOpen(false);
    setActive(-1);
    if (option.kind === "facility") onPickFacility(option.id);
    else onPickPlace(option.place);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === "Enter" && open && active >= 0 && options[active]) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const showList = open && value.trim().length > 0 && options.length > 0;
  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="mb-1 block font-bold">
        {t.map.searchLabel}
      </label>
      <div className="relative">
        <Search aria-hidden size={24} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={`${listId}-list`}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          placeholder={t.map.searchPlaceholder}
          autoComplete="off"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
            if (event.target.value.trim().length < MIN_PLACE_QUERY) {
              setPlaces([]);
              setPlaceState("idle");
            }
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className="min-h-[60px] w-full rounded-xl border-2 border-line-strong bg-surface py-2 pr-3 pl-11 text-[1.05rem]"
        />
      </div>

      <ul
        id={`${listId}-list`}
        role="listbox"
        aria-label={t.map.searchLabel}
        hidden={!showList}
        className="absolute inset-x-0 z-[1100] mt-1 max-h-[60vh] overflow-y-auto rounded-xl border-2 border-line-strong bg-surface shadow-xl"
      >
        {options.map((option, index) => {
          const isPlace = option.kind === "place";
          const firstPlace = isPlace && index === facilityOptions.length;
          return (
            <li
              key={isPlace ? `p-${option.place.label}` : option.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // Keeps focus in the input, so the list does not close before the tap registers.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
              className={`flex min-h-[56px] cursor-pointer items-center gap-3 px-3 py-2 ${index === active ? "bg-brand-pale" : ""} ${
                firstPlace && index > 0 ? "border-t-2 border-line" : ""
              }`}
            >
              {isPlace ? <MapPinned aria-hidden size={22} className="shrink-0" /> : <Building2 aria-hidden size={22} className="shrink-0" />}
              <span className="flex min-w-0 flex-col">
                <span className="font-bold break-words">{isPlace ? option.place.label : option.label}</span>
                <span className="text-[0.85rem] text-muted">{isPlace ? t.map.suggestionsPlaces : option.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p role="status" className="sr-only">
        {showList ? t.map.suggestionsCount(options.length) : ""}
      </p>
      <div role="status" aria-live="polite">
        {placeState === "loading" && value.trim().length >= MIN_PLACE_QUERY && (
          <p className="mt-1 text-[0.9rem] text-muted">{t.map.suggestionsLoading}</p>
        )}
        {placeState === "failed" && <p className="notice notice-warn mt-2">{t.map.suggestionsFailed}</p>}
      </div>
    </div>
  );
}
