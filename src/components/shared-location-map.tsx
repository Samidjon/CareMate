"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { FERGANA_CENTER } from "@/lib/geo";

export type PersonPoint = { id: string; name: string; latitude: number; longitude: number; kind: "active" | "stale" | "unavailable" };

// Colour plus a written letter, so the state never depends on colour alone.
const STYLE = { active: { color: "#087e70", letter: "✓" }, stale: { color: "#5d716d", letter: "?" }, unavailable: { color: "#b8610b", letter: "!" } };

function personPin(kind: PersonPoint["kind"], initial: string) {
  const { color, letter } = STYLE[kind];
  return L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:${color};color:#fff;border:3px solid #fff;box-shadow:0 1px 4px #0006;font-weight:800;font-size:18px">${initial}<small style="position:absolute;margin:30px 0 0 30px;background:#fff;color:${color};border-radius:50%;width:18px;height:18px;display:grid;place-items:center;font-size:12px">${letter}</small></span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function Fit({ points }: { points: PersonPoint[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.latitude},${p.longitude}`).join("|");
  useEffect(() => {
    const list = key ? key.split("|").map((pair) => pair.split(",").map(Number) as [number, number]) : [];
    if (list.length > 1) map.fitBounds(list, { padding: [40, 40], maxZoom: 16 });
    else if (list.length === 1) map.setView(list[0], 15);
  }, [key, map]);
  return null;
}

export default function SharedLocationMap({ points, label }: { points: PersonPoint[]; label: string }) {
  return (
    <section aria-label={label}>
      <MapContainer center={[FERGANA_CENTER.latitude, FERGANA_CENTER.longitude]} zoom={13} className="h-[45vh] min-h-[260px] w-full rounded-2xl border-2 border-line">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((point) => (
          <Marker key={point.id} position={[point.latitude, point.longitude]} icon={personPin(point.kind, point.name.charAt(0).toUpperCase())} title={point.name} />
        ))}
        <Fit points={points} />
      </MapContainer>
    </section>
  );
}
