"use client";

import Link from "next/link";
import { ChevronRight, PhoneCall } from "lucide-react";
import type { FacilityResult } from "@/lib/facilities/filter";
import { phonesOf, primaryPhone } from "@/lib/facilities/phones";
import { facilityName, wheelchairAccess } from "@/lib/facilities/types";
import { useI18n } from "@/lib/i18n/provider";
import { CategoryPicture } from "./category-picture";

export function FacilityCard({ facility, selected = false }: { facility: FacilityResult; selected?: boolean }) {
  const { t, locale } = useI18n();
  const name = facilityName(facility, locale);
  const wheelchair = wheelchairAccess(facility);
  // Only a number that can really be dialled gets a call button; nothing is invented.
  const phone = primaryPhone(facility);
  const anyPhone = phonesOf(facility)[0];

  return (
    <article className={`card flex flex-col gap-2 ${selected ? "border-brand" : ""}`} aria-current={selected || undefined}>
      <div className="flex gap-3">
        <CategoryPicture facility={facility} size={64} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-[1.05rem] font-extrabold break-words">{name}</h3>
          <p className="text-[0.9rem]">{t.map.categories[facility.category]}</p>
          {facility.is_demo && (
            <p className="mt-1 w-fit rounded-md border-2 border-amber-ink bg-amber-pale px-1.5 text-[0.8rem] font-extrabold text-amber-ink">
              {t.map.demoBadge}
            </p>
          )}
        </div>
      </div>

      {facility.distance !== null && <p className="font-bold">{t.map.straightLine(facility.distance.toFixed(1))}</p>}
      <p className="text-[0.9rem] break-words text-muted">{facility.address ?? t.facility.unavailable}</p>
      <p className="text-[0.9rem]">
        {t.facility.phone}: <span className="font-bold whitespace-nowrap">{(phone ?? anyPhone)?.display ?? t.facility.noPhone}</span>
      </p>
      <p className="text-[0.9rem]">
        {t.map.wheelchair}: <span className="font-bold">{wheelchair === null ? t.map.unknownShort : wheelchair ? `✓ ${t.facility.yes}` : `✕ ${t.facility.no}`}</span>
      </p>
      {!facility.is_demo && facility.verification_status === "unverified" && (
        <p className="text-[0.8rem] text-muted">{t.map.unverifiedBadge}</p>
      )}

      <div className="flex flex-col gap-2 min-[420px]:flex-row">
        <Link
          href={`/map/${facility.id}`}
          data-voice={t.map.cardVoice(name, t.map.categories[facility.category])}
          className="btn btn-primary"
          aria-label={`${t.map.details}: ${name}`}
        >
          {t.map.details} <ChevronRight aria-hidden size={22} />
        </Link>
        {phone && (
          <a href={`tel:${phone.e164}`} className="btn btn-secondary" aria-label={`${t.map.callShort}: ${name}`}>
            <PhoneCall aria-hidden size={22} /> {t.map.callShort}
          </a>
        )}
      </div>
    </article>
  );
}
