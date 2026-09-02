/**
 * Seed — settings, diet categories and the first super admin.
 *
 *   npm run db:seed
 *
 * Safe to run repeatedly: it inserts what is missing and leaves the rest.
 *
 * Section 2.3 requires at least two super admin accounts. This creates one;
 * the second is invited from /admin/accounts, which is the supported path.
 */

import "./load-env";
import { randomBytes } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "./schema";

const { admins, dietCategories, settings } = schema;

/** V5 section 6, pending confirmation — open item O-11. */
const DIET_CATEGORIES = [
  {
    code: "kids_10_17",
    title: "Kids, 10 to 17 years",
    minAge: 10,
    maxAge: 17,
    minWeight: null,
    maxWeight: null,
    sortOrder: 1,
    plan:
      "Age-appropriate portions across five occasions: breakfast, mid-morning, " +
      "lunch, evening snack and dinner. Follow the plan issued by the BCJ " +
      "nutrition team for this age band.",
  },
  {
    code: "kg_50_60",
    title: "50 to 60 kg",
    minAge: 18,
    maxAge: null,
    minWeight: "50.00",
    maxWeight: "60.00",
    sortOrder: 2,
    plan: "Follow the approved BCJ diet plan for the 50–60 kg band.",
  },
  {
    code: "kg_60_75",
    title: "60 to 75 kg",
    minAge: 18,
    maxAge: null,
    minWeight: "60.00",
    maxWeight: "75.00",
    sortOrder: 3,
    plan: "Follow the approved BCJ diet plan for the 60–75 kg band.",
  },
  {
    code: "kg_75_90",
    title: "75 to 90 kg",
    minAge: 18,
    maxAge: null,
    minWeight: "75.00",
    maxWeight: "90.00",
    sortOrder: 4,
    plan: "Follow the approved BCJ diet plan for the 75–90 kg band.",
  },
  {
    code: "kg_90_plus",
    title: "90 kg and above",
    minAge: 18,
    maxAge: null,
    minWeight: "90.00",
    maxWeight: null,
    sortOrder: 5,
    plan: "Follow the approved BCJ diet plan for the 90 kg and above band.",
  },
];

/** Next Monday, so a seeded competition starts on a clean week boundary. */
function nextMonday(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 Sunday
  const delta = (8 - day) % 7 || 7;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + delta));
  return d.toISOString().slice(0, 10);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  /* ---- settings, single row ---- */
  const startDate = process.env.SEED_START_DATE ?? nextMonday();
  await db
    .insert(settings)
    .values({
      id: 1,
      startDate,
      totalWeeks: 12, // O-2: 84 days, maximum 1,200
      maxActiveWeek: 9, // O-1: C10 read as a phase label
      timezone: "Asia/Riyadh",
      submissionCutoff: "23:59", // O-4
      correctionDays: 3, // unused; see the note on the column in schema.ts
      missingScoresZero: true, // O-3
      rulesLocked: false,
    })
    .onConflictDoNothing();
  console.log(`settings: start date ${startDate}, 12 weeks, 9 active weeks`);

  /* ---- diet categories ---- */
  for (const category of DIET_CATEGORIES) {
    await db.insert(dietCategories).values(category).onConflictDoNothing();
  }
  console.log(`diet categories: ${DIET_CATEGORIES.length} rows ensured`);

  /* ---- first super admin ---- */
  const email = process.env.SEED_ADMIN_EMAIL;
  const name = process.env.SEED_ADMIN_NAME ?? "BCJ Administrator";

  if (!email) {
    console.log(
      "\nNo SEED_ADMIN_EMAIL set, so no admin was created.\n" +
        "Create the first one with:\n" +
        '  SEED_ADMIN_EMAIL="you@example.com" SEED_ADMIN_NAME="Your Name" npm run db:seed\n',
    );
  } else {
    const [existing] = await db
      .select({ id: admins.id, status: admins.status })
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);

    if (existing) {
      console.log(`admin ${email} already exists (${existing.status})`);
    } else {
      // Invited, not active. The invite link sets the password and enrols
      // TOTP in one step, which is the same path every later admin takes.
      const token = randomBytes(32).toString("base64url");
      const { hash } = await import("@node-rs/argon2");
      const tokenHash = await hash(token, {
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
        outputLen: 32,
      });

      await db.insert(admins).values({
        email,
        name,
        status: "invited",
        inviteTokenHash: tokenHash,
        inviteExpiresAt: sql`now() + interval '48 hours'`,
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://health.bcjed.com";
      console.log(
        `\nFirst super admin invited: ${email}\n` +
          `Open this link within 48 hours to set a password and enrol TOTP:\n\n` +
          `  ${appUrl}/admin/invite/${token}\n\n` +
          `Section 2.3 requires at least two super admin accounts. Invite the\n` +
          `second from /admin/accounts as soon as you are signed in.\n`,
      );
    }
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
