"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { FacilityCategory } from "@/lib/facilities/types";
import { FERGANA_CENTER, type Coordinates } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";

export type MapPoint = Coordinates & { id: string; name: string; category: FacilityCategory };

const LETTERS: Record<FacilityCategory, string> = {
  hospital: "H",
  clinic: "K",
  polyclinic: "P",
  pharmacy: "D",
  emergency: "!",
  rehabilitation: "R",
  dental: "S",
  diagnostic: "L",
  specialist: "M",
};

// Leaflet's image markers break under bundlers, and a letter also avoids relying on colour alone.
function pin(letter: string, background: string, size = 34) {
  return L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:50%;background:${background};color:#fff;border:3px solid #fff;box-shadow:0 1px 4px #0006;font-weight:800">${letter}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 + 3],
  });
}

function FocusSelected({ point }: { point: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 15));
  }, [point, map]);
  return null;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    const list = JSON.parse(key) as [number, number][];
    if (list.length > 1) map.fitBounds(list, { padding: [30, 30], maxZoom: 16 });
    else if (list.length === 1) map.setView(list[0], 15);
  }, [key, map]);
  return null;
}

export default function FacilityMap({
  points,
  origin,
  route,
  selectedId = null,
  onSelect,
}: {
  points: MapPoint[];
  origin: Coordinates | null;
  route?: [number, number][] | null;
  selectedId?: string | null;
  /** When given, a marker selects its facility (shown below the map) instead of opening a popup. */
  onSelect?: (id: string) => void;
}) {
  const { t } = useI18n();
  const bounds: [number, number][] = route?.length
    ? route
    : [...points.map((p): [number, number] => [p.latitude, p.longitude]), ...(origin ? [[origin.latitude, origin.longitude] as [number, number]] : [])];

  return (
    <section aria-label={t.map.mapLabel}>
      <MapContainer
        center={[FERGANA_CENTER.latitude, FERGANA_CENTER.longitude]}
        zoom={13}
        className="h-[55vh] min-h-[300px] w-full rounded-2xl border-2 border-line"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((point) => {
          const isSelected = point.id === selectedId;
          return (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude]}
              // The selected place is bigger and darker, and its marker sits on top.
              icon={isSelected ? pin(LETTERS[point.category], "#00443b", 48) : pin(LETTERS[point.category], "#087e70")}
              zIndexOffset={isSelected ? 1000 : 0}
              // Leaflet applies alt only to image icons, so a div icon is named through title.
              title={`${point.name}, ${t.map.categories[point.category]}`}
              eventHandlers={onSelect ? { click: () => onSelect(point.id), keypress: () => onSelect(point.id) } : undefined}
            >
              {!onSelect && (
                <Popup>
                  <strong>{point.name}</strong>
                  <br />
                  {t.map.categories[point.category]}
                  <br />
                  <Link href={`/map/${point.id}`}>{t.map.details}</Link>
                </Popup>
              )}
            </Marker>
          );
        })}
        {origin && (
          <Marker position={[origin.latitude, origin.longitude]} icon={pin("•", "#175fbe")} title={t.map.yourLocation} />
        )}
        {route && <Polyline positions={route} pathOptions={{ color: "#175fbe", weight: 5 }} />}
        <FitBounds points={bounds} />
        <FocusSelected point={points.find((point) => point.id === selectedId) ?? null} />
      </MapContainer>
    </section>
  );
}
