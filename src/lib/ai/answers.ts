import type { AssistantLocale } from "./types";

// Fixed Uzbek and Russian wording for answers built straight from the database.
// Pure functions: the same data always gives the same sentence, and tests can check it.

type Dose = { medicine: string; time: string; state: string; day: "today" | "tomorrow" };
export type MedicinesData = { status: "ok"; today: Dose[]; next: Dose | null; missedToday: number; activeMedicines: string[] } | { status: string };
export type CircleData =
  | { status: "ok"; myHelpers: { name: string }[]; peopleIHelp: { name: string }[] }
  | { status: string };
export type FamilyData =
  | { status: "ok"; people: { name: string; sharing: string; lastUpdated?: string; minutesAgo?: number }[] }
  | { status: string };
export type SharingData = { status: "ok"; shares: { helper: string; status: "active" | "paused" }[] } | { status: string };
export type PlacesData =
  | { status: "ok"; facilities: { name: string; distanceKm: number | null; wheelchairAccess: string; address: string | null }[] }
  | { status: string };

const words = {
  uz: {
    failed: "Ma’lumotni hozir o‘qib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.",
    noMedicines: "Sizda hali saqlangan dori jadvali yo‘q. Uni «Sog‘ligim» bo‘limida qo‘shishingiz mumkin.",
    next: (d: Dose) => `Keyingi dori: ${d.medicine}, ${d.day === "today" ? "bugun" : "ertaga"} soat ${d.time} da.`,
    noNext: "Bugun va ertaga uchun rejalashtirilgan dori yo‘q.",
    missed: (n: number) => `Diqqat: bugun ${n} ta doza o‘tkazib yuborilgan.`,
    todayNone: "Bugun ichiladigan dori yo‘q.",
    todayList: (list: string) => `Bugungi dorilar: ${list}.`,
    states: { upcoming: "kutilmoqda", due: "ichish vaqti", snoozed: "keyinroqqa qoldirilgan", taken: "ichildi", skipped: "o‘tkazildi", missed: "o‘tkazib yuborilgan" } as Record<string, string>,
    helpersNone: "Sizda hali yordamchi yo‘q. Yaqin odamingizni «Yordamchim» bo‘limidan taklif qilishingiz mumkin.",
    helpers: (list: string) => `Sizning yordamchilaringiz: ${list}.`,
    iHelp: (list: string) => `Siz yordam beradigan odamlar: ${list}.`,
    familyNone: "Hozircha hech kim siz bilan joylashuvini ulashmayapti.",
    family: {
      active: (name: string, time: string, minutes: number) => `${name}: oxirgi joylashuv soat ${time} da (${minutes} daqiqa oldin).`,
      stale: (name: string, time: string, minutes: number) => `${name}: oxirgi joylashuv soat ${time} da, ${minutes} daqiqa oldin — eskirgan bo‘lishi mumkin.`,
      unavailable: (name: string, time: string) => `${name}: qurilma hozir joylashuvni aniqlay olmayapti. Oxirgi ma’lum joy soat ${time} da.`,
      waiting: (name: string) => `${name}: ulashish yoqilgan, lekin hali joylashuv kelmadi.`,
      paused: (name: string) => `${name}: joylashuvni ulashish to‘xtatib turilgan.`,
    },
    familyNote: "Bu jonli kuzatuv emas, faqat oxirgi ma’lum joylashuv.",
    sharingNone: "Siz hozir joylashuvingizni hech kim bilan ulashmayapsiz.",
    sharingActive: (list: string) => `Joylashuvingizni ko‘ra oladi: ${list}.`,
    sharingPaused: (list: string) => `To‘xtatib turilgan: ${list}.`,
    sharingNotReady: "Joylashuvni ulashish hali sozlanmagan.",
    needsLocation: "Eng yaqin joyni topish uchun joylashuvingiz kerak. Ruxsat bering yoki xaritada manzil kiriting.",
    placesNone: "Mos joy topilmadi. Xaritada qidiruvni kengaytirib ko‘ring.",
    placesAccessible: "Nogironlar aravachasi uchun qulayligi tasdiqlangan eng yaqin joylar:",
    placesAccessibleNone: "Yaqin atrofda aravacha uchun qulayligi tasdiqlangan joy topilmadi. Mana eng yaqin joylar — qulaylik ma’lumoti hali tekshirilmagan:",
    placesPharmacy: "Eng yaqin dorixonalar:",
    km: (km: number) => `${km} km`,
    wheel: { yes: "aravacha uchun qulay", no: "aravacha uchun noqulay", unknown: "qulaylik noma’lum" } as Record<string, string>,
    sos: "SOS tugmasini bossangiz, CareMate yordamchilaringizga xabar yuboradi va joylashuvingizni (ruxsat bergan bo‘lsangiz) qo‘shadi. Hayot xavf ostida bo‘lsa, darhol 103 ga qo‘ng‘iroq qiling.",
    invite: "Yordamchini taklif qilish uchun «Yordamchim» bo‘limini oching, nimani ko‘rishi mumkinligini belgilang va «Taklif kodini yaratish» tugmasini bosing. Kodni yaqiningizga yuborasiz. Hech narsa siz tasdiqlamaguningizcha yaratilmaydi.",
  },
  ru: {
    failed: "Не удалось прочитать данные. Попробуйте чуть позже.",
    noMedicines: "У вас пока нет сохранённого расписания лекарств. Его можно добавить в разделе «Здоровье».",
    next: (d: Dose) => `Следующее лекарство: ${d.medicine}, ${d.day === "today" ? "сегодня" : "завтра"} в ${d.time}.`,
    noNext: "На сегодня и завтра лекарств не запланировано.",
    missed: (n: number) => `Внимание: сегодня пропущено доз: ${n}.`,
    todayNone: "Сегодня лекарств не запланировано.",
    todayList: (list: string) => `Лекарства на сегодня: ${list}.`,
    states: { upcoming: "ожидается", due: "пора принять", snoozed: "отложено", taken: "принято", skipped: "пропущено вами", missed: "пропущено" } as Record<string, string>,
    helpersNone: "У вас пока нет помощников. Пригласить близкого можно в разделе «Помощник».",
    helpers: (list: string) => `Ваши помощники: ${list}.`,
    iHelp: (list: string) => `Вы помогаете: ${list}.`,
    familyNone: "Пока никто не делится с вами местоположением.",
    family: {
      active: (name: string, time: string, minutes: number) => `${name}: последнее местоположение в ${time} (${minutes} мин назад).`,
      stale: (name: string, time: string, minutes: number) => `${name}: последнее местоположение в ${time}, ${minutes} мин назад — может быть устаревшим.`,
      unavailable: (name: string, time: string) => `${name}: телефон сейчас не может определить место. Последнее известное — в ${time}.`,
      waiting: (name: string) => `${name}: доступ включён, но местоположение ещё не пришло.`,
      paused: (name: string) => `${name}: показ местоположения приостановлен.`,
    },
    familyNote: "Это не слежение в реальном времени, а последнее известное местоположение.",
    sharingNone: "Сейчас вы ни с кем не делитесь местоположением.",
    sharingActive: (list: string) => `Ваше местоположение видят: ${list}.`,
    sharingPaused: (list: string) => `Приостановлено для: ${list}.`,
    sharingNotReady: "Обмен местоположением ещё не настроен.",
    needsLocation: "Чтобы найти ближайшее место, нужно ваше местоположение. Разрешите доступ или укажите адрес на карте.",
    placesNone: "Подходящих мест не найдено. Попробуйте расширить поиск на карте.",
    placesAccessible: "Ближайшие места с подтверждённым доступом для коляски:",
    placesAccessibleNone: "Рядом нет мест с подтверждённым доступом для коляски. Вот ближайшие — доступность пока не проверена:",
    placesPharmacy: "Ближайшие аптеки:",
    km: (km: number) => `${km} км`,
    wheel: { yes: "доступно для коляски", no: "недоступно для коляски", unknown: "доступность неизвестна" } as Record<string, string>,
    sos: "Кнопка SOS отправляет сообщение вашим помощникам и добавляет ваше местоположение, если вы разрешили. Если жизнь в опасности, сразу звоните 103.",
    invite: "Чтобы пригласить помощника, откройте раздел «Помощник», отметьте, что ему можно видеть, и нажмите «Создать код приглашения». Код вы отправите близкому. Ничего не создаётся без вашего подтверждения.",
  },
};

