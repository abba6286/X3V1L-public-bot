import { Bot } from "grammy";

let countryCache: Record<number, string> = {};

export function setCountryCache(data: Record<number, string>) {
  countryCache = data;
}

export function getCountryName(id: number): string {
  return countryCache[id] ?? `Country ${id}`;
}

const nameToIso: Record<string, string> = {
  russia: "ru", ukraine: "ua", kazakhstan: "kz",
  usa: "us", "united states": "us", "united states of america": "us",
  uk: "gb", "united kingdom": "gb",
  germany: "de", france: "fr", spain: "es", italy: "it",
  china: "cn", india: "in", brazil: "br", indonesia: "id",
  pakistan: "pk", bangladesh: "bd", nigeria: "ng", ethiopia: "et",
  mexico: "mx", japan: "jp", philippines: "ph", egypt: "eg",
  vietnam: "vn", iran: "ir", turkey: "tr", thailand: "th",
  kenya: "ke", colombia: "co", argentina: "ar", algeria: "dz",
  sudan: "sd", iraq: "iq", canada: "ca", poland: "pl",
  morocco: "ma", uzbekistan: "uz", peru: "pe", venezuela: "ve",
  malaysia: "my", mozambique: "mz", ghana: "gh", "saudi arabia": "sa",
  "ivory coast": "ci", nepal: "np", cameroon: "cm", australia: "au",
  niger: "ne", taiwan: "tw", "south korea": "kr", mali: "ml",
  "burkina faso": "bf", burkina: "bf", syria: "sy", malawi: "mw",
  chile: "cl", zambia: "zm", ecuador: "ec", netherlands: "nl",
  cambodia: "kh", senegal: "sn", zimbabwe: "zw", bolivia: "bo",
  guinea: "gn", rwanda: "rw", benin: "bj", burundi: "bi",
  haiti: "ht", somalia: "so", tunisia: "tn", jordan: "jo",
  kuwait: "kw", belarus: "by", "czech republic": "cz", czechia: "cz",
  portugal: "pt", sweden: "se", greece: "gr", hungary: "hu",
  israel: "il", austria: "at", switzerland: "ch", singapore: "sg",
  "hong kong": "hk", denmark: "dk", finland: "fi", norway: "no",
  romania: "ro", belgium: "be", "new zealand": "nz", "south africa": "za",
  afghanistan: "af", myanmar: "mm", serbia: "rs", croatia: "hr",
  slovakia: "sk", bulgaria: "bg", "sri lanka": "lk",
  "costa rica": "cr", panama: "pa", "puerto rico": "pr",
  "trinidad and tobago": "tt", "dominican republic": "do",
  "el salvador": "sv", guatemala: "gt", honduras: "hn",
  nicaragua: "ni", paraguay: "py", uruguay: "uy", laos: "la",
  mongolia: "mn", kyrgyzstan: "kg", tajikistan: "tj",
  turkmenistan: "tm", georgia: "ge", armenia: "am", azerbaijan: "az",
  moldova: "md", albania: "al", "north macedonia": "mk", macedonia: "mk",
  kosovo: "xk", "bosnia and herzegovina": "ba", slovenia: "si",
  montenegro: "me", estonia: "ee", latvia: "lv", lithuania: "lt",
  ireland: "ie", iceland: "is", luxembourg: "lu", malta: "mt",
  cyprus: "cy", uae: "ae", "united arab emirates": "ae", qatar: "qa",
  bahrain: "bh", oman: "om", yemen: "ye", lebanon: "lb",
  palestine: "ps", libya: "ly", angola: "ao", namibia: "na",
  botswana: "bw", madagascar: "mg", uganda: "ug", tanzania: "tz",
  "dr congo": "cd", "new caledonia": "nc",
};

export function getFlagEmoji(countryName: string): string {
  const key = countryName.toLowerCase().trim();
  const iso = nameToIso[key];
  if (!iso) return "🌐";
  return iso
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e0 - 65 + c.charCodeAt(0)))
    .join("");
}

export function serviceLabel(service: "tg" | "wa" | string): string {
  return service === "tg" ? "Telegram" : service === "wa" ? "WhatsApp" : service;
}

export function formatBalance(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(3)}`;
}

export function safeDeleteMessage(bot: Bot, chatId: number, messageId: number): void {
  bot.api.deleteMessage(chatId, messageId).catch(() => {});
}

export function autoDeleteMessage(bot: Bot, chatId: number, messageId: number, delayMs: number): void {
  setTimeout(() => safeDeleteMessage(bot, chatId, messageId), delayMs);
}

export function paginate<T>(items: T[], page: number, perPage: number): T[] {
  return items.slice(page * perPage, (page + 1) * perPage);
}

export function totalPages<T>(items: T[], perPage: number): number {
  return Math.ceil(items.length / perPage);
}
