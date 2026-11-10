import Image from "next/image";
import Link from "next/link";
import { UserRound, UserRoundPlus } from "lucide-react";
import { setLocaleAction } from "@/lib/i18n/actions";
import { locales, type Locale } from "@/lib/i18n/config";
import { dictionaries } from "@/lib/i18n/dictionaries";

export function AppHeader({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const t = dictionaries[locale];

  return (
    <header className="bg-surface border-b-2 border-line">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-3 py-2">
        <Link href="/" aria-label={t.common.homeLabel} className="flex min-h-[48px] items-center gap-2 font-extrabold">
          <Image src="/brand/caremate-icon.svg" alt="" width={48} height={48} priority />
          {/* The wordmark gives way first on narrow phones, never the buttons. */}
          <span className="hidden text-[1.2rem] text-[#0b5c56] min-[400px]:inline">CareMate</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Plain forms, so switching works before JavaScript has loaded. */}
          <form action={setLocaleAction} role="group" aria-label={t.header.languageLabel} className="flex overflow-hidden rounded-xl border-2 border-line-strong">
            {locales.map((code) => (
              <button
                key={code}
                type="submit"
                name="locale"
                value={code}
                lang={code}
                aria-pressed={code === locale}
                className={`min-h-[48px] min-w-[48px] px-2 font-extrabold ${
                  code === locale ? "bg-brand text-white" : "bg-surface text-ink hover:bg-brand-pale"
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </form>

          <Link
            href={signedIn ? "/profile" : "/register"}
            className={`flex min-h-[48px] items-center gap-1.5 rounded-xl px-3 font-extrabold ${
              signedIn ? "border-2 border-line-strong bg-surface" : "bg-brand text-white hover:bg-brand-dark"
            }`}
          >
            {signedIn ? <UserRound aria-hidden size={20} /> : <UserRoundPlus aria-hidden size={20} />}
            <span className="text-[0.85rem] leading-tight">{signedIn ? t.header.account : t.header.createAccount}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
