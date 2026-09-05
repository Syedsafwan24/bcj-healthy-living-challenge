/**
 * End-to-end smoke test through a real browser.
 *
 * Covers the phase P7 sign-off list in specification section 12: admin
 * lockout and re-authentication, the audit trail, and the confirmation that
 * no participant route can reach another participant's data. It exercises the
 * forms that a plain HTTP client cannot, because they are Server Actions.
 *
 *   npm run dev
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... E2E_TOTP_SECRET=...  *     npm run test:e2e -- http://localhost:3000
 *
 * The admin credentials are for an enrolled organiser account. Run this
 * against a development database: it creates participants and entries.
 */

import "../src/db/load-env";
import { chromium, type Page } from "playwright";
import * as OTPAuth from "otpauth";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, desc } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { todayInZone } from "../src/lib/dates";

const BASE = process.argv[2] ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = required("E2E_ADMIN_EMAIL");
const ADMIN_PASSWORD = required("E2E_ADMIN_PASSWORD");

/** Mirrors ADMIN_REQUIRE_TOTP, so the suite matches how the app is configured. */
const REQUIRE_TOTP =
  (process.env.ADMIN_REQUIRE_TOTP ?? "true").toLowerCase() !== "false";
const TOTP_SECRET = REQUIRE_TOTP ? required("E2E_TOTP_SECRET") : "";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `${name} is not set. This suite needs an enrolled organiser account:
` +
        "  E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TOTP_SECRET",
    );
    process.exit(1);
  }
  return value;
}

const results: Array<[string, boolean, string]> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

