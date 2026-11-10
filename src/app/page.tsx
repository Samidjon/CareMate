import Link from "next/link";
import { ChevronRight, MapPin, Pill, Siren, UsersRound } from "lucide-react";
import { VoiceAssistToggle } from "@/components/voice-assist-toggle";
import { VoiceHint } from "@/components/voice-hint";
import { getMessages } from "@/lib/i18n/server";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const t = await getMessages();
  const { deleted } = await searchParams;
  const actions = [
    { href: "/map", title: t.home.map, description: t.home.mapDesc, Icon: MapPin },
    { href: "/routine", title: t.home.medicines, description: t.home.medicinesDesc, Icon: Pill },
    { href: "/circle", title: t.home.circle, description: t.home.circleDesc, Icon: UsersRound },
  ];

  return (
    <div className="flex flex-col gap-4">
      {deleted && (
        <p role="status" className="notice notice-info">
          {t.profile.deleted}
        </p>
      )}
      <div>
        <h1>{t.home.greeting}</h1>
        <p className="text-muted">{t.home.question}</p>
      </div>

      <nav aria-label={t.home.actionsLabel} className="flex flex-col gap-3">
        {/* A plain link: SOS must work before JavaScript has loaded. */}
        <Link href="/sos" className="btn btn-sos min-h-[88px] text-[1.3rem]">
          <Siren aria-hidden size={34} />
          {t.home.sos}
        </Link>
        {actions.map(({ href, title, description, Icon }) => (
          <Link key={href} href={href} className="card flex min-h-[88px] items-center gap-3 hover:bg-brand-pale">
            <span className="grid size-13 shrink-0 place-items-center rounded-xl bg-brand-pale text-brand-dark">
              <Icon aria-hidden size={30} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-extrabold">{title}</span>
              <span className="secondary-text text-[0.9rem] text-muted">{description}</span>
            </span>
            <ChevronRight aria-hidden size={26} className="shrink-0 text-brand-dark" />
          </Link>
        ))}
      </nav>

      <VoiceAssistToggle />
      <VoiceHint text={t.home.voiceText} />
    </div>
  );
}
