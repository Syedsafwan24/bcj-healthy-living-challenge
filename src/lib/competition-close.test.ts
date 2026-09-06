import "@/db/load-env";
import { describe, expect, it } from "vitest";

import type { Settings } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";

/**
 * When a participant may write, now that closing is a decision rather than a
 * date.
 *
 * Two different deadlines can shut a day and they are easy to confuse. Each
 * four-week block closes on its own date, a week after the block ends; the
 * final block has no such date and waits for the organisers. The daily cutoff
 * shuts nothing at all, because a participant locked out at 23:59 could write
 * the same date the next morning anyway.
 *
 * The arithmetic of the block dates themselves lives in entry-blocks.test.ts.
 * What is tested here is which of them wins, and what a participant is told.
 *
 * Pure date arithmetic against a settings row built here, so it needs no
 * database. `@/lib/settings` reaches for one at import time, hence the env
 * load above and the skip when there is none configured.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

/** 12 weeks from Friday 19 June 2026 — the season BCJ has configured. */
const START = "2026-06-19";
const LAST_DAY = "2026-09-10" as IsoDate;

function settingsRow(closedAt: Date | null = null): Settings {
  return {
    id: 1,
    startDate: START,
    totalWeeks: 12,
    maxActiveWeek: 9,
    timezone: "Asia/Riyadh",
    submissionCutoff: "23:59:00",
    correctionDays: 3,
    missingScoresZero: true,
    rulesLocked: false,
    closedAt,
  };
}

/** Midday in Riyadh, so no test turns on which side of midnight UTC it is. */
function noonOn(date: string): Date {
  return new Date(`${date}T09:00:00Z`);
}

