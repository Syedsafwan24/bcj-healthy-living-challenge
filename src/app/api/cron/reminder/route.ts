import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { dailyEntries, participants } from "@/db/schema";
import { env } from "@/lib/env";
import { formatIsoDateLong, type IsoDate } from "@/lib/dates";
import {
  blockIsClosingNow,
  daysUntilBlockCloses,
  entryBlocks,
} from "@/lib/entry-blocks";
import { sendPushToParticipants } from "@/lib/push";
import { competitionClock, getSettings } from "@/lib/settings";

/**
 * The evening reminder.
 *
 * One run a day, a few hours before the cutoff, notifying the participants
 * who have not filled in today. It is deliberately separate from the nightly
 * job: that one runs *after* the cutoff and closes the day, which is far too
 * late to be useful as a nudge, and a job that scores days should not also be
 * the job that sends notifications — a delivery failure must never leave
 * scoring half done.
 *
 * It nudges by browser notification only. BCJ dropped the daily reminder
 * email (10 September 2026): a message every evening for twelve weeks is how
 * a sending domain ends up in spam folders, and it would have taken the
 * registration mail with it.
 *
 * Nobody who has already filled in today hears from it, so keeping up means
 * silence. Nothing is sent before the challenge starts or after it ends.
 *
 * During a four-week block's catch-up week it changes its tune. Those days
 * stop being fixable when the deadline passes, so the reminder leads with the
 * deadline — the one night it is worth interrupting somebody who is otherwise
 * up to date.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ReminderResult {
  ran: boolean;
  today: string;
  weekNo: number | null;
  candidates: number;
  /** Browser notifications, counted per device rather than per person. */
  pushed: number;
  pushFailed: number;
  pushRemoved: number;
  /** The block being caught up, when this is a catch-up week. */
  closingBlock?: string;
  message?: string;
}

async function runReminder(): Promise<ReminderResult> {
  const settings = await getSettings();
  const clock = competitionClock(settings);

  const base: ReminderResult = {
    ran: false,
    today: clock.today,
    weekNo: clock.currentWeek,
    candidates: 0,
    pushed: 0,
    pushFailed: 0,
    pushRemoved: 0,
  };

  // Nothing after the last day of week 12. Days stay open into the grace
  // period before an organiser closes the competition, but a nudge to fill in
  // "today" makes no sense once there are no more days to fill in.
  if (!clock.started || clock.weeksOver) {
    return { ...base, message: "The challenge is not running." };
  }

  // Everyone still competing.
  const people = await db
    .select({
      id: participants.id,
    })
    .from(participants)
    .where(eq(participants.status, "active"));

  if (people.length === 0) {
    return { ...base, ran: true, message: "Nobody to remind." };
  }

  // One query for the whole roster rather than one per participant. A
  // "missing" row is one the nightly job wrote for an unrecorded day, so it
  // does not count as filled in.
  const filledToday = await db
    .select({ participantId: dailyEntries.participantId })
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.entryDate, clock.today),
        ne(dailyEntries.status, "missing"),
        inArray(
          dailyEntries.participantId,
          people.map((p) => p.id),
        ),
      ),
    );

  const done = new Set(filledToday.map((r) => r.participantId));
  const outstanding = people.filter((p) => !done.has(p.id));
  base.candidates = outstanding.length;

  // Weeks 1–4 are caught up during week 5, weeks 5–8 during week 9. In one of
  // those weeks the reminder is a deadline warning rather than a nudge.
  const closingBlock =
    entryBlocks(clock.firstDay, settings.totalWeeks).find((block) =>
      blockIsClosingNow(block, clock.today),
    ) ?? null;
  const daysLeft = closingBlock
    ? (daysUntilBlockCloses(closingBlock, clock.today) ?? 0)
    : 0;
  if (closingBlock) base.closingBlock = closingBlock.label;

  // The nudge goes to any device that has allowed notifications. It carries
  // no score, because a notification is readable on a locked screen.
  const push = await sendPushToParticipants(
    outstanding.map((p) => p.id),
    closingBlock && closingBlock.closesAfter
      ? {
          title: `${closingBlock.label} close in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          // No personal count here: a notification is readable on a locked
          // screen, so it says what is closing and when, and nothing about
          // how far behind this particular person is.
          body: `Fill in any empty days from ${closingBlock.label.toLowerCase()} before ${formatIsoDateLong(closingBlock.closesAfter as IsoDate)}. After that they score 0%.`,
          url: "/app/history",
        }
      : {
          title: "Fill in today",
          body: `Week ${clock.currentWeek ?? 1} — your day is still empty. It takes under a minute.`,
          url: "/app",
        },
  );
  base.pushed = push.sent;
  base.pushFailed = push.failed;
  base.pushRemoved = push.removed;

  base.ran = true;
  return base;
}

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
    const result = await runReminder();
    console.info("[cron] reminder", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron] reminder FAILED", error);
    return NextResponse.json(
      { error: "The reminder job failed", detail: String(error) },
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
