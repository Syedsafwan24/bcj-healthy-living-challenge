/**
 * Demo data for local development and UAT (specification section 12, P7).
 *
 *   npx tsx scripts/demo-seed.ts          create demo participants and entries
 *   npx tsx scripts/demo-seed.ts --clean  remove them again
 *
 * Everything it creates is marked with the email domain below, so --clean can
 * find it. Never run this against production.
 */

import "../src/db/load-env";

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, sql } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { addDays, daysBetween, todayInZone, type IsoDate } from "../src/lib/dates";
import { buildRegistrationId } from "../src/lib/registration-id";
import { scoreEntry, weeklyPercentage, finalScore as sumWeeks, finalPercentage } from "../src/lib/scoring";

const DEMO_DOMAIN = "@bcj-demo.invalid";

const PEOPLE = [
  { name: "Abdul Rahman Khan", display: "Abdul R.", age: 34, weight: 82, area: "Al Rawdah", gender: "male", consistency: 0.95 },
  { name: "Fatima Siddiqui", display: "Fatima S.", age: 29, weight: 61, area: "Al Salamah", gender: "female", consistency: 0.9 },
  { name: "Imran Bhatkali", display: "Imran B.", age: 41, weight: 94, area: "Al Hamra", gender: "male", consistency: 0.7 },
  { name: "Ayesha Noor", display: "Ayesha N.", age: 26, weight: 55, area: "Al Andalus", gender: "female", consistency: 0.85 },
  { name: "Yusuf Kola", display: "Yusuf K.", age: 15, weight: 48, area: "Al Rawdah", gender: "male", consistency: 0.6 },
  { name: "Zainab Muhammed", display: "Zainab M.", age: 38, weight: 71, area: "Al Salamah", gender: "female", consistency: 0.98 },
];

