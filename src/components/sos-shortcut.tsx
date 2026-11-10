"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";

/** Keeps SOS one tap away on every screen. The home page has its own large button. */
export function SosShortcut() {
  const { t } = useI18n();
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/sos")) return null;
  return (
    <Link
      href="/sos"
      aria-label={t.header.sos}
      className="fixed right-3 bottom-[76px] z-40 grid size-16 place-items-center rounded-full border-4 border-white bg-sos text-[1.05rem] font-extrabold text-white shadow-lg hover:bg-sos-dark"
    >
      SOS
    </Link>
  );
}
