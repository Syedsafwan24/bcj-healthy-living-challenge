import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { pruneExpiredSessions } from "@/lib/auth/session";
import { pruneRateLimits } from "@/lib/auth/rate-limit";
import { lockAllEntries, sweepMissingDays } from "@/lib/close-out";
import { addDays, daysBetween, type IsoDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { competitionClock, getSettings } from "@/lib/settings";

/**
 * The nightly job — build specification section 8.2.
 *
 * One cron run per day, after the cutoff, in the settings timezone.
 *
 *   1. For each active participant with no submitted entry for a past
 *      scorable date, insert a `missing` entry with null inputs.
 *   2. Score those days at 0%, if `missing_scores_zero` is true.
 *   3. Lock every entry once an organiser has closed the competition.
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

  /* ---- how far the job is responsible ---- */

  // Yesterday and earlier: today's cutoff may not have passed yet. If it has,
  // today is included too.
  const lastClosedDay: IsoDate = clock.cutoffPassed
    ? clock.today
    : addDays(clock.today, -1);

  // Never past the end of the competition.
  const boundary =
    daysBetween(lastClosedDay, clock.lastDay) < 0
      ? clock.lastDay
      : lastClosedDay;

  if (daysBetween(settings.startDate as IsoDate, boundary) < 0) {
    return { ...base, ran: true, message: "No closed days yet." };
  }

  /* ---- 1 and 2: insert missing days and score them ---- */

  const sweep = await sweepMissingDays(settings, boundary);
  base.markedMissing = sweep.marked;
  base.participantsTouched = sweep.participantsTouched;
  base.weeksRecomputed = sweep.weeksRecomputed;

  if (base.markedMissing > 0) {
    await recordAudit({
      action: "entry.marked_missing",
      entityType: "daily_entry",
      newValue: `${base.markedMissing} days marked missing across ${sweep.participantsTouched} participants`,
      reason: settings.missingScoresZero
        ? "Nightly job: unrecorded days score 0% (open item O-3)"
        : "Nightly job: unrecorded days flagged, not scored",
      ip: null,
    });
  }

  /* ---- 3: lock every entry once an organiser has closed the competition ---- */

  // Not when the 12 weeks end. Days stay open past the last week so anyone
  // behind can still fill them in, and BCJ decides when that grace period is
  // over (see participantMayWrite). Until then there is nothing to lock.
  if (clock.closed) {
    base.locked = await lockAllEntries(clock.lastDay);

    if (base.locked > 0) {
      await recordAudit({
        action: "entry.locked",
        entityType: "daily_entry",
        newValue: `${base.locked} entries locked after ${clock.lastDay}`,
        reason: "Nightly job: the competition is closed, so days are now final",
        ip: null,
      });
    }
  }

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
