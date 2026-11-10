// Turns the common OpenStreetMap opening_hours forms into words people can read,
// such as "Mo-Sa 08:00-18:00" -> "Du–Sh 08:00–18:00". Anything more complex
// (holidays, week numbers, comments) is not guessed at: it is shown as written,
// labelled as such.

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const RULE = /^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(off|closed|(?:\d{2}:\d{2}-\d{2}:\d{2})(?:,\d{2}:\d{2}-\d{2}:\d{2})*)$/;

export type HoursWords = { days: string[]; allDay: string; closed: string };

export type FormattedHours = { lines: string[]; exact: true } | { raw: string; exact: false };

function dayPart(part: string, words: HoursWords) {
  return part
    .split(",")
    .map((range) => range.split("-").map((day) => words.days[DAYS.indexOf(day)]).join("–"))
    .join(", ");
}

export function formatOpeningHours(value: string, words: HoursWords): FormattedHours {
  const text = value.trim();
  if (text === "24/7") return { lines: [words.allDay], exact: true };
  const lines: string[] = [];
  for (const rule of text.split(";").map((part) => part.trim()).filter(Boolean)) {
    const match = RULE.exec(rule);
    if (!match) return { raw: text, exact: false };
    const [, days, times] = match;
    const when = times === "off" || times === "closed" ? words.closed : times.replace(/-/g, "–").replace(/,/g, ", ");
    lines.push(days ? `${dayPart(days, words)} ${when}` : when);
  }
  return lines.length ? { lines, exact: true } : { raw: text, exact: false };
}
