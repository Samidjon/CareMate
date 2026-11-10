import type { QuickQuestion } from "./types";

// Pure text matching, so it works with no language model at all and can be tested.
// Uzbek apostrophes are typed many ways (o‘, oʻ, o', o`): all are removed first.
export function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/['`‘’ʻʼ"«»]/g, "")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

const has = (text: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

// Words that mean someone may be in danger right now. Checked before anything else,
// with or without a model: the answer is always "call 103 / press SOS", never advice.
const EMERGENCY = [
  /tez ?yordam/,
  /kokra[kg].*ogri|ogri.*kokra[kg]/,
  /yuragim.*(ogri|sanch|siqil)/,
  /nafas ol(a|o)lma/,
  /nafasim (qis|yetma)/,
  /hush(i|im)ni yoqot/,
  /hushsiz/,
  /qon ket/,
  /yiqil(dim|di)/,
  /insult/,
  /(ozimni )?oldirmoqchi|olmoqchiman|yashagim kelmay/,
  /скор(ая|ую)/,
  /бол(ь|ит)[а-я ]{0,12}(в )?груд/,
  /серд[а-я]* (боль|болит|колет|сжима)/,
  /не могу дышать|задыха/,
  /без сознания|потерял[а]? сознание/,
  /кровотеч|кровь (не )?останав/,
  /упал[а]? и не могу|упал[а]?$/,
  /инсульт|инфаркт/,
  /хочу умереть|покончить с собой|не хочу жить/,
];

// A short cry for help on its own; in a longer sentence ("help me find a pharmacy") it is not.
const SHORT_CRY = /^(sos|yordam|yordam bering|meni qutqaring|помогите|спасите|help)[ !.]*$/;

export function looksLikeEmergency(text: string) {
  const value = normalizeText(text);
  return SHORT_CRY.test(value) || has(value, EMERGENCY);
}

// Asking to change a treatment: answered by a doctor, never by CareMate.
const TREATMENT_CHANGE = [
  /doza(ni|si)? (oshir|kamaytir|ozgartir)/,
  /(dori|tabletka)(ni|lar(ni)?)? (ichmasam|toxtat|tashla|ikki barobar)/,
  /qanday (dori|tabletka) ich(ay|sam)/,
  /(увелич|уменьш|измени)[а-я]* доз/,
  /(можно|могу) (ли )?(не пить|бросить|прекратить|пропустить|выпить две|выпить двойн)/,
  /какое лекарство (мне )?(пить|принимать)/,
];

export function asksToChangeTreatment(text: string) {
  return has(normalizeText(text), TREATMENT_CHANGE);
}

const MEDICINE = [/dori(?!xona)/, /tabletka/, /лекарств/, /таблет/, /приём|прием/];
const NEXT = [/keyingi/, /qachon/, /следующ/, /когда/];
const HELPERS = [/yordamchi(lar)?im/, /kim(lar)? yordam/, /мои помощник/, /кто мне помога/, /мои близкие кто/];
const FAMILY_WHERE = [/(yaqin|onam|otam|buvim|bobom|farzand)[a-z]* qayerda/, /qayerda.*(yaqin|onam|otam|buvim|bobom)/, /где (сейчас )?(мои )?(близк|мама|папа|бабушк|дедушк|родн)/, /местоположение близких/];
const MY_SHARING = [/joylashuvim(ni)? (kim|kimlar)/, /joylashuvimni (ulash|korsat)/, /кто (видит|знает) (где я|мое местоположение|моё местоположение)/, /мое местоположение|моё местоположение/];
const PHARMACY = [/dorixona/, /аптек/];
const WHEELCHAIR = [/aravacha/, /nogironlar/, /pandus/, /коляск/, /пандус/, /инвалид/, /доступн/];
const NEAREST = [/yaqin(roq|dagi)? (shifoxona|klinika|poliklinika|dorixona)/, /eng yaqin/, /ближайш/, /рядом/];
const SOS_HOW = [/sos (qanday|nima)/, /как (работает )?sos/, /sos как/];
const INVITE = [/taklif/, /пригласить|приглашени/, /добавить помощника/, /yordamchi qosh/];

/** The quick question a typed or spoken sentence means, if it clearly means one. */
export function matchIntent(text: string): QuickQuestion | null {
  const value = normalizeText(text);
  if (!value) return null;
  if (has(value, SOS_HOW)) return "how_sos";
  if (has(value, INVITE)) return "invite_helper";
  if (has(value, MEDICINE)) return has(value, NEXT) ? "next_medicine" : "today_medicines";
  if (has(value, FAMILY_WHERE)) return "family_locations";
  if (has(value, MY_SHARING)) return "my_sharing";
  if (has(value, HELPERS)) return "my_helpers";
  if (has(value, PHARMACY) && (has(value, NEAREST) || value.split(" ").length <= 3)) return "nearest_pharmacy";
  if (has(value, WHEELCHAIR) || has(value, NEAREST)) return "nearest_accessible";
  return null;
}

/** Quick questions that need the person's position to answer. */
export const needsPosition = (question: QuickQuestion) => question === "nearest_accessible" || question === "nearest_pharmacy";
