import type { CollectionSchedule, CommunityListType } from "../cloud/types";

export type PublishedCommunityRecord = {
  listId: string; listTitle: string; itemId: string; title: string; details: string;
  category?: string; itemType?: CommunityListType; phone?: string; email?: string; url?: string; website?: string; address?: string; notes?: string;
  date?: string; startDate?: string; startTime?: string; endTime?: string; location?: string; binType?: string; schedule?: CollectionSchedule; timezone?: string; enabled?: boolean;
};

export type CommunityQueryResult = { intent: "bin" | "event" | "directory" | "contact" | "search" | "help"; answer: string; itemIds: string[]; targetDate?: string };

const STOP_WORDS = new Set(["a", "an", "and", "are", "can", "do", "for", "i", "in", "is", "me", "my", "of", "on", "please", "show", "tell", "the", "to", "what", "when", "where", "who"]);
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function terms(input: string) { return input.toLowerCase().replace(/[^a-z0-9@.+-]+/g, " ").split(/\s+/).filter((word) => word && !STOP_WORDS.has(word)); }
function parseDateKey(key: string) { const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN; }
function fromEpoch(epoch: number) { return new Date(epoch).toISOString().slice(0, 10); }
function addDays(key: string, count: number) { return fromEpoch(parseDateKey(key) + count * 86_400_000); }
function dayDifference(from: string, to: string) { return Math.round((parseDateKey(to) - parseDateKey(from)) / 86_400_000); }
function weekday(key: string) { return new Date(parseDateKey(key)).getUTCDay(); }

export function dateKeyInTimezone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function nextScheduleOccurrence(schedule: CollectionSchedule, fromDate: string, requestedDate?: string) {
  const first = schedule.firstCollectionDate;
  if (!Number.isFinite(parseDateKey(first))) return null;
  if (schedule.type === "once") return first >= (requestedDate || fromDate) ? first : null;
  const intervalDays = schedule.type === "weekly" ? 7 : schedule.type === "fortnightly" ? 14 : Math.max(1, Number(schedule.intervalWeeks || 1)) * 7;
  const target = requestedDate || fromDate; const difference = dayDifference(first, target);
  if (difference <= 0) return first;
  const steps = Math.ceil(difference / intervalDays); return addDays(first, steps * intervalDays);
}

function targetDateFromQuestion(question: string, today: string) {
  if (/\bday after tomorrow\b/.test(question)) return addDays(today, 2);
  if (/\btomorrow\b/.test(question)) return addDays(today, 1);
  if (/\btoday\b/.test(question)) return today;
  const named = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}(?:${name.slice(3)})?\\b`).test(question));
  if (named >= 0) { const delta = (named - weekday(today) + 7) % 7; return addDays(today, delta || 7); }
  return undefined;
}

function formatDate(key: string, timezone: string, today: string) {
  const relative = key === today ? "today, " : key === addDays(today, 1) ? "tomorrow, " : "";
  return `${relative}${new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${key}T12:00:00Z`))}`;
}

function score(record: PublishedCommunityRecord, queryTerms: string[]) {
  const title = `${record.title} ${record.category || ""} ${record.binType || ""}`.toLowerCase();
  const body = `${record.listTitle} ${record.details} ${record.date || ""} ${record.address || ""} ${record.location || ""}`.toLowerCase();
  return queryTerms.reduce((total, word) => total + (title.includes(word) ? 4 : 0) + (body.includes(word) ? 1 : 0), 0);
}

function render(record: PublishedCommunityRecord) {
  const contact = [record.phone, record.email, record.address].filter(Boolean).join(" · ");
  const detail = [record.details, record.startDate || record.date, record.startTime, record.location, contact].filter(Boolean).join(" - ");
  return detail ? `${record.title}: ${detail}` : record.title;
}

