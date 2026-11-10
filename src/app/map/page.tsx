import { FacilityExplorer } from "@/components/facility-explorer";
import { VoiceHint } from "@/components/voice-hint";
import { getFacilities } from "@/lib/facilities/queries";
import { getMessages } from "@/lib/i18n/server";

export default async function MapPage() {
  const t = await getMessages();
  const result = await getFacilities();
  return (
    <div className="flex flex-col gap-4">
      <h1>{t.map.title}</h1>
      {result.status === "not_configured" && <p className="notice notice-warn">{t.map.notConfigured}</p>}
      {result.status === "error" && <p className="notice notice-error">{t.map.loadFailed}</p>}
      {result.status === "ok" && (
        <>
          <p className="secondary-text text-[0.9rem] text-muted">{t.map.dataNote}</p>
          <FacilityExplorer facilities={result.facilities} />
        </>
      )}
      <VoiceHint text={t.map.voiceText} />
      <p className="text-[0.8rem] text-muted">© OpenStreetMap contributors (ODbL)</p>
    </div>
  );
}
