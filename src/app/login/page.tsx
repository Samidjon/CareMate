import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { LoginForm } from "@/components/auth-forms";
import { safeNextPath } from "@/lib/account/validation";
import { getMessages } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const t = await getMessages();
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getUser()) redirect(next);
  return (
    <AuthPage title={t.auth.loginTitle}>
      {params.next && <p className="notice notice-info">{t.auth.loginRequired}</p>}
      {params.error === "link" && <p className="notice notice-error">{t.errors.linkExpired}</p>}
      <LoginForm next={next} />
    </AuthPage>
  );
}
