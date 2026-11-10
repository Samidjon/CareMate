"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartPulse, House, MapPin, UserRound, UsersRound } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

const SECTIONS = [
  { key: "home", href: "/", Icon: House, match: ["/"] },
  { key: "map", href: "/map", Icon: MapPin, match: ["/map"] },
  { key: "health", href: "/routine", Icon: HeartPulse, match: ["/routine", "/appointments"] },
  { key: "circle", href: "/circle", Icon: UsersRound, match: ["/circle", "/caregiver", "/location"] },
  { key: "profile", href: "/settings", Icon: UserRound, match: ["/settings", "/profile"] },
] as const;

export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav aria-label={t.nav.label} className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-surface">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {SECTIONS.map(({ key, href, Icon, match }) => {
          const current = match.some((prefix) => (prefix === "/" ? pathname === "/" : pathname.startsWith(prefix)));
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                data-voice={t.nav[key]}
                // Fixed size: five labels must fit a phone width even with extra large text.
                className={`flex min-h-[64px] flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-center text-[13px] leading-tight ${
                  current ? "font-extrabold text-brand-dark underline underline-offset-2" : "font-semibold text-ink"
                }`}
              >
                <Icon aria-hidden size={24} strokeWidth={current ? 2.8 : 2} />
                <span className="max-w-full">{t.nav[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
