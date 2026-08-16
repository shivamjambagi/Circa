import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync("app/community/[projectId]/CommunityClient.tsx", "utf8");
const panel = fs.readFileSync("app/community/[projectId]/ContactDetailsPanel.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("main Contacts table has exactly four display headings", () => {
  assert.match(client, /<span>Name<\/span><span>Category<\/span><span>Phone<\/span><span>Email<\/span><\/div>/);
  assert.doesNotMatch(client, /<span>Email<\/span><span \/><\/div>/);
  assert.doesNotMatch(client, /<i>View →<\/i>/);
});

test("main list uses professional fallback text", () => {
  assert.match(client, /entry\.item\.phone \|\| "Not provided"/);
  assert.match(client, /entry\.item\.email \|\| "Not provided"/);
});

test("whole contact row opens the rich detail view", () => {
  assert.match(client, /aria-label=\{`Open \$\{entry\.item\.title\} details`\}/);
  assert.match(client, /<ContactDetailsPanel item=\{selected\.item\} list=\{selected\.list\} \/>/);
});

test("rich detail view can display extra stored fields", () => {
  for (const token of [
    "item.phone",
    "item.email",
    "item.url",
    "item.website",
    "item.address",
    "item.openingInformation",
    "item.notes",
    "item.customFields",
    "Community feedback",
    "Historic pricing / availability",
    "Social media",
  ]) {
    assert.ok(panel.includes(token), `Expected rich details to include ${token}`);
  }
});

test("display stylesheet loads after globals", () => {
  const globalsIndex = layout.indexOf('import "./globals.css";');
  const contactsIndex = layout.indexOf('import "./contact-directory-display.css";');
  assert.ok(globalsIndex >= 0 && contactsIndex > globalsIndex);
});
