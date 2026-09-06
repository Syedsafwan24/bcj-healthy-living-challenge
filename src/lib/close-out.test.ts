import "@/db/load-env";
import { describe, expect, it } from "vitest";

/**
 * Closing the competition, against a real database.
 *
 * This is the code that decides what a participant's final score is: the sweep
 * writes a 0% day for everything nobody filled in, and the lock makes the
 * result final. Getting either wrong is not a display bug — it changes who
 * wins — so it is exercised against real tables rather than a mock.
 *
 * Three things are checked because each one has a way of going quietly wrong:
 * the sweep must skip days that already have a row (or it would erase them),
 * it must ignore withdrawn participants (or it would score people who left),
 * and locking must leave `missing` rows alone (or the record of who never
 * filled in a day is lost).
 *
 * Runs against a scratch database created and dropped here, so it never
 * touches the working data.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

const DB_NAME = "bcj_close_test";
const ALICE = "11111111-1111-1111-1111-111111111111";
const BILAL = "22222222-2222-2222-2222-222222222222";
const WITHDRAWN = "33333333-3333-3333-3333-333333333333";

suite("closing the competition", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  it("scores the gaps, locks the record, and can be undone", async () => {
    const postgres = (await import("postgres")).default;
    const base = process.env.DATABASE_URL!;
    const scratch = base.replace(/\/[^/?]+(\?|$)/, `/${DB_NAME}$1`);

    const root = postgres(base, { max: 1 });
    await root.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await root.unsafe(`CREATE DATABASE ${DB_NAME}`);
    await root.end();

    const sql = postgres(scratch, { max: 1 });
    try {
      const { readFileSync, readdirSync } = await import("node:fs");
      await sql.unsafe(readFileSync("src/db/bootstrap.sql", "utf8"));
      for (const f of readdirSync("drizzle").filter((x) => x.endsWith(".sql")).sort()) {
        for (const stmt of readFileSync(`drizzle/${f}`, "utf8").split("--> statement-breakpoint")) {
          if (stmt.trim()) await sql.unsafe(stmt);
        }
      }

      const person = (id: string, n: number, status: string) =>
        `('${id}', 'BCJ000${n}-TEST', 'Person ${n}', 'P${n}', 'p${n}@example.com',
          '+96650000000${n}', 30, 'male', '${status}')`;

      await sql.unsafe(`INSERT INTO participants (id, registration_id, full_name,
        display_name, email, mobile, age, gender, status) VALUES
        ${person(ALICE, 1, "active")},
        ${person(BILAL, 2, "active")},
        ${person(WITHDRAWN, 3, "withdrawn")}`);

      // Alice filled in the 1st and has a nightly-job "missing" row on the
      // 3rd. Everything else is a gap.
      await sql.unsafe(`INSERT INTO daily_entries
        (participant_id, entry_date, week_no, status, daily_points, max_points, daily_percentage)
        VALUES
        ('${ALICE}','2026-09-01',1,'submitted',10,10,100),
        ('${ALICE}','2026-09-03',1,'missing',0,10,0)`);

      process.env.DATABASE_URL = scratch;
      const { sweepMissingDays, lockAllEntries, unlockAllEntries } = await import(
        "@/lib/close-out"
      );

      const settings: any = {
        id: 1,
        startDate: "2026-09-01",
        totalWeeks: 12,
        maxActiveWeek: 9,
        timezone: "Asia/Riyadh",
        submissionCutoff: "23:59:00",
        correctionDays: 3,
        missingScoresZero: true,
        rulesLocked: false,
        closedAt: null,
      };

      /* ---- the sweep ---- */

      const sweep = await sweepMissingDays(settings, "2026-09-05" as any);

      // Five days, three participants. Alice is missing the 2nd, 4th and 5th;
      // Bilal all five; the withdrawn participant is not scored at all.
      expect(sweep.marked).toBe(8);
      expect(sweep.participantsTouched).toBe(2);

      const [{ count: withdrawnRows }] = await sql.unsafe(
        `SELECT count(*)::int FROM daily_entries WHERE participant_id = '${WITHDRAWN}'`,
      );
      expect(withdrawnRows).toBe(0);

      // The day Alice filled in keeps its score. A sweep that overwrote an
      // existing row would zero somebody's real day.
      const [alice1] = await sql.unsafe(
        `SELECT status, daily_percentage FROM daily_entries
         WHERE participant_id = '${ALICE}' AND entry_date = '2026-09-01'`,
      );
      expect(alice1.status).toBe("submitted");
      expect(Number(alice1.daily_percentage)).toBe(100);

      // Running it twice changes nothing, which is what lets the nightly job
      // and the close button both call it.
      const again = await sweepMissingDays(settings, "2026-09-05" as any);
      expect(again.marked).toBe(0);

      /* ---- locking ---- */

      const locked = await lockAllEntries("2026-11-24" as any);
      expect(locked).toBe(1);

      const [{ count: stillMissing }] = await sql.unsafe(
        `SELECT count(*)::int FROM daily_entries WHERE status = 'missing'`,
      );
      // The 9 unfilled days keep their status: 'missing' is the record that
      // nobody ever filled them in.
      expect(stillMissing).toBe(9);

      // Idempotent too — a second close locks nothing further.
      expect(await lockAllEntries("2026-11-24" as any)).toBe(0);

      /* ---- reopening ---- */

      expect(await unlockAllEntries()).toBe(1);
      const [{ count: anyLocked }] = await sql.unsafe(
        `SELECT count(*)::int FROM daily_entries WHERE status = 'locked'`,
      );
      expect(anyLocked).toBe(0);
    } finally {
      process.env.DATABASE_URL = base;
      await sql.end();
      const cleanup = postgres(base, { max: 1 });
      // @/db opens its own pool against the scratch database and holds it for
      // the life of the process, so the connection has to be closed from the
      // server side before the database can be dropped.
      await cleanup.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()`,
      );
      await cleanup.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
      await cleanup.end();
    }
  }, 60_000);
});
