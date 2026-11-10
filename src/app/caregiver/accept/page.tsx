import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountsNotConfigured } from "@/components/accounts-not-configured";
import { AcceptInvitationForm } from "@/components/caregiver-forms";
import { requireSession } from "@/lib/account/guard";
import { getMessages } from "@/lib/i18n/server";

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const t = await getMessages();
  const { code } = await searchParams;
  const initialCode = /^[0-9A-Za-z]{1,20}$/.test(code ?? "") ? (code as string) : "";
  const session = await requireSession(initialCode ? `/caregiver/accept?code=${initialCode}` : "/caregiver/accept");
  if (!session) return <AccountsNotConfigured t={t} title={t.caregiver.accept.title} />;
  return (
    <div className="flex flex-col gap-4">
      <h1>{t.caregiver.accept.title}</h1>
      <AcceptInvitationForm initialCode={initialCode} />
      <Link href="/caregiver" className="btn btn-secondary">
        <ArrowLeft aria-hidden size={24} /> {t.common.back}
      </Link>
    </div>
  );
}
