import type { BinValue, CommunityItem } from "../cloud/types";
import { nextScheduleOccurrence } from "../shared/communityQueryEngine.ts";

export const SUPPORTED_BINS: readonly BinValue[] = ["green", "blue", "grey", "brown"];

export type BinCollectionInput = {
  date: string;
  bins: BinValue[];
};

export type BinCollectionRecord = BinCollectionInput & {
  id: string;
};

export type BinCollectionMonth = {
  key: string;
  label: string;
  collections: BinCollectionRecord[];
};

function dateEpoch(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const candidate = new Date(epoch);
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day ? epoch : NaN;
}

function dateFromEpoch(epoch: number) {
  return new Date(epoch).toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  return dateFromEpoch(dateEpoch(date) + days * 86_400_000);
}

function addMonths(date: string, months: number) {
  const candidate = new Date(`${date}T12:00:00Z`);
  candidate.setUTCMonth(candidate.getUTCMonth() + months);
  return candidate.toISOString().slice(0, 10);
}

export function validateBinDate(value: unknown) {
  const date = String(value ?? "").trim();
  if (!Number.isFinite(dateEpoch(date))) throw new Error("Choose a valid collection date in YYYY-MM-DD format.");
  return date;
}

export function validateBinCollection(value: unknown): BinCollectionInput {
  if (!value || typeof value !== "object") throw new Error("Each collection must contain a date and bins.");
  const candidate = value as { date?: unknown; bins?: unknown };
  const date = validateBinDate(candidate.date);
  if (!Array.isArray(candidate.bins) || !candidate.bins.length) throw new Error(`Collection ${date} must include at least one bin.`);
  const rawBins = candidate.bins.map((bin) => String(bin).trim().toLowerCase());
  const invalid = rawBins.find((bin) => !SUPPORTED_BINS.includes(bin as BinValue));
  if (invalid) throw new Error(`Collection ${date} contains unsupported bin “${invalid}”.`);
  if (new Set(rawBins).size !== rawBins.length) throw new Error(`Collection ${date} contains a duplicate bin.`);
  return { date, bins: SUPPORTED_BINS.filter((bin) => rawBins.includes(bin)) };
}

export function parseBinCollectionImport(value: unknown) {
  const rows = Array.isArray(value) ? value : value && typeof value === "object" ? (value as { collections?: unknown }).collections : null;
  if (!Array.isArray(rows) || !rows.length) throw new Error("No bin collections were found in that JSON file.");
  if (rows.length > 400) throw new Error("Circa imports up to 400 collection dates at a time.");
  const collections = rows.map(validateBinCollection);
  const dates = new Set<string>();
  collections.forEach((collection) => {
    if (dates.has(collection.date)) throw new Error(`The import contains duplicate date ${collection.date}.`);
    dates.add(collection.date);
  });
  return collections.sort((a, b) => a.date.localeCompare(b.date));
}

export function binCollectionItem(collection: BinCollectionInput): Partial<CommunityItem> {
  const validated = validateBinCollection(collection);
  return {
    title: formatBinNames(validated.bins),
    details: "",
    description: "",
    category: "Bin collections",
    itemType: "bin",
    date: validated.date,
    binType: validated.bins.join("+"),
    bins: validated.bins,
    schedule: { type: "once", firstCollectionDate: validated.date },
    enabled: true,
    order: Number(validated.date.replaceAll("-", "")),
    schemaVersion: 2,
  };
}

export function storedBinCollectionFromItem(item: CommunityItem): BinCollectionRecord | null {
  if (!Array.isArray(item.bins)) return null;
  try {
    const collection = validateBinCollection({ date: item.date || item.schedule?.firstCollectionDate, bins: item.bins });
    return { id: item.id, ...collection };
  } catch {
    return null;
  }
}

function canonicalBinsFromItem(item: CommunityItem) {
  if (Array.isArray(item.bins)) {
    try { return validateBinCollection({ date: item.date || item.schedule?.firstCollectionDate, bins: item.bins }).bins; } catch { return []; }
  }
  const text = `${item.binType || ""} ${item.title || ""}`.toLowerCase();
  return SUPPORTED_BINS.filter((bin) => new RegExp(`\\b${bin}\\b`).test(text));
}

export function binCollectionOccurrences(items: CommunityItem[], fromDate: string, throughDate = addMonths(fromDate, 12)) {
  validateBinDate(fromDate);
  validateBinDate(throughDate);
  const byDate = new Map<string, Set<BinValue>>();
  const add = (date: string, bins: BinValue[]) => {
    if (!Number.isFinite(dateEpoch(date)) || !bins.length) return;
    const stored = byDate.get(date) || new Set<BinValue>();
    bins.forEach((bin) => stored.add(bin));
    byDate.set(date, stored);
  };

  items.forEach((item) => {
    const bins = canonicalBinsFromItem(item);
    if (!bins.length) return;
    const stored = storedBinCollectionFromItem(item);
    if (stored) { add(stored.date, stored.bins); return; }
    if (item.date && Number.isFinite(dateEpoch(item.date))) add(item.date, bins);
    if (!item.schedule) return;
    if (item.schedule.type === "once") { add(item.schedule.firstCollectionDate, bins); return; }
    let occurrence = nextScheduleOccurrence(item.schedule, fromDate);
    let guard = 0;
    while (occurrence && occurrence <= throughDate && guard < 80) {
      add(occurrence, bins);
      occurrence = nextScheduleOccurrence(item.schedule, addDays(occurrence, 1));
      guard += 1;
    }
  });

  return [...byDate.entries()]
    .map(([date, bins]) => ({ id: date, date, bins: SUPPORTED_BINS.filter((bin) => bins.has(bin)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function nextBinCollection(collections: BinCollectionRecord[], today: string) {
  validateBinDate(today);
  return collections.filter((collection) => collection.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

export function isTomorrowBinCollection(date: string, today: string) {
  return dateEpoch(validateBinDate(date)) - dateEpoch(validateBinDate(today)) === 86_400_000;
}

export function groupBinCollectionsByMonth(collections: BinCollectionRecord[], timezone = "Europe/London"): BinCollectionMonth[] {
  const groups = new Map<string, BinCollectionRecord[]>();
  collections.forEach((collection) => {
    const key = collection.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) || []), collection]);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => ({
    key,
    label: new Intl.DateTimeFormat("en-GB", { timeZone: timezone, month: "long", year: "numeric" }).format(new Date(`${key}-15T12:00:00Z`)),
    collections: rows.sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

export function formatBinCollectionDate(date: string, timezone = "Europe/London") {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${validateBinDate(date)}T12:00:00Z`));
}

export function formatBinNames(bins: BinValue[]) {
  return bins.map((bin) => `${bin[0].toUpperCase()}${bin.slice(1)}`).join(" + ");
}
