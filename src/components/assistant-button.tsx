"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

const HIDDEN_ON = ["/assistant", "/sos", "/login", "/register", "/forgot-password", "/reset-password", "/auth"];

/** A way into the assistant from every screen, placed above the SOS button so neither hides the other. */
export function AssistantButton() {
  const { t } = useI18n();
  const pathname = usePathname();
  if (HIDDEN_ON.some((prefix) => pathname.startsWith(prefix))) return null;
  return (
    <Link
      href="/assistant"
      aria-label={t.assistant.open}
      data-voice={t.assistant.open}
      className="fixed right-4 bottom-[152px] z-40 grid size-14 place-items-center rounded-full border-4 border-white bg-brand text-white shadow-lg hover:bg-brand-dark"
    >
      <MessageCircleQuestion aria-hidden size={28} />
    </Link>
  );
}
