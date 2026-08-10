import type { ProjectCategory } from "./graphStore.ts";
import { projectTemplates } from "./projectTemplates.ts";

function tidySpokenName(value: string) {
  return value
    .trim()
    .replace(/^(?:a person (?:called|named)|called|named)\s+/i, "")
    .replace(/[,.!?]+$/g, "")
    .split(/\s+/)
    .slice(0, 4)
    .map((part) => part.split(/([-'])/).map((piece) => /^[-']$/.test(piece) ? piece : piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase()).join(""))
    .join(" ");
}

export function parseSpokenPerson(transcript: string, category: ProjectCategory = "personal") {
  const clean = transcript.trim().replace(/\s+/g, " ").replace(/\s*\b(?:stop|done|finished|finish)\b[.!?]*\s*$/i, "").trim();
  if (!clean) return null;
  const namePattern = /(?:her|his|their)\s+name\s+is\s+(.+?)(?=\s+(?:from|and\s+(?:we|i|he|she|they)|we\s+met|i\s+know|who\s+is)\b|[,.!?]|$)/i;
  const commandPattern = /(?:add|create|remember|this\s+is|name\s+is)(?:\s+(?:a\s+person|someone))?(?:\s+(?:called|named))?\s+(.+?)(?=\s+(?:from|and\s+(?:we|i|he|she|they)|we\s+met|i\s+know|who\s+is)\b|[,.!?]|$)/i;
  const nameMatch = clean.match(namePattern) ?? clean.match(commandPattern);
  const shortPhrase = clean.split(/\s+/).length <= 4 ? clean : "";
  const name = tidySpokenName(nameMatch?.[1] ?? shortPhrase);
  if (!name || /^(her|his|their|the|a)$/i.test(name)) return null;
  const contextMatch = clean.match(/(?:from|we\s+met\s+(?:at|in|through)|i\s+know\s+(?:her|him|them)\s+from)\s+(.+?)(?=\s+and\s+(?:he|she|they)\s+(?:is|are)\s+my\b|[.!?]|$)/i);
  const relationshipText = clean.toLowerCase().replace(/co-worker|coworker/g, "colleague");
  const options = projectTemplates[category].relationships.slice().sort((a, b) => b.label.length - a.label.length);
  let detectedOption = options.find((option) => new RegExp(`\\b${option.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(relationshipText));
  if (!detectedOption && /\bmate\b/.test(relationshipText)) detectedOption = options.find((option) => option.label === "Friend");
  if (!detectedOption && /\b(?:brother|sister|mother|father|mum|mom|dad)\b/.test(relationshipText)) detectedOption = options.find((option) => option.label === "Sibling" || option.label === "Parent");
  return { name, howWeMet: contextMatch?.[1]?.trim() ?? "", relationshipDetected: Boolean(detectedOption), relationshipType: detectedOption?.style ?? null, relationshipLabel: detectedOption?.label ?? "" };
}