export type AnswerWords = (typeof words)["uz"];
export const answerWords = (locale: AssistantLocale): AnswerWords => words[locale];

const join = (items: string[]) => items.join(", ");

export function answerMedicines(locale: AssistantLocale, data: MedicinesData, mode: "next" | "today"): string {
  const w = words[locale];
  if (data.status !== "ok" || !("today" in data)) return w.failed;
  if (data.activeMedicines.length === 0) return w.noMedicines;
  const lines: string[] = [];
  if (mode === "next") lines.push(data.next ? w.next(data.next) : w.noNext);
  else lines.push(data.today.length ? w.todayList(join(data.today.map((dose) => `${dose.time} ${dose.medicine} (${w.states[dose.state] ?? dose.state})`))) : w.todayNone);
  if (data.missedToday > 0) lines.push(w.missed(data.missedToday));
  return lines.join(" ");
}

export function answerCircle(locale: AssistantLocale, data: CircleData): string {
  const w = words[locale];
  if (data.status !== "ok" || !("myHelpers" in data)) return w.failed;
  const lines = [data.myHelpers.length ? w.helpers(join(data.myHelpers.map((person) => person.name))) : w.helpersNone];
  if (data.peopleIHelp.length) lines.push(w.iHelp(join(data.peopleIHelp.map((person) => person.name))));
  return lines.join(" ");
}

