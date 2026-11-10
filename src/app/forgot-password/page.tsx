import { AuthPage } from "@/components/auth-page";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { getMessages } from "@/lib/i18n/server";

export default async function ForgotPasswordPage() {
  const t = await getMessages();
  return (
    <AuthPage title={t.auth.forgotTitle}>
      <ForgotPasswordForm />
    </AuthPage>
  );
}
