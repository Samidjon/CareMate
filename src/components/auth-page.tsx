import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import type { ReactNode } from "react";
import { getMessages } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Shared frame for account pages, with an honest state when accounts are not set up. */
export async function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  const t = await getMessages();
  return (
    <div className="flex flex-col gap-4">
      <BrandLogo alt={t.header.logoAlt} size={96} />
      <h1>{title}</h1>
      {isSupabaseConfigured() ? (
        children
      ) : (
        <>
          <p className="notice notice-warn">{t.auth.notConfigured}</p>
          <Link href="/" className="btn btn-secondary">
            {t.common.backHome}
          </Link>
        </>
      )}
    </div>
  );
}
