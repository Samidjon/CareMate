"use client";

import { useI18n } from "@/lib/i18n/provider";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <h1>{t.errorPage.title}</h1>
      <p>{t.errors.generic}</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        {t.errorPage.retry}
      </button>
    </div>
  );
}
