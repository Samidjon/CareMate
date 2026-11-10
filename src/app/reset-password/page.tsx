import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { ResetPasswordForm } from "@/components/auth-forms";
import { getMessages } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUser } from "@/lib/supabase/server";

// Reached through the emailed link, which signs the user in first.
export default async function ResetPasswordPage() {
  const t = await getMessages();
  if (isSupabaseConfigured() && !(await getUser())) redirect("/login?error=link");
  return (
    <AuthPage title={t.auth.resetTitle}>
      <ResetPasswordForm />
    </AuthPage>
  );
}