export function answerFamily(locale: AssistantLocale, data: FamilyData): string {
  const w = words[locale];
  if (data.status !== "ok" || !("people" in data)) return w.failed;
  if (data.people.length === 0) return w.familyNone;
  const lines = data.people.map((person) => {
    const time = person.lastUpdated ?? "";
    const minutes = person.minutesAgo ?? 0;
    switch (person.sharing) {
      case "active":
        return w.family.active(person.name, time, minutes);
      case "stale":
        return w.family.stale(person.name, time, minutes);
      case "unavailable":
        return w.family.unavailable(person.name, time);
      case "waiting":
        return w.family.waiting(person.name);
      default:
        return w.family.paused(person.name);
    }
  });
  return [...lines, w.familyNote].join("\n");
}

export function answerSharing(locale: AssistantLocale, data: SharingData): string {
  const w = words[locale];
  if (data.status === "not_set_up") return w.sharingNotReady;
  if (data.status !== "ok" || !("shares" in data)) return w.failed;
  const active = data.shares.filter((share) => share.status === "active").map((share) => share.helper);
  const paused = data.shares.filter((share) => share.status === "paused").map((share) => share.helper);
  if (!active.length && !paused.length) return w.sharingNone;
  return [active.length ? w.sharingActive(join(active)) : w.sharingNone, paused.length ? w.sharingPaused(join(paused)) : ""].filter(Boolean).join(" ");
}

export function answerPlaces(locale: AssistantLocale, data: PlacesData, kind: "accessible" | "pharmacy", foundConfirmed: boolean): string {
  const w = words[locale];
  if (data.status === "needs_location") return w.needsLocation;
  if (data.status !== "ok" || !("facilities" in data)) return w.failed;
  if (data.facilities.length === 0) return w.placesNone;
  const heading = kind === "pharmacy" ? w.placesPharmacy : foundConfirmed ? w.placesAccessible : w.placesAccessibleNone;
  const lines = data.facilities.map(
    (place, index) =>
      `${index + 1}. ${place.name}${place.distanceKm !== null ? ` — ${w.km(place.distanceKm)}` : ""}, ${w.wheel[place.wheelchairAccess] ?? w.wheel.unknown}${place.address ? `. ${place.address}` : ""}`,
  );
  return [heading, ...lines].join("\n");
}
