import { acknowledgeEmergencyAction } from "@/lib/caregiver/actions";
import type { EmergencyRow } from "@/lib/caregiver/queries";
import { openStreetMapUrl } from "@/lib/geo";
import type { Messages } from "@/lib/i18n/dictionaries";

export function EmergencyAlertCard({
  t,
  event,
  name,
  time,
  acknowledged,
}: {
  t: Messages;
  event: EmergencyRow;
  name: string;
  time: string;
  acknowledged: boolean;
}) {
  const a = t.caregiver.alerts;
  const isActive = event.status === "active";
  return (
    <li className={`card flex flex-col gap-2 ${isActive ? "border-sos" : ""}`}>
      <p className="text-[1.1rem] font-extrabold break-words">{a.who(name)}</p>
      <p className="font-bold">{isActive ? a.active : event.status === "cancelled" ? a.cancelled : a.resolved}</p>
      <p>{a.at(time)}</p>
      {event.manual_address && <p className="break-words">{a.address(event.manual_address)}</p>}
      {event.latitude !== null && event.longitude !== null ? (
        <a
          className="btn btn-secondary"
          href={openStreetMapUrl({ latitude: event.latitude, longitude: event.longitude })}
          target="_blank"
          rel="noopener noreferrer"
        >
          {a.location}
        </a>
      ) : (
        !event.manual_address && <p>{a.noLocation}</p>
      )}
      {isActive && <p className="text-[0.9rem]">{a.callNote}</p>}
      {acknowledged ? (
        <p className="font-bold">{a.acknowledged}</p>
      ) : (
        isActive && (
          <form action={acknowledgeEmergencyAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <button type="submit" className="btn btn-primary">
              {a.acknowledge}
            </button>
          </form>
        )
      )}
    </li>
  );
}