function queryBins(question: string, records: PublishedCommunityRecord[], timezone: string, now: Date): CommunityQueryResult {
  const today = dateKeyInTimezone(now, timezone); const targetDate = targetDateFromQuestion(question, today);
  const binWords = terms(question).filter((word) => ["recycling", "recycle", "general", "waste", "garden", "food", "brown", "green", "grey", "gray", "black", "blue"].includes(word));
  // Prefer explicit bin/schedule records, but keep backward compatibility for
  // older approved bin records that pre-date itemType/schedule metadata.
  // Directory/contact records are never allowed through this legacy fallback,
  // so services such as "Bin cleaning" cannot become collection answers.
  const candidates = records
    .filter((record) => {
      if (record.enabled === false) return false;
      if (record.itemType === "bin" || Boolean(record.schedule)) return true;
      if (record.itemType) return false;
      return /bin|waste|recycl|rubbish/i.test(`${record.listTitle} ${record.title} ${record.category || ""}`);
    })
    .filter((record) => !binWords.length || score(record, binWords) > 0);
  const scheduled = candidates.flatMap((record) => { if (!record.schedule) return []; const occurrence = nextScheduleOccurrence(record.schedule, today, targetDate); return occurrence ? [{ record, occurrence }] : []; }).filter((entry) => !targetDate || entry.occurrence === targetDate).sort((a, b) => a.occurrence.localeCompare(b.occurrence) || a.record.title.localeCompare(b.record.title));
  if (scheduled.length) {
    const earliest = scheduled[0].occurrence; const names = scheduled.filter((entry) => entry.occurrence === earliest).map((entry) => entry.record.title);
    return { intent: "bin", answer: `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} collected ${formatDate(earliest, timezone, today)}.`, itemIds: scheduled.filter((entry) => entry.occurrence === earliest).map((entry) => entry.record.itemId), targetDate: earliest };
  }
  const legacy = candidates.map((record) => ({ record, score: score(record, [...terms(question), "bin", "collection", "recycling"]) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  if (legacy.length) return { intent: "bin", answer: legacy.slice(0, 3).map(({ record }) => render(record)).join("\n"), itemIds: legacy.slice(0, 3).map(({ record }) => record.itemId), targetDate };
  const type = binWords.find((word) => !["tomorrow", "today"].includes(word));
  return { intent: "bin", answer: `Circa does not have${type ? ` a ${type}` : " a matching"} collection schedule for this Community yet.`, itemIds: [], targetDate };
}

function queryEvents(question: string, records: PublishedCommunityRecord[], timezone: string, now: Date): CommunityQueryResult {
  const today = dateKeyInTimezone(now, timezone); const queryTerms = terms(question).filter((word) => !["event", "events", "next", "upcoming"].includes(word));
  const events = records.filter((record) => record.itemType === "event" || /events?|meeting/i.test(`${record.listTitle} ${record.category || ""}`)).map((record) => ({ record, date: record.startDate || record.date || "" })).filter((entry) => Number.isFinite(parseDateKey(entry.date)) && entry.date >= today).filter((entry) => !queryTerms.length || score(entry.record, queryTerms) > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!events.length) return { intent: "event", answer: "Circa does not have a matching upcoming event in the approved Community information yet.", itemIds: [] };
  const first = events[0]; return { intent: "event", answer: `${first.record.title} is ${formatDate(first.date, timezone, today)}${first.record.startTime ? ` at ${first.record.startTime}` : ""}${first.record.location ? ` at ${first.record.location}` : ""}.`, itemIds: [first.record.itemId], targetDate: first.date };
}

export function queryCommunity(question: string, records: PublishedCommunityRecord[], options: { timezone?: string; now?: Date } = {}): CommunityQueryResult {
  const normal = question.trim().toLowerCase(); const timezone = options.timezone || records.find((record) => record.timezone)?.timezone || "Europe/London"; const now = options.now || new Date();
  if (!normal) return { intent: "help", answer: "Ask about an approved event, collection, local service, or useful contact in this Community.", itemIds: [] };
  if (/\bbins?|rubbish|recycl|general waste|garden waste|collection\b/.test(normal)) return queryBins(normal, records, timezone, now);
  if (/\bevents?|meeting|session|what'?s on|upcoming\b/.test(normal)) return queryEvents(normal, records, timezone, now);
  const intent: CommunityQueryResult["intent"] = /phone|number|email|contact/.test(normal) ? "contact" : /electrician|plumber|trader|builder|handyman|school|restaurant|service/.test(normal) ? "directory" : "search";
  const ranked = records.map((record) => ({ record, score: score(record, terms(normal)) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title)).slice(0, 5);
  if (!ranked.length) return { intent, answer: "Circa couldn't find that in the approved Community information yet. You can ask an admin or submit a suggestion.", itemIds: [] };
  return { intent, answer: ranked.map(({ record }) => render(record)).join("\n"), itemIds: ranked.map(({ record }) => record.itemId) };
}
