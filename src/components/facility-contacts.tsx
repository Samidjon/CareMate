import { Globe, PhoneCall } from "lucide-react";
import { phonesOf } from "@/lib/facilities/phones";
import type { Facility } from "@/lib/facilities/types";
import type { Messages } from "@/lib/i18n/dictionaries";

/** Every number the facility has, each with its kind, source and how far it is verified. */
export function FacilityContacts({ t, facility }: { t: Messages; facility: Facility }) {
  const f = t.facility;
  const phones = phonesOf(facility);
  return (
    <section aria-labelledby="contacts-title" className="card flex flex-col gap-3">
      <h2 id="contacts-title">{f.contactsTitle}</h2>
      {phones.length === 0 && <p className="font-bold">{f.noPhone}</p>}
      <ul className="flex flex-col gap-3">
        {phones.map((phone, index) => (
          <li key={`${phone.display}-${index}`} className="flex flex-col gap-1">
            <p className="font-bold">
              {f.phoneTypes[phone.type]}: <span className="whitespace-nowrap">{phone.display}</span>
            </p>
            <p className="text-[0.85rem] text-muted">{f.contactFrom(phone.source, f.contactVerification[phone.verification])}</p>
            {phone.e164 ? (
              <a href={`tel:${phone.e164}`} className="btn btn-primary">
                <PhoneCall aria-hidden size={22} /> {f.callType[phone.type]}
              </a>
            ) : (
              <p className="notice notice-warn">{f.badPhone}</p>
            )}
          </li>
        ))}
      </ul>
      {facility.website && (
        <a className="btn btn-secondary" href={facility.website} target="_blank" rel="noopener noreferrer">
          <Globe aria-hidden size={22} /> {f.visitWebsite}
        </a>
      )}
    </section>
  );
}