suite("participantMayWrite", () => {
  it("keeps a block open through its catch-up week and shuts it after", async () => {
    const { participantMayWrite } = await import("@/lib/settings");
    const row = settingsRow();

    // A day in week 1. Weeks 1–4 are caught up during week 5, which runs to
    // 23 July.
    const week1 = "2026-06-20" as IsoDate;

    // Week 5, the last day of the catch-up week: still open.
    expect(participantMayWrite(row, week1, noonOn("2026-07-23")).allowed).toBe(
      true,
    );

    // Week 6, the morning after: gone.
    const shut = participantMayWrite(row, week1, noonOn("2026-07-24"));
    expect(shut.allowed).toBe(false);
    expect(shut.reason).toBe("block_closed");
    expect(shut.block?.label).toBe("Weeks 1–4");
  });

  it("shuts one block without touching the next", async () => {
    const { participantMayWrite } = await import("@/lib/settings");
    const row = settingsRow();
    const inWeek6 = noonOn("2026-07-27");

    // Weeks 1–4 have closed; week 5, in the next block, is still open.
    expect(
      participantMayWrite(row, "2026-07-10" as IsoDate, inWeek6).reason,
    ).toBe("block_closed");
    expect(
      participantMayWrite(row, "2026-07-20" as IsoDate, inWeek6).allowed,
    ).toBe(true);
  });

  it("leaves the final block open after the 12 weeks, for the organisers to close", async () => {
    const { participantMayWrite } = await import("@/lib/settings");
    const row = settingsRow();
    const aFortnightLate = noonOn("2026-09-24");

    // Weeks 9–12 have no week 13 to be caught up in, so they stay writable
    // until somebody closes the competition.
    expect(participantMayWrite(row, LAST_DAY, aFortnightLate).allowed).toBe(
      true,
    );
    expect(
      participantMayWrite(row, "2026-08-14" as IsoDate, aFortnightLate).allowed,
    ).toBe(true);

    // The earlier blocks are long gone by then.
    expect(
      participantMayWrite(row, "2026-06-20" as IsoDate, aFortnightLate).reason,
    ).toBe("block_closed");
  });

  it("names the block and the date it closed", async () => {
    const { participantMayWrite, refusalMessage } = await import(
      "@/lib/settings"
    );
    const row = settingsRow();

    const permission = participantMayWrite(
      row,
      "2026-06-20" as IsoDate,
      noonOn("2026-07-30"),
    );
    const message = refusalMessage(permission, row);
    expect(message).toContain("Weeks 1–4");
    expect(message).toContain("23 July 2026");
  });

  it("refuses everything once the competition is closed", async () => {
    const { participantMayWrite } = await import("@/lib/settings");
    const row = settingsRow(new Date("2026-09-20T10:00:00Z"));

    // Closing the competition takes precedence over the block deadline, so a
    // participant is told about the decision rather than a date that has
    // nothing to do with why the day is shut.
    const permission = participantMayWrite(
      row,
      "2026-06-20" as IsoDate,
      noonOn("2026-09-24"),
    );
    expect(permission.allowed).toBe(false);
    expect(permission.reason).toBe("competition_closed");

    const stillInsideAnOpenBlock = participantMayWrite(
      row,
      LAST_DAY,
      noonOn("2026-09-24"),
    );
    expect(stillInsideAnOpenBlock.reason).toBe("competition_closed");
  });

  it("never lets the grace period extend the challenge itself", async () => {
    const { participantMayWrite } = await import("@/lib/settings");
    const row = settingsRow();

    // The day after week 12. It is in the past, and the competition is open,
    // and it still is not scorable — the grace period buys time to fill in the
    // past, not extra days to compete on.
    const permission = participantMayWrite(
      row,
      "2026-09-11" as IsoDate,
      noonOn("2026-09-24"),
    );
    expect(permission.allowed).toBe(false);
    expect(permission.reason).toBe("outside_competition");
  });

  it("still refuses a day that has not happened yet", async () => {
    const { participantMayWrite } = await import("@/lib/settings");
    const row = settingsRow();

    const permission = participantMayWrite(
      row,
      "2026-07-01" as IsoDate,
      noonOn("2026-06-25"),
    );
    expect(permission.allowed).toBe(false);
    expect(permission.reason).toBe("future_date");
  });

  it("no longer refuses the last day after the daily cutoff", async () => {
    const { participantMayWrite } = await import("@/lib/settings");
    const row = settingsRow();

    // 23:30 Riyadh on the final day, half an hour before the cutoff, and again
    // after it. Neither is refused: the cutoff governs the nightly job, and
    // the same date stays writable tomorrow regardless.
    const before = participantMayWrite(
      row,
      LAST_DAY,
      new Date("2026-09-10T20:30:00Z"),
    );
    const after = participantMayWrite(
      row,
      LAST_DAY,
      new Date("2026-09-10T21:00:00Z"),
    );
    expect(before.allowed).toBe(true);
    expect(after.allowed).toBe(true);
  });
});

suite("competitionClock", () => {
  it("separates the weeks being over from the competition being closed", async () => {
    const { competitionClock } = await import("@/lib/settings");

    const during = competitionClock(settingsRow(), noonOn("2026-07-01"));
    expect(during.weeksOver).toBe(false);
    expect(during.closed).toBe(false);
    expect(during.currentWeek).toBe(2);

    const grace = competitionClock(settingsRow(), noonOn("2026-09-15"));
    expect(grace.weeksOver).toBe(true);
    expect(grace.closed).toBe(false);
    expect(grace.currentWeek).toBeNull();

    const shut = competitionClock(
      settingsRow(new Date("2026-09-20T10:00:00Z")),
      noonOn("2026-09-24"),
    );
    expect(shut.weeksOver).toBe(true);
    expect(shut.closed).toBe(true);
  });

  it("can be closed before the 12 weeks are over", async () => {
    const { competitionClock } = await import("@/lib/settings");

    const clock = competitionClock(
      settingsRow(new Date("2026-07-01T10:00:00Z")),
      noonOn("2026-07-02"),
    );
    expect(clock.weeksOver).toBe(false);
    expect(clock.closed).toBe(true);
    expect(clock.lastDay).toBe(LAST_DAY);
  });
});
