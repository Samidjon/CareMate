import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Messages } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { createClient, getUser } from "@/lib/supabase/server";

/** The places this person saved, with a link to each. Shown only to its owner. */
export async function SavedPlaces({ t, locale }: { t: Messages; locale: Locale }) {
  const supabase = await createClient();
  const user = supabase ? await getUser() : null;
  if (!supabase || !user) return null;

  const { data: saved, error } = await supabase.from("user_saved_facilities").select("facility_id").eq("user_id", user.id);
  // Before the newest migration the table does not exist: show nothing rather than an error.
  if (error) return null;
  const ids = (saved ?? []).map((row) => row.facility_id);
  const { data: facilities } = ids.length ? await supabase.from("medical_facilities").select("id, name_uz, name_ru").in("id", ids) : { data: [] };

  return (
    <section aria-labelledby="saved-title" className="card flex flex-col gap-3">
      <h2 id="saved-title">{t.profile.savedPlaces}</h2>
      {(facilities ?? []).length === 0 && <p>{t.profile.savedPlacesEmpty}</p>}
      <ul className="flex flex-col gap-2">
        {(facilities ?? []).map((facility) => (
          <li key={facility.id}>
            <Link href={`/map/${facility.id}`} className="flex min-h-[56px] items-center justify-between gap-2 rounded-xl border-2 border-line px-3 font-bold hover:bg-brand-pale">
              <span className="break-words">{(locale === "ru" && facility.name_ru) || facility.name_uz}</span>
              <ChevronRight aria-hidden size={22} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
