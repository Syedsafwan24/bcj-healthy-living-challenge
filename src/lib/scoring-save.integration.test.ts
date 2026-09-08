/**
 * Integration tests — build specification section 4.8, the checks that need a
 * database:
 *
 *   "Also test that a date before the start date is rejected, that a second
 *    record for the same participant and date is impossible, and that an
 *    admin correction recomputes the day, the week and the final score
 *    together."
 *
 * These run against the database in DATABASE_URL and clean up after
 * themselves. They are skipped when no database is configured, so
 * `npm test` still passes on a machine with no Postgres.
 *
 *   npm run test:integration
 */

import "@/db/load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

suite("scoring-save against the database", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let saveEntry: any;
  let recomputeParticipant: any;
  let settingsRow: any;
  let participantId: string;
  let addDays: (d: string, n: number) => string;

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    ({ saveEntry, recomputeParticipant } = await import("@/lib/scoring-save"));
    ({ addDays } = await import("@/lib/dates"));

    const { getSettings } = await import("@/lib/settings");
    settingsRow = await getSettings();

    // A throwaway participant, removed in afterAll. The registration ID is
    // suffixed so repeated runs cannot collide on the UNIQUE constraint.
    const stamp = Date.now().toString(36).toUpperCase().slice(-4);
    const [row] = await db
      .insert(schema.participants)
      .values({
        registrationId: `BCJ9999-${stamp}`,
        seqNo: 9999,
        email: "integration-test@example.invalid",
        fullName: "Integration Test",
        displayName: "Integration Test",
        mobile: "+966500000000",
        age: 30,
        category: "male",
        areaOfResidence: "Test",
        residenceStatus: "family",
        weightKg: "70.00",
        status: "active",
      })
      .returning({ id: schema.participants.id });

    participantId = row.id;
  });

  afterAll(async () => {
    if (participantId) {
      // audit_log holds a FK to participants and is append-only for the
      // application role, so those rows are detached rather than deleted.
      await db.execute(
        sql`UPDATE audit_log SET actor_participant_id = NULL WHERE actor_participant_id = ${participantId}`,
      );
      await db
        .delete(schema.participants)
        .where(eq(schema.participants.id, participantId));
    }
  });

  it("writes the day, the week and the final score in one transaction", async () => {
    // Week 2, day 1. Water 2.0 L, steps 7,400, diet 4 of 5 — specification
    // vector T2, which prints 23 / 30. Only steps depart from it now, because
    // they award a fraction of a point.
    const entryDate = addDays(settingsRow.startDate, 7);

    const saved = await saveEntry(settingsRow, {
      participantId,
      entryDate,
      waterLitres: 2.0,
      steps: 7400,
      breakfast: true,
      midMorning: true,
      lunch: true,
      eveningSnack: true,
      dinner: false,
    });

    expect(saved.weekNo).toBe(2);
    // 8 water + 7.4 steps + 8 diet. Steps earn 7.4, not the 7 the printed
    // vector assumed — partial credit, steps only.
    expect(saved.dailyPoints).toBe(23.4);
    expect(saved.maxPoints).toBe(30);
    expect(saved.dailyPercentage).toBe(78.0);

    // One day of 78.0 across a seven-day week.
    expect(saved.weekPercentage).toBe(11.1429);
    expect(saved.finalScore).toBe(11.1429);

    // The three calculated columns are on the row, and no endpoint wrote them.
    const [stored] = await db
      .select()
      .from(schema.dailyEntries)
      .where(
        and(
          eq(schema.dailyEntries.participantId, participantId),
          eq(schema.dailyEntries.entryDate, entryDate),
        ),
      );

    expect(stored.weekNo).toBe(2);
    // Stored as numeric, so it comes back a fixed-scale string.
    expect(Number(stored.dailyPoints)).toBe(23.4);
    expect(stored.maxPoints).toBe(30);
    expect(Number(stored.dailyPercentage)).toBe(78.0);
    expect(stored.status).toBe("submitted");
  });

  it("cannot store a second record for the same participant and date", async () => {
    const entryDate = addDays(settingsRow.startDate, 7);

    // The UNIQUE (participant_id, entry_date) constraint plus
    // ON CONFLICT DO UPDATE means a resubmission updates rather than
    // duplicates — section 11.
    await saveEntry(settingsRow, {
      participantId,
      entryDate,
      waterLitres: 2.5,
      steps: 10000,
      breakfast: true,
      midMorning: true,
      lunch: true,
      eveningSnack: true,
      dinner: true,
    });

    const rows = await db
      .select()
      .from(schema.dailyEntries)
      .where(
        and(
          eq(schema.dailyEntries.participantId, participantId),
          eq(schema.dailyEntries.entryDate, entryDate),
        ),
      );

    expect(rows).toHaveLength(1);
    // 10 water + 10 steps + 10 diet, and the resubmission replaced the
    // earlier answers rather than adding a second row.
    expect(Number(rows[0].dailyPoints)).toBe(30);

    // A direct insert bypassing ON CONFLICT is refused by the constraint.
    await expect(
      db.insert(schema.dailyEntries).values({
        participantId,
        entryDate,
        weekNo: 2,
      }),
    ).rejects.toThrow();
  });

  it("refuses a negative input at the database level as well as in Zod", async () => {
    const entryDate = addDays(settingsRow.startDate, 8);
    await expect(
      db.insert(schema.dailyEntries).values({
        participantId,
        entryDate,
        weekNo: 2,
        waterLitres: "-1.00",
      }),
    ).rejects.toThrow();
  });

  it("rejects a date before the start date", async () => {
    const { isScorableDate } = await import("@/lib/dates");
    const beforeStart = addDays(settingsRow.startDate, -1);

    expect(
      isScorableDate(settingsRow.startDate, settingsRow.totalWeeks, beforeStart),
    ).toBe(false);

    // The participant path refuses it too, rather than relying on the caller.
    //
    // Which refusal comes back depends on the live settings row: once the
    // challenge is running the date is simply out of range, but while the
    // start date is still in the future the earlier "not started" guard fires
    // first. Both are correct refusals, so assert the refusal rather than
    // pinning the test to whatever start date the database happens to hold.
    const { participantMayWrite } = await import("@/lib/settings");
    const permission = participantMayWrite(settingsRow, beforeStart);
    expect(permission.allowed).toBe(false);
    expect(["outside_competition", "not_started"]).toContain(permission.reason);
  });

  it("scores a correction against the entry's own week, not today's", async () => {
    // Vector T9 at the persistence layer. The row belongs to week 2; the
    // correction happens now, whatever week the competition is in.
    const entryDate = addDays(settingsRow.startDate, 9);

    const saved = await saveEntry(settingsRow, {
      participantId,
      entryDate,
      waterLitres: 2.0,
      steps: 7400,
      // Values for challenges that are not yet active in week 2. They must be
      // ignored: the maximum stays at 30, not 100.
      c3CookAtHome: true,
      c4NoSugary: true,
      c5Vegetables: true,
      sleepHours: 8,
      c8Mindfulness: true,
      c9ScreenTime: true,
      breakfast: true,
      midMorning: true,
      lunch: true,
      eveningSnack: true,
      dinner: false,
    });

    expect(saved.weekNo).toBe(2);
    expect(saved.maxPoints).toBe(30);
    expect(saved.dailyPoints).toBe(23.4);
    expect(saved.dailyPercentage).toBe(78.0);
  });

  it("divides a week by seven whatever the retired setting says", async () => {
    // A day nobody fills in scores 0% and the week is always divided by seven.
    // That was a toggle until 7 September 2026, when BCJ built it in — so the
    // settings row is deliberately handed the *old* value here. If anything
    // still read the column, three perfect days would average 100% instead of
    // 42.8571%, and filling in fewer days would beat filling in more.
    const week = 6;
    const first = addDays(settingsRow.startDate, (week - 1) * 7);

    for (let day = 0; day < 3; day += 1) {
      await saveEntry(settingsRow, {
        participantId,
        entryDate: addDays(first, day),
        // Week 6 has six challenges plus diet, so this is a perfect day.
        waterLitres: 2.5,
        steps: 10000,
        c3CookAtHome: true,
        c4NoSugary: true,
        c5Vegetables: true,
        c5VegetablesDinner: true,
        c6NoLateFood: true,
        breakfast: true,
        midMorning: true,
        lunch: true,
        eveningSnack: true,
        dinner: true,
      });
    }

    const ignored = { ...settingsRow, missingScoresZero: false };
    const { days } = await recomputeParticipant(ignored, participantId);
    expect(days).toBeGreaterThan(0);

    const [stored] = await db
      .select()
      .from(schema.weeklyScores)
      .where(
        and(
          eq(schema.weeklyScores.participantId, participantId),
          eq(schema.weeklyScores.weekNo, week),
        ),
      );

    // Three days at 100% out of seven, not three out of three.
    expect(Number(stored.percentage)).toBe(42.8571);
    expect(stored.daysCounted).toBe(3);
  });

  it("recomputing a participant leaves every stored score unchanged", async () => {
    const before = await db
      .select()
      .from(schema.finalScores)
      .where(eq(schema.finalScores.participantId, participantId));

    const result = await recomputeParticipant(settingsRow, participantId);

    const after = await db
      .select()
      .from(schema.finalScores)
      .where(eq(schema.finalScores.participantId, participantId));

    // Recomputation reads the same raw inputs through the same pure function,
    // so it is idempotent. If this ever fails, a screen and an export have
    // started to disagree.
    expect(Number(after[0].finalScore)).toBe(Number(before[0].finalScore));
    expect(result.days).toBeGreaterThan(0);
  });

  it("a missing day scores 0 against that week's full maximum", async () => {
    // Week 4: four challenges are active, plus the 10 diet points.
    const entryDate = addDays(settingsRow.startDate, 21);

    const saved = await saveEntry(settingsRow, {
      participantId,
      entryDate,
      status: "missing",
    });

    expect(saved.weekNo).toBe(4);
    expect(saved.dailyPoints).toBe(0);
    expect(saved.maxPoints).toBe(50); // vector T6: four challenges plus diet
    expect(saved.dailyPercentage).toBe(0);
  });
});
