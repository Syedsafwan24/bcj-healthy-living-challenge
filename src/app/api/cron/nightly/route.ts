import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, lt, ne } from "drizzle-orm";

import { db } from "@/db";
import { dailyEntries, participants } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { pruneExpiredSessions } from "@/lib/auth/session";
import { pruneRateLimits } from "@/lib/auth/rate-limit";
import { addDays, daysBetween, weekNoFor, type IsoDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { recomputeFinal, recomputeWeek, saveEntry } from "@/lib/scoring-save";
import { competitionClock, getSettings } from "@/lib/settings";

/**
 * The nightly job — build specification section 8.2.
 *
 * One cron run per day, after the cutoff, in the settings timezone.
 *
 *   1. For each active participant with no submitted entry for a past
 *      scorable date, insert a `missing` entry with null inputs.
 *   2. Score those days at 0%, if `missing_scores_zero` is true.
 *   3. Lock entries older than the correction window.
 *   4. Recompute the affected weekly and final scores.
 *
 * Alert if this job fails. A silent failure means missing days are never
 * scored (section 13).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface JobResult {
  ran: boolean;
  today: IsoDate;
  markedMissing: number;
  locked: number;
  participantsTouched: number;
  weeksRecomputed: number;
  sessionsPruned: number;
  message?: string;
}

async function runNightly(): Promise<JobResult> {
  const settings = await getSettings();
  const clock = competitionClock(settings);

  const base: JobResult = {
    ran: false,
    today: clock.today,
    markedMissing: 0,
    locked: 0,
    participantsTouched: 0,
    weeksRecomputed: 0,
    sessionsPruned: 0,
  };

  // Housekeeping runs whether or not the competition is on.
  base.sessionsPruned = await pruneExpiredSessions();
  await pruneRateLimits();

  if (!clock.started) {
    return { ...base, message: "The competition has not started." };
  }

  /* ---- the dates the job is responsible for ---- */

  // Yesterday and earlier: today's cutoff may not have passed yet. If it has,
  // today is included too.
  const lastClosedDay: IsoDate = clock.cutoffPassed
    ? clock.today
    : addDays(clock.today, -1);

  // Never past the end of the competition.
  const endOfCompetition = clock.lastDay;
  const boundary =
    daysBetween(lastClosedDay, endOfCompetition) < 0
      ? endOfCompetition
      : lastClosedDay;

  if (daysBetween(settings.startDate as IsoDate, boundary) < 0) {
    return { ...base, ran: true, message: "No closed days yet." };
  }

  const closedDates: IsoDate[] = [];
  for (
    let date = settings.startDate as IsoDate;
    daysBetween(date, boundary) >= 0;
    date = addDays(date, 1)
  ) {
    closedDates.push(date);
  }

  const active = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.status, "active"));

  if (active.length === 0) {
    return { ...base, ran: true, message: "No active participants." };
  }

  /* ---- 1 and 2: insert missing days and score them ---- */

  const existing = await db
    .select({
      participantId: dailyEntries.participantId,
      entryDate: dailyEntries.entryDate,
    })
    .from(dailyEntries)
    .where(inArray(dailyEntries.entryDate, closedDates));

  const have = new Set(
    existing.map((row) => `${row.participantId}|${row.entryDate}`),
  );

  const touched = new Set<string>();
  const weeksToRecompute = new Set<string>();

  for (const participant of active) {
    for (const date of closedDates) {
      if (have.has(`${participant.id}|${date}`)) continue;

      // A `missing` row with null inputs. `saveEntry` scores it through the
      // same pure function as any other day, using the entry's own date, so
      // its maximum is that week's maximum and its percentage is 0.
      await saveEntry(settings, {
        participantId: participant.id,
        entryDate: date,
        status: "missing",
      });

      base.markedMissing += 1;
      touched.add(participant.id);
      weeksToRecompute.add(
        `${participant.id}|${weekNoFor(settings.startDate as IsoDate, date)}`,
      );
    }
  }

  if (base.markedMissing > 0) {
    await recordAudit({
      action: "entry.marked_missing",
      entityType: "daily_entry",
      newValue: `${base.markedMissing} days marked missing across ${touched.size} participants`,
      reason: settings.missingScoresZero
        ? "Nightly job: unrecorded days score 0% (open item O-3)"
        : "Nightly job: unrecorded days flagged, not scored",
      ip: null,
    });
  }

  /* ---- 3: lock every entry once the challenge is over ---- */

  // Participants may fill in and correct any day of the challenge right up to
  // the last day of week 12 (see participantMayWrite). So there is no rolling
  // window to lock behind: entries close all at once, when the 12 weeks end.
  if (clock.finished) {
    const lockedRows = await db
      .update(dailyEntries)
      .set({ status: "locked" })
      .where(
        and(
          lt(dailyEntries.entryDate, addDays(clock.lastDay, 1)),
          ne(dailyEntries.status, "locked"),
          ne(dailyEntries.status, "missing"),
        ),
      )
      .returning({ id: dailyEntries.id });

    base.locked = lockedRows.length;

    if (base.locked > 0) {
      await recordAudit({
        action: "entry.locked",
        entityType: "daily_entry",
        newValue: `${base.locked} entries locked after ${clock.lastDay}`,
        reason: "Nightly job: the 12 weeks have ended, so days are now final",
        ip: null,
      });
    }
  }

  /* ---- 4: recompute the affected weeks and finals ---- */
  // saveEntry already rolled each written day up through its week and final
  // score. This pass covers weeks that changed only because a day was locked,
  // and makes the job idempotent.

  await db.transaction(async (tx) => {
    for (const key of weeksToRecompute) {
      const [participantId, weekNo] = key.split("|");
      await recomputeWeek(tx, settings, participantId, Number(weekNo));
      base.weeksRecomputed += 1;
    }
    for (const participantId of touched) {
      await recomputeFinal(tx, settings, participantId);
    }
  });

  base.participantsTouched = touched.size;
  base.ran = true;
  return base;
}

/**
 * Vercel Cron sends a GET with the CRON_SECRET as a bearer token. POST is
 * accepted too so the job can be triggered by hand during a deployment check.
 */
async function handle(request: NextRequest) {
  const authorisation = request.headers.get("authorization");
  const provided =
    authorisation?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("secret") ??
    "";

  if (!provided || provided !== env.cronSecret) {
    // No detail, so the endpoint cannot be probed for a valid secret.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await runNightly();
    console.info("[cron] nightly", result);
    return NextResponse.json(result);
  } catch (error) {
    // A silent failure means missing days are never scored, so this is loud.
    console.error("[cron] nightly FAILED", error);
    return NextResponse.json(
      { error: "The nightly job failed", detail: String(error) },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
