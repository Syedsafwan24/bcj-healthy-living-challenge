import "@/db/load-env";
import { describe, expect, it } from "vitest";

/**
 * The missed-day count is the first thing a participant reads when they open
 * the app, so getting it wrong is either a false accusation or a silent gap.
 * Two rules matter most: today is never counted, because the day is not over,
 * and a "missing" row written by the nightly job counts as missed exactly as
 * an absent row does.
 *
 * Exercised against a scratch database, which is created and dropped here, so
 * it never touches the working data.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

suite("getMissedDays", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  it("counts elapsed days with nothing recorded, never today", async () => {
    const postgres = (await import("postgres")).default;
    const base = process.env.DATABASE_URL!;
    const scratch = base.replace(/\/[^/?]+(\?|$)/, "/bcj_missed_test$1");

    const root = postgres(base, { max: 1 });
    await root.unsafe(`DROP DATABASE IF EXISTS bcj_missed_test`);
    await root.unsafe(`CREATE DATABASE bcj_missed_test`);
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

      await sql.unsafe(`INSERT INTO participants (id, registration_id, full_name,
        display_name, email, mobile, age, gender, area_of_residence,
        residence_status, weight_kg, status)
        VALUES ('11111111-1111-1111-1111-111111111111', 'BCJ0001-TEST', 'Test One',
        'Tester', 'p@example.com', '+966500000000', 30, 'male', 'Jeddah',
        'family', 70, 'active')`);

      // Challenge starts 2026-09-01. "Today" is the 10th, so days 1..9 have
      // elapsed. Fill in three of them, and let the nightly job's "missing"
      // row stand for a fourth.
      await sql.unsafe(`INSERT INTO daily_entries
        (participant_id, entry_date, week_no, status, daily_points, max_points, daily_percentage)
        VALUES
        ('11111111-1111-1111-1111-111111111111','2026-09-01',1,'submitted',10,20,50),
        ('11111111-1111-1111-1111-111111111111','2026-09-02',1,'submitted',10,20,50),
        ('11111111-1111-1111-1111-111111111111','2026-09-08',2,'locked',10,20,50),
        ('11111111-1111-1111-1111-111111111111','2026-09-09',2,'missing',0,20,0),
        ('11111111-1111-1111-1111-111111111111','2026-09-10',2,'submitted',18,20,90)`);

      process.env.DATABASE_URL = scratch;
      const { getMissedDays } = await import("@/lib/queries");
      const settings: any = { startDate: "2026-09-01", totalWeeks: 12 };

      const result = await getMissedDays(settings, "11111111-1111-1111-1111-111111111111", "2026-09-10" as any);

      // Elapsed 1..9 = 9 days. Recorded and not "missing": the 1st, 2nd, 8th
      // = 3. The 10th is today and is excluded from both sides.
      expect(result.count).toBe(6);
      // The 9th holds a "missing" row, so it is the newest empty day.
      expect(result.lastMissed).toBe("2026-09-09");
    } finally {
      process.env.DATABASE_URL = base;
      await sql.end();
      const cleanup = postgres(base, { max: 1 });
      // @/db opens its own pool against the scratch database and holds it for
      // the life of the process, so the connection has to be closed from the
      // server side before the database can be dropped.
      await cleanup.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = 'bcj_missed_test' AND pid <> pg_backend_pid()`,
      );
      await cleanup.unsafe(`DROP DATABASE IF EXISTS bcj_missed_test`);
      await cleanup.end();
    }
  }, 60_000);
});
