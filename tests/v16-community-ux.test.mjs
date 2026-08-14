import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Open Circa gates into the authenticated route chooser", async () => {
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = await readFile(new URL("../app/start/page.tsx", import.meta.url), "utf8");
  assert.match(home, /\/auth\?returnTo=\/start/);
  assert.match(start, />Personal Map</);
  assert.match(start, />Join a Community</);
  assert.match(start, />Create a Community</);
  assert.match(start, /\/\?workspace=1/);
});

test("private Community mapping is clearly different from shared Communities", async () => {
  const templates = await readFile(new URL("../app/projectTemplates.ts", import.meta.url), "utf8");
  const hub = await readFile(new URL("../app/ProjectHub.tsx", import.meta.url), "utf8");
  assert.match(templates, /label: "Community map"/);
  assert.match(templates, /Privately map people/);
  assert.match(hub, /private map stored in this browser/);
  assert.match(hub, /Shared Circa Communities/);
});

test("Community member navigation is deliberately small and role-aware", async () => {
  const source = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  assert.match(source, /\["home", "Home"\]/);
  assert.match(source, /\["contacts", "Contacts"\]/);
  assert.match(source, /\["events", "Events"\]/);
  assert.match(source, /canReview \? \[\["manage"/);
  assert.doesNotMatch(source, /\["ask", "Ask"\]/);
  assert.doesNotMatch(source, /\["whatsapp", "WhatsApp"\]/);
  assert.doesNotMatch(source, /\["suggestions", "Suggestions"\]/);
});

test("Contacts are compact, searchable and use a four-field quick add", async () => {
  const source = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /Search electricians, plumbers, schools or names/);
  assert.match(source, /Add a contact/);
  assert.match(source, /contact-category-options/);
  assert.match(source, />Phone</);
  assert.match(source, />Email</);
  assert.match(source, /member-count-button/);
  assert.match(css, /\.contact-row \{[^}]*display:grid/);
});

test("safe Community member directory is separate from private membership records", async () => {
  const repository = await readFile(new URL("../app/cloud/communityRepository.ts", import.meta.url), "utf8");
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(repository, /watchCommunityMemberDirectory/);
  assert.match(repository, /memberDirectoryPayload/);
  assert.match(rules, /match \/memberDirectory\/\{memberId\}/);
  assert.match(rules, /allow read: if activeMember\(projectId\)/);
});

test("signed-in account has a real sign-out action and live memberships", async () => {
  const account = await readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8");
  assert.match(account, /watchMemberProjects/);
  assert.match(account, /signOutOfCirca/);
  assert.match(account, />Sign out</);
});


test("homepage copy and personal workspace URLs preserve the requested context", async () => {
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /Three ways to understand/);
  assert.doesNotMatch(home, /However you know people/);
  assert.match(home, /workspace: "1"/);
  assert.match(home, /params\.set\("project", projectId\)/);
  assert.match(home, /params\.set\("view", "people"\)/);
});

test("Community members can add for review but cannot edit published information", async () => {
  const source = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(canReview\) \{ await addPublishedItem/);
  assert.match(source, /else \{ await submitProposal/);
  assert.match(source, /if \(!canReview \|\| !selected/);
  assert.doesNotMatch(source, /Suggest correction/);
  assert.doesNotMatch(source, /Submit correction/);
  assert.match(source, /Delete my contact/);
  assert.match(source, /Delete my information/);
  assert.doesNotMatch(source, /will be verified by an admin/i);
});

test("Directory is presented to members as Contacts while Manage remains available to admins", async () => {
  const source = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  assert.match(source, /\["contacts", "Contacts"\]/);
  assert.match(source, /Contacts \/ services/);
  assert.match(source, /canReview \? \[\["manage"/);
  assert.doesNotMatch(source, /\["directory", "Directory"\]/);
});

test("public member summaries do not intentionally expose email fallback values", async () => {
  const repository = await readFile(new URL("../app/cloud/communityRepository.ts", import.meta.url), "utf8");
  assert.match(repository, /publicMemberDisplayName/);
  assert.match(repository, /!displayName\.includes\("@"\)/);
  assert.match(repository, /memberDirectoryPayload/);
});


test("auth return path is hydration-stable on the first client render", async () => {
  const auth = await readFile(new URL("../app/auth/page.tsx", import.meta.url), "utf8");
  assert.match(auth, /const \[returnTo, setReturnTo\] = useState\("\/account"\)/);
  assert.match(auth, /setReturnTo\(safeReturnTo\(new URLSearchParams\(window\.location\.search\)/);
  assert.doesNotMatch(auth, /useMemo\(\(\) => typeof window/);
});

test("Community creation remains compatible while V16 member-directory rules are staged", async () => {
  const repository = await readFile(new URL("../app/cloud/communityRepository.ts", import.meta.url), "utf8");
  const commitIndex = repository.indexOf("await batch.commit();");
  const directoryIndex = repository.indexOf('"memberDirectory", user.uid');
  assert.ok(commitIndex > -1 && directoryIndex > commitIndex, "memberDirectory must not block the atomic Community create batch");
  assert.match(repository, /Non-blocking during the V15 -> V16 rules transition/);
});

test("Community owner can still see a safe member count before member-directory rules are deployed", async () => {
  const source = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  assert.match(source, /memberDirectory\.length \? memberDirectory : canReview \? members\.map/);
});

test("Community greeting does not render the current clock during server hydration", async () => {
  const source = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  assert.match(source, /const \[now, setNow\] = useState<Date \| null>\(null\)/);
  assert.match(source, /window\.setTimeout\(\(\) => setNow\(new Date\(\)\), 0\)/);
  assert.match(source, /window\.clearTimeout\(timer\)/);
});


test("Community reminders appear on Home and can raise an in-app toast", async () => {
  const source = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  assert.match(source, /watchReminders\(projectId, setReminders\)/);
  assert.match(source, /reminders=\{reminders\}/);
  assert.match(source, /className="reminder-toast"/);
  assert.match(source, /circa_reminder_seen:/);
  assert.match(source, /now - 60 \* 60 \* 1000/);
  assert.match(source, /Next reminder/);
  assert.match(source, /added to Community Home/);
});

test("Admin Community forms are focused rather than survey-like", async () => {
  const source = await readFile(new URL("../app/community/[projectId]/CommunityClient.tsx", import.meta.url), "utf8");
  const fields = source.slice(source.indexOf("function ItemFields"), source.indexOf("function ManageView"));
  assert.doesNotMatch(fields, />Description</);
  assert.doesNotMatch(fields, />Website</);
  assert.doesNotMatch(fields, />Address</);
  assert.doesNotMatch(fields, />Notes</);
  assert.match(fields, />Name \/ title</);
  assert.match(fields, />Phone</);
  assert.match(fields, />Email</);
  assert.match(source, /No long forms/);
  assert.match(source, /Approve useful member additions or reject them in one click/);
});

test("Member-owned published information is explicitly tracked for self-delete", async () => {
  const repository = await readFile(new URL("../app/cloud/communityRepository.ts", import.meta.url), "utf8");
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(repository, /createdBy: proposal\.submittedBy/);
  assert.match(repository, /createdByName: proposal\.submittedByName/);
  assert.match(rules, /resource\.data\.createdBy == request\.auth\.uid/);
});

test("Admin nav and Contacts header get the requested small readability bump", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.community-page\.is-admin \.community-tabs button \{[^}]*font-size:12px/);
  assert.match(css, /\.contact-table-head \{ font-size:10\.5px/);
});
