"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { persistLocaleCookie } from "@/lib/i18n/actions";
import { LOCATION_COOKIE } from "@/lib/location/cookie";
import { isLocale } from "@/lib/i18n/config";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";
import { isWithinRateLimit } from "@/lib/security/rate-limit";
import { parseSettings, SETTINGS_COOKIE, type Settings } from "@/lib/settings/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/app-url";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  forgotSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetSchema,
  safeNextPath,
  toFormError,
  type ErrorKey,
  type FormState,
} from "./validation";

const fail = (error: ErrorKey): FormState => ({ status: "error", error });

const value = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Brings the settings saved in the account onto this device after signing in. */
async function applyAccountPreferences() {
  const supabase = await createClient();
  const user = await getUser();
  if (!supabase || !user) return;
  const { data } = await supabase.from("profiles").select("locale, accessibility").eq("id", user.id).maybeSingle();
  if (!data) return;
  if (isLocale(data.locale)) await persistLocaleCookie(data.locale);
  if (data.accessibility && Object.keys(data.accessibility).length > 0) {
    (await cookies()).set(SETTINGS_COOKIE, encodeURIComponent(JSON.stringify(parseSettings(data.accessibility))), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
}

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: value(formData, "email"), password: value(formData, "password") });
  if (!parsed.success) return toFormError(parsed.error);
  const supabase = await createClient();
  if (!supabase) return fail("notConfigured");
  if (!(await isWithinRateLimit("login", parsed.data.email, 10, 600))) return fail("rateLimited");

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.status === 429) return fail("rateLimited");
    return fail(error.status === 400 ? "invalidCredentials" : "generic");
  }
  await applyAccountPreferences();
  redirect(safeNextPath(formData.get("next")));
}

export async function registerAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    email: value(formData, "email"),
    password: value(formData, "password"),
    firstName: value(formData, "firstName"),
    lastName: value(formData, "lastName"),
    role: value(formData, "role"),
    consent: value(formData, "consent"),
  });
  if (!parsed.success) return toFormError(parsed.error);
  const supabase = await createClient();
  if (!supabase) return fail("notConfigured");
  // Per address, and generous: a whole family or clinic can share one network.
  if (!(await isWithinRateLimit("register", "any", 20, 3600))) return fail("rateLimited");

  const { email, password, firstName, lastName, role } = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await appUrl()}/auth/callback`,
      data: {
        role,
        first_name: firstName,
        last_name: lastName,
        locale: await getLocale(),
        consent: "true",
      },
    },
  });
  if (error) {
    if (error.status === 429) return fail("rateLimited");
    if (error.code === "weak_password") return fail("weakPassword");
    if (error.code === "user_already_exists" || error.code === "email_exists") return fail("emailTaken");
    return fail("generic");
  }
  // With email confirmation on, there is no session until the link is opened.
  if (!data.session) return { status: "success" };
  const next = formData.get("next");
  redirect(next ? safeNextPath(next) : role === "caregiver" ? "/caregiver" : "/profile");
}

export async function forgotPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: value(formData, "email") });
  if (!parsed.success) return toFormError(parsed.error);
  const supabase = await createClient();
  if (!supabase) return fail("notConfigured");
  if (!(await isWithinRateLimit("forgot", parsed.data.email, 5, 3600))) return fail("rateLimited");

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await appUrl()}/auth/callback?next=/reset-password`,
  });
  if (error?.status === 429) return fail("rateLimited");
  // The same answer whether or not the address is registered, so accounts cannot be discovered.
  return { status: "success" };
}

export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({ password: value(formData, "password") });
  if (!parsed.success) return toFormError(parsed.error);
  const supabase = await createClient();
  if (!supabase) return fail("notConfigured");
  const user = await getUser();
  if (!user) return fail("linkExpired");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.code === "weak_password" || error.code === "same_password" ? "weakPassword" : "generic");
  redirect("/profile");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  // This device stops sending a location once nobody is signed in on it.
  (await cookies()).delete(LOCATION_COOKIE);
  redirect("/");
}

export async function updateProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse({
    firstName: value(formData, "firstName"),
    lastName: value(formData, "lastName"),
    birthDate: value(formData, "birthDate"),
    phone: value(formData, "phone"),
    locale: value(formData, "locale"),
    city: value(formData, "city"),
    district: value(formData, "district"),
    address: value(formData, "address"),
    bloodType: value(formData, "bloodType"),
    allergies: value(formData, "allergies"),
    conditions: value(formData, "conditions"),
  });
  if (!parsed.success) return toFormError(parsed.error);
  const supabase = await createClient();
  const user = await getUser();
  if (!supabase || !user) return fail("noAccess");

  const data = parsed.data;
  const changes = {
    first_name: data.firstName,
    last_name: data.lastName,
    birth_date: data.birthDate,
    phone: data.phone,
    locale: data.locale,
    city: data.city,
    district: data.district,
    address: data.address,
  };
  let { error } = await supabase.from("profiles").update(changes).eq("id", user.id);
  // 42703: the address column comes with a newer migration; save the rest without it.
  if (error?.code === "42703") {
    const { address: _address, ...withoutAddress } = changes;
    void _address;
    ({ error } = await supabase.from("profiles").update(withoutAddress).eq("id", user.id));
  }
  if (error) {
    console.error("Profile update failed:", error.code);
    return fail("saveFailed");
  }

  const health = await supabase.from("patient_health_info").upsert({
    patient_id: user.id,
    blood_type: data.bloodType,
    allergies: data.allergies,
    conditions: data.conditions,
  });
  if (health.error) {
    console.error("Health info update failed:", health.error.code);
    return fail("saveFailed");
  }

  await persistLocaleCookie(data.locale);
  revalidatePath("/profile");
  return { status: "success" };
}

/** Keeps accessibility settings with the account, so they follow the user to a new phone. */
export async function saveSettingsToAccount(settings: Settings) {
  const supabase = await createClient();
  const user = await getUser();
  if (!supabase || !user) return;
  const { error } = await supabase
    .from("profiles")
    .update({ accessibility: parseSettings(settings) })
    .eq("id", user.id);
  if (error) console.error("Settings sync failed:", error.code);
}

export async function deleteAccountAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = dictionaries[await getLocale()];
  if (value(formData, "confirm").trim().toUpperCase() !== t.profile.deleteWord) {
    return { status: "error", fieldErrors: { confirm: "deleteConfirm" } };
  }
  const supabase = await createClient();
  // The account comes from the verified session, never from the form.
  const user = await getUser();
  if (!supabase || !user) return fail("noAccess");
  if (!(await isWithinRateLimit("delete-account", user.id, 5, 3600))) return fail("rateLimited");
  const admin = createAdminClient();
  if (!admin) return fail("deleteUnavailable");

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Account deletion failed:", error.status);
    return fail("generic");
  }
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(LOCATION_COOKIE);
  redirect("/?deleted=1");
}
