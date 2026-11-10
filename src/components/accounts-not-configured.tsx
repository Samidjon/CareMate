import Link from "next/link";
import type { Messages } from "@/lib/i18n/dictionaries";

export function AccountsNotConfigured({ t, title }: { t: Messages; title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1>{title}</h1>
      <p className="notice notice-warn">{t.auth.notConfigured}</p>
      <Link href="/" className="btn btn-secondary">
        {t.common.backHome}
      </Link>
    </div>
  );
}