/** Deterministic pseudo-randomness, so repeated runs give the same demo. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  const clean = process.argv.includes("--clean");

  const existing = await db
    .select({ id: schema.participants.id })
    .from(schema.participants)
    .where(sql`${schema.participants.email}::text LIKE ${"%" + DEMO_DOMAIN}`);

  if (existing.length > 0) {
    const ids = existing.map((r) => r.id);
    await db.execute(
      sql`UPDATE audit_log SET actor_participant_id = NULL WHERE actor_participant_id = ANY(${sql.raw(
        `ARRAY[${ids.map((id) => `'${id}'::uuid`).join(",")}]`,
      )})`,
    );
    await db
      .delete(schema.participants)
      .where(inArray(schema.participants.id, ids));
    console.log(`removed ${existing.length} demo participants`);
  }

  if (clean) {
    // Hand the serial numbers back. nextval() is not transactional, so the
    // numbers this script consumed are otherwise lost forever and the next
    // real participant would be numbered #13 rather than #1.
    await db.execute(
      sql`SELECT setval('participant_seq',
            COALESCE((SELECT MAX(seq_no) FROM participants), 0) + 1, false)`,
    );
    console.log("participant numbering reset");
    await client.end();
    return;
  }

  const [settings] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1));
  if (!settings) throw new Error("No settings row. Run `npm run db:seed` first.");

  const categories = await db.select().from(schema.dietCategories);
  const startDate = settings.startDate as IsoDate;
  const today = todayInZone(settings.timezone);

  // Fill every closed day up to yesterday.
  const lastDay = addDays(today, -1);
  const dayCount = Math.max(0, daysBetween(startDate, lastDay) + 1);

  for (const [index, person] of PEOPLE.entries()) {
    const random = seeded(index * 7919 + 13);

    const category =
      person.age <= 17
        ? categories.find((c) => c.code === "kids_10_17")
        : categories.find((c) => {
            const min = c.minWeight === null ? -Infinity : Number(c.minWeight);
            const max = c.maxWeight === null ? Infinity : Number(c.maxWeight);
            return c.code !== "kids_10_17" && person.weight >= min && person.weight < max;
          });

    const [seq] = (await db.execute(
      sql`SELECT nextval('participant_seq')::int AS seq_no`,
    )) as unknown as Array<{ seq_no: number }>;

    const [participant] = await db
      .insert(schema.participants)
      .values({
        registrationId: buildRegistrationId(seq.seq_no, person.name),
        seqNo: seq.seq_no,
        email: `${person.display.toLowerCase().replace(/[^a-z]/g, "")}${DEMO_DOMAIN}`,
        fullName: person.name,
        displayName: person.display,
        mobile: `+9665${String(10000000 + index).slice(0, 8)}`,
        age: person.age,
        gender: person.gender,
        areaOfResidence: person.area,
        residenceStatus: index % 2 === 0 ? "family" : "bachelor",
        heightCm: String(160 + index * 3),
        weightKg: String(person.weight),
        startingWeightKg: String(person.weight + 2),
        dietCategoryId: category?.id ?? null,
        status: "active",
      })
      .returning({ id: schema.participants.id, registrationId: schema.participants.registrationId });

    await db.insert(schema.participantHealth).values({
      participantId: participant.id,
      bloodGroup: ["A+", "B+", "O+", "AB+"][index % 4],
      bloodPressure: `${115 + index}/${75 + (index % 5)}`,
      diabetesStatus: index === 2 ? "diagnosed" : "no",
      bloodSugar: index === 2 ? "142 mg/dL" : "",
    });

    /* ---- daily entries ---- */
    const percentagesByWeek = new Map<number, number[]>();

    for (let offset = 0; offset < dayCount; offset += 1) {
      const entryDate = addDays(startDate, offset);
      const weekNo = Math.floor(offset / 7) + 1;

      // Some days are simply not logged, which is what makes the missing-day
      // rule visible on the screens.
      if (random() > person.consistency) continue;

      const quality = 0.55 + random() * 0.45;
      const inputs = {
        waterLitres: Math.round((1.5 + quality * 1.4) * 4) / 4,
        steps: Math.round((5000 + quality * 6500) / 100) * 100,
        sleepHours: Math.round((5.5 + quality * 3) * 2) / 2,
        c3CookAtHome: random() < quality,
        c4NoSugary: random() < quality,
        c5Vegetables: random() < quality,
        c6NoLateFood: random() < quality * 0.9,
        c8Mindfulness: random() < quality * 0.8,
        c9ScreenTime: random() < quality * 0.75,
        breakfast: random() < quality,
        midMorning: random() < quality * 0.8,
        lunch: random() < quality,
        eveningSnack: random() < quality * 0.85,
        dinner: random() < quality,
      };

      const score = scoreEntry(
        {
          startDate,
          totalWeeks: settings.totalWeeks,
          maxActiveWeek: settings.maxActiveWeek,
        },
        inputs,
        entryDate,
      );

      await db.insert(schema.dailyEntries).values({
        participantId: participant.id,
        entryDate,
        weekNo: score.weekNo,
        waterLitres: String(inputs.waterLitres),
        steps: inputs.steps,
        sleepHours: String(inputs.sleepHours),
        c3CookAtHome: inputs.c3CookAtHome,
        c4NoSugary: inputs.c4NoSugary,
        c5Vegetables: inputs.c5Vegetables,
        c6NoLateFood: inputs.c6NoLateFood,
        c8Mindfulness: inputs.c8Mindfulness,
        c9ScreenTime: inputs.c9ScreenTime,
        breakfast: inputs.breakfast,
        midMorning: inputs.midMorning,
        lunch: inputs.lunch,
        eveningSnack: inputs.eveningSnack,
        dinner: inputs.dinner,
        dailyPoints: score.dailyPoints,
        maxPoints: score.maxPoints,
        dailyPercentage: String(score.dailyPercentage),
        status: "submitted",
        submittedAt: new Date(`${entryDate}T20:00:00Z`),
        computedAt: new Date(),
      });

      const list = percentagesByWeek.get(weekNo) ?? [];
      list.push(score.dailyPercentage);
      percentagesByWeek.set(weekNo, list);
    }

    /* ---- weekly and final, the same arithmetic as scoring-save ---- */
    const weeklyValues: number[] = [];
    for (let weekNo = 1; weekNo <= settings.totalWeeks; weekNo += 1) {
      const list = percentagesByWeek.get(weekNo) ?? [];
      const percentage = weeklyPercentage(list, 7);
      weeklyValues.push(percentage);

      if (list.length > 0) {
        await db.insert(schema.weeklyScores).values({
          participantId: participant.id,
          weekNo,
          percentage: String(percentage),
          daysCounted: list.length,
        });
      }
    }

    const score = sumWeeks(weeklyValues);
    await db.insert(schema.finalScores).values({
      participantId: participant.id,
      finalScore: String(score),
      finalPercentage: String(finalPercentage(score, settings.totalWeeks)),
    });

    console.log(
      `${person.name.padEnd(22)} ${participant.registrationId}  final ${score.toFixed(1)}`,
    );
  }

  console.log(
    `\n${PEOPLE.length} demo participants created, ${dayCount} days of the competition filled.\n` +
      `Sign in with any registration ID above. Remove them with:\n` +
      `  npx tsx scripts/demo-seed.ts --clean\n`,
  );

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
