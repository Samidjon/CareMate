import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { RegisterForm } from "@/components/auth-forms";
import { safeNextPath } from "@/lib/account/validation";
import { getMessages } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/server";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const t = await getMessages();
  const { next } = await searchParams;
  const target = next ? safeNextPath(next) : undefined;
  if (await getUser()) redirect(target ?? "/profile");
  return (
    <AuthPage title={t.auth.registerTitle}>
      <RegisterForm next={target} defaultRole={target?.startsWith("/caregiver") ? "caregiver" : "patient"} />
    </AuthPage>
  );
}