function totpCode() {
  if (!REQUIRE_TOTP) return "";
  return new OTPAuth.TOTP({
    issuer: process.env.TOTP_ISSUER ?? "BCJ Challenge",
    label: ADMIN_EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(TOTP_SECRET),
  }).generate();
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [page error]", e.message));

  /* ---------------- registration ---------------- */
  const stamp = Date.now().toString(36).slice(-5);
  const email = `e2e-${stamp}@bcj-demo.invalid`;

  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#fullName", "E2E Test Person");
  await page.fill("#email", email);
  await page.fill("#mobile", "+966500000111");
  await page.fill("#age", "33");
  await selectOption(page, "#gender", "Male");
  await page.fill("#weightKg", "78");
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/register\/success/, { timeout: 30000 });
  const idText = await page.locator(".font-mono").first().innerText();
  const registrationId = idText.trim();
  check(
    "registration creates an unguessable ID",
    /^BCJ\d{4,}-[A-Z0-9]{4}$/.test(registrationId),
    registrationId,
  );

  // Two people, one email address — specification section 1 and O-7.
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#fullName", "E2E Family Member");
  await page.fill("#email", email);
  await page.fill("#mobile", "+966500000112");
  await page.fill("#age", "28");
  await selectOption(page, "#gender", "Female");
  await page.fill("#weightKg", "58");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/register\/success/, { timeout: 30000 });
  const secondId = (await page.locator(".font-mono").first().innerText()).trim();

  check(
    "one email may register several participants, each with its own ID",
    secondId !== registrationId,
    `${registrationId} and ${secondId}`,
  );

  /* ---------------- pending cannot sign in ---------------- */
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#registrationId", registrationId);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check(
    "a pending registration cannot sign in",
    (await page.content()).includes("waiting for approval"),
  );

  /* ---------------- admin sign-in ---------------- */
  // A fresh load per attempt: reusing a page across submissions can pick up a
  // stale Server Action id while a dev server is recompiling.
  async function attemptAdminSignIn(password: string, code: string) {
    await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
    await page.fill("#email", ADMIN_EMAIL);
    await page.fill("#password", password);
    if (REQUIRE_TOTP) await page.fill("#totp", code);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    return page.url();
  }

  if (REQUIRE_TOTP) {
    check(
      "admin sign-in is refused with a wrong TOTP code",
      (await attemptAdminSignIn(ADMIN_PASSWORD, "000000")).includes("/admin/login"),
    );
  } else {
    check(
      "the sign-in form asks for no authenticator code",
      (await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" }),
      (await page.locator("#totp").count()) === 0),
    );
  }

  check(
    "admin sign-in is refused with a wrong password",
    (await attemptAdminSignIn("not-the-password", totpCode())).includes("/admin/login"),
  );

  await attemptAdminSignIn(ADMIN_PASSWORD, totpCode());
  await page.waitForURL((u) => !u.pathname.includes("/admin/login"), { timeout: 30000 });
  check(
    REQUIRE_TOTP
      ? "admin signs in with email, password and TOTP"
      : "admin signs in with email and password",
    page.url().endsWith("/admin"),
  );

  /* ---------------- activate the participant ---------------- */
  const [created] = await db
    .select({ id: schema.participants.id })
    .from(schema.participants)
    .where(eq(schema.participants.registrationId, registrationId));

  await page.goto(`${BASE}/admin/participants/${created.id}`, { waitUntil: "networkidle" });
  await page.click('button[role="tab"]:has-text("Details")');
  await page.waitForTimeout(500);
  await selectOption(page, "#status", "Active");
  await selectOption(page, "#dietCategoryId", "75 to 90 kg");
  await page.fill("#reason", "E2E test: approving the registration");
  await page.click('form button[type="submit"]:has-text("Save changes")');
  await page.waitForTimeout(3000);

  const [afterActivation] = await db
    .select({ status: schema.participants.status, diet: schema.participants.dietCategoryId })
    .from(schema.participants)
    .where(eq(schema.participants.id, created.id));
  check(
    "admin activates a participant and assigns a diet category",
    afterActivation.status === "active" && afterActivation.diet !== null,
  );

  const auditRows = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entityId, created.id))
    .orderBy(desc(schema.auditLog.createdAt));
  check(
    "the change is written to the audit history with old and new values",
    auditRows.some((r) => r.field === "status" && r.oldValue === "pending" && r.newValue === "active"),
  );
  check(
    "the health-data view is logged",
    auditRows.some((r) => r.action === "health.viewed"),
  );

  /* ---------------- participant signs in and logs a day ---------------- */
  const participantContext = await browser.newContext();
  const pp = await participantContext.newPage();

  await pp.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await pp.fill("#registrationId", registrationId.toLowerCase().replace("-", ""));
  await pp.click('button[type="submit"]');
  await pp.waitForURL(/\/app/, { timeout: 30000 });
  check("participant signs in with the ID typed without its hyphen", pp.url().includes("/app"));

  // From week 9 onwards all nine challenges are active, alongside the five
  // diet occasions, so the daily maximum is 100.
  await pp.fill('input[name="waterLitres"]', "2.5");
  await pp.fill('input[name="steps"]', "10000");
  await pp.fill('input[name="sleepHours"]', "8");
  for (const label of [
    "Cook all meals at home",
    "No sugary drinks & desserts",
    "Eat vegetables with every main meal",
    "No eating after 8 PM",
    "10 minutes of mindfulness or breathing",
    "Limit screen time before bed",
    "Breakfast",
    "Mid-morning",
    "Lunch",
    "Evening snack",
    "Dinner",
  ]) {
    await pp.click(`button[aria-label="${label}: yes"]`);
  }

  // Sleep is 1 point per hour capped at 10, so 8 hours scores 8 of 10 and the
  // day totals 98, not 100. The browser preview must agree with the server.
  const preview = await pp.locator("text=/98 \\/ 100/").count();
  check("the browser preview agrees with the server: 98 / 100", preview > 0);

  await pp.click('button[type="submit"]:has-text("Save my day")');
  await pp.waitForTimeout(4000);

  const [entry] = await db
    .select()
    .from(schema.dailyEntries)
    .where(eq(schema.dailyEntries.participantId, created.id));

  check(
    "the server stores the score it calculated itself",
    Number(entry?.dailyPoints) === 98 &&
      entry?.maxPoints === 100 &&
      Number(entry?.dailyPercentage) === 98,
    `${entry?.dailyPoints}/${entry?.maxPoints} = ${entry?.dailyPercentage}%`,
  );
  // Derived from the settings, not hardcoded: the competition moves on, and
  // weeks 10 to 12 repeat the week 9 set (open item O-1).
  const [settingsRow] = await db.select().from(schema.settings);
  const expectedWeek =
    Math.floor(
      (Date.parse(`${todayInZone(settingsRow.timezone)}T00:00:00Z`) -
        Date.parse(`${settingsRow.startDate}T00:00:00Z`)) /
        (7 * 86_400_000),
    ) + 1;
  check(
    "the entry is filed under the right week",
    entry?.weekNo === expectedWeek,
    `week ${entry?.weekNo}, expected ${expectedWeek}`,
  );

  const [weekRow] = await db
    .select()
    .from(schema.weeklyScores)
    .where(eq(schema.weeklyScores.participantId, created.id));
  const [finalRow] = await db
    .select()
    .from(schema.finalScores)
    .where(eq(schema.finalScores.participantId, created.id));

  check(
    "the day, the week and the final score are written together",
    Number(weekRow?.percentage) === 14 && Number(finalRow?.finalScore) === 14,
    `week ${weekRow?.percentage}%, final ${finalRow?.finalScore}`,
  );

  /* ---------------- a participant cannot reach another's data ---------------- */
  const [otherParticipant] = await db
    .select({ id: schema.participants.id, registrationId: schema.participants.registrationId })
    .from(schema.participants)
    .where(eq(schema.participants.status, "active"))
    .orderBy(schema.participants.seqNo)
    .limit(1);

  const leaked = await pp.goto(`${BASE}/admin/participants/${otherParticipant.id}`, {
    waitUntil: "domcontentloaded",
  });
  check(
    "a participant session cannot open an admin route",
    pp.url().includes("/admin/login"),
    `status ${leaked?.status()}`,
  );

  /* ---------------- admin correction rescores the entry ---------------- */
  await page.goto(`${BASE}/admin/entries/${entry.id}/edit`, { waitUntil: "networkidle" });
  await page.fill('input[name="waterLitres"]', "1.0"); // 4 points instead of 10
  await page.fill("#reason", "E2E test: participant reported the correct figure by phone");
  await page.click('button[type="submit"]:has-text("Save correction")');
  await page.waitForTimeout(4000);

  const [corrected] = await db
    .select()
    .from(schema.dailyEntries)
    .where(eq(schema.dailyEntries.id, entry.id));
  const [weekAfter] = await db
    .select()
    .from(schema.weeklyScores)
    .where(eq(schema.weeklyScores.participantId, created.id));
  const [finalAfter] = await db
    .select()
    .from(schema.finalScores)
    .where(eq(schema.finalScores.participantId, created.id));

  check(
    "an admin correction rescores the day",
    Number(corrected?.dailyPoints) === 92 && corrected?.maxPoints === 100,
    `${corrected?.dailyPoints}/${corrected?.maxPoints}`,
  );
  check(
    "the week and the final score move with it",
    Number(weekAfter?.percentage) === 13.1429 && Number(finalAfter?.finalScore) === 13.1429,
    `week ${weekAfter?.percentage}%, final ${finalAfter?.finalScore}`,
  );

  const correctionAudit = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entityId, entry.id));
  check(
    "the correction is audited with a reason and the old and new value",
    correctionAudit.some(
      (r) =>
        r.action === "entry.admin_corrected" &&
        r.field === "waterLitres" &&
        r.reason?.includes("by phone"),
    ),
  );

  /* ---------------- exports ---------------- */
  for (const [kind, format] of [
    ["daily", "csv"],
    ["weekly", "xlsx"],
    ["final", "pdf"],
  ] as const) {
    const response = await page.request.post(`${BASE}/admin/exports/download`, {
      form: { kind, format },
    });
    const body = await response.body();
    check(
      `${kind} export as ${format} downloads`,
      response.ok() && body.length > 100,
      `${(body.length / 1024).toFixed(1)} kB`,
    );
  }

  const csv = await (
    await page.request.post(`${BASE}/admin/exports/download`, {
      form: { kind: "final", format: "csv" },
    })
  ).text();
  check(
    "the export carries the same final score as the screen",
    csv.includes("13.1429"),
  );
  check(
    "a plain export omits the health fields",
    !csv.includes("Blood group"),
  );

  const healthCsv = await (
    await page.request.post(`${BASE}/admin/exports/download`, {
      form: {
        kind: "final",
        format: "csv",
        includeHealth: "true",
        password: ADMIN_PASSWORD,
        ...(REQUIRE_TOTP ? { totp: totpCode() } : {}),
      },
    })
  ).text();
  check(
    REQUIRE_TOTP
      ? "a health export needs the password and TOTP again, and then includes them"
      : "a health export needs the password again, and then includes them",
    healthCsv.includes("Blood group"),
  );

  const refused = await page.request.post(`${BASE}/admin/exports/download`, {
    form: {
      kind: "final",
      format: "csv",
      includeHealth: "true",
      password: "wrong",
      ...(REQUIRE_TOTP ? { totp: "000000" } : {}),
    },
    maxRedirects: 0,
  });
  check(
    "a health export with the wrong password is refused",
    refused.status() === 303 || !(await refused.text()).includes("Blood group"),
  );

  /* ---------------- leaderboard hides the registration ID ---------------- */
  await pp.goto(`${BASE}/app/leaderboard`, { waitUntil: "networkidle" });
  const leaderboardHtml = await pp.content();
  check(
    "the leaderboard shows display names and no registration IDs",
    leaderboardHtml.includes("Abdul R.") &&
      !leaderboardHtml.includes(otherParticipant.registrationId),
  );

  await browser.close();
  await client.end();

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

/** shadcn Select is a Radix listbox, not a native <select>. */
async function selectOption(page: Page, trigger: string, optionLabel: string) {
  await page.click(trigger);
  await page.click(`[role="option"]:has-text("${optionLabel}")`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
