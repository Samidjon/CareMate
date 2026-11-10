import Link from "next/link";
import { SettingsForm } from "@/components/settings-form";
import { hasSessionCookie } from "@/lib/account/session";
import { SavedPlaces } from "@/components/saved-places";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SettingsPage() {
  const t = await getMessages();
  const signedIn = await hasSessionCookie();
  const locale = await getLocale();
  return (
    <div className="flex flex-col gap-4">
      <h1>{t.settings.title}</h1>
      <SettingsForm />
      <p className="text-[0.9rem] text-muted">{signedIn ? t.settings.savedAccount : t.settings.savedDevice}</p>
      {isSupabaseConfigured() && (
        <section aria-labelledby="account-title" className="card flex flex-col gap-3">
          <h2 id="account-title">{t.settings.accountTitle}</h2>
          {signedIn ? (
            <Link href="/profile" className="btn btn-secondary">
              {t.profile.title}
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-primary">
                {t.auth.loginTitle}
              </Link>
              <Link href="/register" className="btn btn-secondary">
                {t.auth.registerTitle}
              </Link>
            </>
          )}
        </section>
      )}
      {signedIn && isSupabaseConfigured() && <SavedPlaces t={t} locale={locale} />}
      <Link href="/sos/demo" className="btn btn-secondary">
        {t.sos.demoEntry}
      </Link>
    </div>
  );
}
