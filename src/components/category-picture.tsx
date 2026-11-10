import { Building2, Cross, FlaskConical, HeartPulse, Pill, Siren, Smile, Stethoscope, Accessibility } from "lucide-react";
import type { Facility, FacilityCategory } from "@/lib/facilities/types";

const ICONS: Record<FacilityCategory, typeof Building2> = {
  hospital: Cross,
  clinic: Stethoscope,
  polyclinic: Building2,
  pharmacy: Pill,
  emergency: Siren,
  rehabilitation: Accessibility,
  dental: Smile,
  diagnostic: FlaskConical,
  specialist: HeartPulse,
};

/**
 * A real, credited photograph when one exists; otherwise a plain category icon.
 * Never a stock or generated picture presented as the building.
 */
export function CategoryPicture({
  facility,
  size,
  alt = "",
}: {
  facility: Pick<Facility, "category" | "photo_url">;
  size: number;
  alt?: string;
}) {
  if (facility.photo_url) {
    return (
      // A remote, licensed Commons thumbnail: shown as is, loaded only when needed.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={facility.photo_url}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const Icon = ICONS[facility.category];
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-xl bg-brand-pale text-brand-dark" style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
