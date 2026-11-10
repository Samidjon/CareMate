"use client";

import { useEffect, useMemo, useState } from "react";
import { List, LocateFixed, Map as MapIcon, X } from "lucide-react";
import { filterFacilities } from "@/lib/facilities/filter";
import { accessibilityFeatures, facilityCategories, facilityName, type AccessibilityFeature, type Facility, type FacilityCategory } from "@/lib/facilities/types";
import { getCurrentPosition } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";
import { loadOrigin, locationProblem, reverseGeocode, saveOrigin, type Origin } from "@/lib/maps/client";
import { FacilityCard } from "./facility-card";
import { FacilityMapLazy } from "./facility-map-lazy";
import { PlaceSearch } from "./place-search";

const DISTANCES = [1, 3, 5, 10];

type LocationState =
  | { kind: "idle" }
  | { kind: "getting" }
  | { kind: "found" }
  | { kind: "address"; address: string }
  | { kind: "noAddress" }
  | { kind: "problem"; problem: "denied" | "unavailable" | "timeout" | "network" };

export function FacilityExplorer({ facilities }: { facilities: Facility[] }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FacilityCategory | "all">("all");
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [features, setFeatures] = useState<AccessibilityFeature[]>([]);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [location, setLocation] = useState<LocationState>({ kind: "idle" });
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // An origin chosen earlier in this tab is reused, e.g. after viewing a facility.
  useEffect(() => {
    const saved = loadOrigin();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    if (saved) setOrigin(saved);
  }, []);

  const results = useMemo(
    () => filterFacilities(facilities, { query, category, maxKm, origin, features }),
    [facilities, query, category, maxKm, origin, features],
  );
  const selected = results.find((facility) => facility.id === selectedId) ?? null;
  const categories = facilityCategories.filter((value) => facilities.some((facility) => facility.category === value));

  function chooseOrigin(next: Origin | null) {
    setOrigin(next);
    saveOrigin(next);
    if (!next) setMaxKm(null);
  }

  async function locate() {
    setLocation({ kind: "getting" });
    let position;
    try {
      position = await getCurrentPosition();
    } catch (error) {
      setLocation({ kind: "problem", problem: locationProblem(error) });
      return;
    }
    const point = { latitude: position.latitude, longitude: position.longitude };
    chooseOrigin({ ...point, label: t.map.originHere });
    setLocation({ kind: "found" });
    const answer = await reverseGeocode(point, locale);
    if (answer.ok && answer.value.address) {
      chooseOrigin({ ...point, label: answer.value.address });
      setLocation({ kind: "address", address: answer.value.address });
    } else {
      setLocation(answer.ok || answer.error !== "offline" ? { kind: "noAddress" } : { kind: "problem", problem: "network" });
    }
  }

  function toggleFeature(feature: AccessibilityFeature, on: boolean) {
    setFeatures((current) => (on ? [...current, feature] : current.filter((item) => item !== feature)));
  }

  const locationText =
    location.kind === "getting"
      ? t.map.loc.getting
      : location.kind === "found"
        ? t.map.loc.found
        : location.kind === "address"
          ? t.map.loc.address(location.address)
          : location.kind === "noAddress"
            ? t.map.loc.noAddress
            : location.kind === "problem"
              ? t.map.loc[location.problem]
              : "";

  return (
    <div className="flex flex-col gap-3">
      <PlaceSearch
        facilities={facilities}
        value={query}
        onChange={setQuery}
        near={origin}
        onPickFacility={(id) => {
          const facility = facilities.find((item) => item.id === id);
          if (facility) setQuery(facilityName(facility, locale));
          setSelectedId(id);
        }}
        onPickPlace={(place) => {
          // An address is a starting point, not a filter: show what is near it.
          setQuery("");
          chooseOrigin({ latitude: place.latitude, longitude: place.longitude, label: place.label });
          setLocation({ kind: "idle" });
        }}
      />

      <button type="button" className="btn btn-primary" onClick={locate} disabled={location.kind === "getting"}>
        <LocateFixed aria-hidden size={24} /> {t.map.useMyLocation}
      </button>
      <p className="secondary-text text-[0.9rem] text-muted">{t.map.locationWhy}</p>
      <div role="status" aria-live="polite">
        {locationText && (
          <p className={`notice ${location.kind === "problem" || location.kind === "noAddress" ? "notice-warn" : "notice-info"}`}>{locationText}</p>
        )}
      </div>

      {origin && (
        <div className="card flex flex-col gap-2">
          <p className="font-bold break-words">{t.map.origin(origin.label)}</p>
          <button type="button" className="btn btn-secondary" onClick={() => chooseOrigin(null)}>
            <X aria-hidden size={22} /> {t.map.originClear}
          </button>
        </div>
      )}

      <details className="card">
        <summary className="flex min-h-[48px] cursor-pointer items-center font-bold">{t.map.filters}</summary>
        <div className="mt-2 flex flex-col gap-3">
          <div className="field">
            <label htmlFor="facility-category">{t.map.category}</label>
            <select id="facility-category" value={category} onChange={(event) => setCategory(event.target.value as FacilityCategory | "all")}>
              <option value="all">{t.map.allCategories}</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {t.map.categories[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="facility-distance">{t.map.distance}</label>
            <select
              id="facility-distance"
              value={maxKm ?? ""}
              disabled={!origin}
              aria-describedby={origin ? undefined : "distance-hint"}
              onChange={(event) => setMaxKm(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">{t.map.anyDistance}</option>
              {DISTANCES.map((km) => (
                <option key={km} value={km}>
                  {t.map.upToKm(km)}
                </option>
              ))}
            </select>
            {!origin && (
              <p id="distance-hint" className="field-hint">
                {t.map.distanceNeedsLocation}
              </p>
            )}
          </div>
          <fieldset>
            <legend className="mb-1 font-bold">{t.map.accessibilityFilters}</legend>
            {accessibilityFeatures.map((feature) => (
              <label key={feature} className="flex min-h-[48px] cursor-pointer items-center gap-3 py-1">
                <input
                  type="checkbox"
                  className="size-6 shrink-0 accent-brand"
                  checked={features.includes(feature)}
                  onChange={(event) => toggleFeature(feature, event.target.checked)}
                />
                <span>{t.accessibilityFeatures[feature]}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </details>

      <div role="group" aria-label={t.map.viewLabel} className="grid grid-cols-2 gap-2">
        {(["list", "map"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
            className={`btn ${view === mode ? "btn-primary" : "btn-secondary"}`}
          >
            {mode === "list" ? <List aria-hidden size={22} /> : <MapIcon aria-hidden size={22} />}
            {mode === "list" ? t.map.viewList : t.map.viewMap}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" className="font-bold">
        {t.map.results(results.length)}
      </p>
      {results.length === 0 && <p className="notice">{t.map.empty}</p>}

      {view === "map" && (
        <>
          <FacilityMapLazy
            origin={origin}
            selectedId={selectedId}
            onSelect={setSelectedId}
            points={results.map((facility) => ({
              id: facility.id,
              name: facilityName(facility, locale),
              category: facility.category,
              latitude: facility.latitude,
              longitude: facility.longitude,
            }))}
          />
          {selected ? (
            <section aria-label={t.map.selectedTitle}>
              <FacilityCard facility={selected} selected />
            </section>
          ) : (
            <p className="text-muted">{t.map.mapHint}</p>
          )}
        </>
      )}

      {view === "list" && (
        <ul className="flex flex-col gap-3">
          {results.map((facility) => (
            <li key={facility.id}>
              <FacilityCard facility={facility} selected={facility.id === selectedId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
