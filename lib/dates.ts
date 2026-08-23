import type { Language } from "@/lib/i18n";

/**
 * Short day labels for the slot pickers, e.g. "8 avq, Ş.".
 *
 * The tables are explicit rather than going through Intl: Hermes ships a
 * trimmed ICU and Azerbaijani in particular is not reliably present, so
 * asking Intl for it risks getting English month names on device. These also
 * keep the exact abbreviations the shipped app uses.
 */
const MONTHS: Record<Language, string[]> = {
  az: ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"],
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** Indexed by Date#getDay(), i.e. Sunday first. */
const WEEKDAYS: Record<Language, string[]> = {
  az: ["B.", "B.e.", "Ç.a.", "Ç.", "C.a.", "C.", "Ş."],
  ru: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export function shortDayLabel(date: Date, language: Language): string {
  const months = MONTHS[language] ?? MONTHS.az;
  const weekdays = WEEKDAYS[language] ?? WEEKDAYS.az;

  return `${date.getDate()} ${months[date.getMonth()]}, ${weekdays[date.getDay()]}`;
}

/**
 * The next `count` days as pickable labels: today, tomorrow, then dates.
 *
 * `today` / `tomorrow` come from the caller so they stay in step with the
 * rest of the interface copy.
 */
export function buildDayLabels(
  language: Language,
  labels: { today: string; tomorrow: string },
  count = 7,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (i === 0) out.push(labels.today);
    else if (i === 1) out.push(labels.tomorrow);
    else out.push(shortDayLabel(d, language));
  }
  return out;
}
