import "server-only";
import { emergencyNumber } from "@/lib/config";
import { answerCircle, answerFamily, answerMedicines, answerPlaces, answerSharing, answerWords } from "./answers";
import { loadCareCircle, loadMedicines, loadMySharing, loadSharedLocations, searchFacilities, type ToolContext } from "./data";
import { assistantPages, type AssistantAction, type AssistantLocale, type AssistantReply, type AssistantPage, type QuickQuestion } from "./types";

const open = (page: AssistantPage): AssistantAction => ({ kind: "open", page, path: assistantPages[page] });

/** The same answer every time for an emergency: call, or press SOS. No advice. */
export function emergencyReply(locale: AssistantLocale): AssistantReply {
  const text =
    locale === "ru"
      ? `Если жизнь в опасности, немедленно звоните ${emergencyNumber} или нажмите SOS. Я не могу вызвать помощь сам и не даю медицинских советов в экстренной ситуации.`
      : `Hayot xavf ostida bo‘lsa, darhol ${emergencyNumber} ga qo‘ng‘iroq qiling yoki SOS tugmasini bosing. Men o‘zim yordam chaqira olmayman va shoshilinch holatda tibbiy maslahat bermayman.`;
  return {
    text,
    source: "safety",
    actions: [{ kind: "call", number: emergencyNumber, label: emergencyNumber }, open("sos")],
  };
}

/** Changing a dose or stopping a medicine is a doctor's decision. */
export function treatmentReply(locale: AssistantLocale): AssistantReply {
  const text =
    locale === "ru"
      ? "Менять дозу, пропускать или прекращать лекарство можно только по решению врача. Я могу показать ваше расписание или найти ближайшую поликлинику."
      : "Dozani o‘zgartirish, dorini o‘tkazib yuborish yoki to‘xtatish faqat shifokor qarori bilan bo‘ladi. Men jadvalingizni ko‘rsatishim yoki eng yaqin poliklinikani topishim mumkin.";
  return { text, source: "safety", actions: [open("medicines"), open("map")] };
}

/** Answers a quick question straight from the database, with no language model. */
export async function answerQuick(ctx: ToolContext, question: QuickQuestion): Promise<AssistantReply> {
  const { locale } = ctx;
  const words = answerWords(locale);
  const reply = (text: string, actions: AssistantAction[]): AssistantReply => ({ text, actions, source: "quick" });
  switch (question) {
    case "next_medicine":
    case "today_medicines":
      return reply(answerMedicines(locale, await loadMedicines(ctx, ctx.userId), question === "next_medicine" ? "next" : "today"), [open("medicines")]);
    case "my_helpers":
      return reply(answerCircle(locale, await loadCareCircle(ctx)), [open("circle")]);
    case "family_locations":
      return reply(answerFamily(locale, await loadSharedLocations(ctx)), [open("family_locations")]);
    case "my_sharing":
      return reply(answerSharing(locale, await loadMySharing(ctx)), [open("my_location_sharing")]);
    case "nearest_pharmacy":
    case "nearest_accessible": {
      const pharmacy = question === "nearest_pharmacy";
      const search = { query: "", category: pharmacy ? ("pharmacy" as const) : ("all" as const), nearMe: true, limit: 3 };
      let result = await searchFacilities(ctx, { ...search, wheelchairOnly: !pharmacy });
      let confirmed = true;
      // No confirmed place nearby: say so plainly, then list the nearest places anyway.
      if (!pharmacy && result.status === "ok" && result.facilities.length === 0) {
        confirmed = false;
        result = await searchFacilities(ctx, { ...search, category: "hospital", wheelchairOnly: false });
      }
      const actions: AssistantAction[] =
        result.status === "ok"
          ? result.facilities.map((place) => ({ kind: "open_facility" as const, facilityId: place.id, label: place.name }))
          : [open("map")];
      return reply(answerPlaces(locale, result, pharmacy ? "pharmacy" : "accessible", confirmed), actions);
    }
    case "how_sos":
      return reply(words.sos, [open("sos")]);
    case "invite_helper":
      return reply(words.invite, [open("invite_helper")]);
  }
}
