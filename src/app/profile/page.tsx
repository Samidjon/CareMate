import { redirect } from "next/navigation";
import { DeleteAccountForm, ProfileForm, type ProfileData } from "@/components/profile-forms";
import { AuthPage } from "@/components/auth-page";
import { logoutAction } from "@/lib/account/actions";
import { getMessages } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getUser } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const t = await getMessages();
  if (!isSupabaseConfigured()) {
    return (
      <AuthPage title={t.profile.title}>
        <></>
      </AuthPage>
    );
  }

  const user = await getUser();
  if (!user) redirect("/login?next=/profile");

  const supabase = await createClient();
  const profileQuery = (columns: string) => supabase!.from("profiles").select(columns).eq("id", user.id).single();
  const [profileResult, { data: health }] = await Promise.all([
    profileQuery("role, first_name, last_name, birth_date, phone, locale, city, district, address"),
    supabase!.from("patient_health_info").select("blood_type, allergies, conditions").eq("patient_id", user.id).maybeSingle(),
  ]);
  // Before the newest migration there is no address column; show the rest.
  const { data: profileData } = profileResult.error?.code === "42703"
    ? await profileQuery("role, first_name, last_name, birth_date, phone, locale, city, district")
    : profileResult;
  const profile = profileData as unknown as ({ role: string } & ProfileData) | null;

  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <h1>{t.profile.title}</h1>
        <p className="notice notice-error">{t.errors.generic}</p>
      </div>
    );
  }

  const roleNames = { patient: t.profile.rolePatient, caregiver: t.profile.roleCaregiver, admin: t.profile.roleAdmin };

  return (
    <div className="flex flex-col gap-4">
      <h1>{t.profile.title}</h1>
      <p>
        <span className="font-bold">{t.profile.roleLabel}:</span>{" "}
        {roleNames[profile.role as keyof typeof roleNames] ?? profile.role}
      </p>
      <ProfileForm profile={profile} health={health} />
      <form action={logoutAction}>
        <button type="submit" className="btn btn-secondary">
          {t.auth.logoutButton}
        </button>
      </form>
      <DeleteAccountForm />
    </div>
  );
}
