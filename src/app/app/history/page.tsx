import Link from "next/link";
import { Lock } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { requireParticipant } from "@/lib/auth/guards";
import { datesInWeek, formatIsoDateLong, type IsoDate } from "@/lib/dates";
import { getEntriesBetween, getWeeklyScores } from "@/lib/queries";
import {
  competitionClock,
  getSettings,
  participantMayWrite,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "History", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/history` — every day of the challenge on one screen.
 *
 * This used to show one week at a time behind Previous and Next buttons,
 * which meant reaching week 2 from week 6 took four taps and a guess about
 * which week a date fell in. Twelve rows of seven fit on a screen, so any day
 * is now one tap from here and the shape of the whole challenge — what is
 * done, what is empty — is visible at a glance.
 */
export default async function HistoryPage() {
  const session = await requireParticipant();
  const settings = await getSettings();
  const clock = competitionClock(settings);

  const [entries, weekly] = await Promise.all([
    getEntriesBetween(session.participantId, clock.firstDay, clock.lastDay),
    getWeeklyScores(session.participantId),
  ]);

  const byDate = new Map(entries.map((e) => [e.entryDate, e]));
  const byWeek = new Map(weekly.map((w) => [w.weekNo, w]));

  const weeks = Array.from({ length: settings.totalWeeks }, (_, i) => i + 1);
  const emptySoFar = Array.from({ length: settings.totalWeeks }, (_, i) =>
    datesInWeek(clock.firstDay, i + 1),
  )
    .flat()
    .filter((date) => {
      if (date >= clock.today) return false;
      const entry = byDate.get(date);
      return !entry || entry.status === "missing";
    });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My days
        </h1>
        <p className="text-muted-foreground">
          Tap any day to fill it in or change it.
        </p>
      </header>

      {emptySoFar.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-50/60 p-4 dark:bg-amber-950/20">
          <p className="text-sm">
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {emptySoFar.length} day{emptySoFar.length === 1 ? "" : "s"} still
              empty.
            </span>{" "}
            Each one scores 0% until you fill it in.
          </p>
          <Button asChild size="sm" variant="outline" className="h-11">
            <Link href={`/app?date=${emptySoFar[emptySoFar.length - 1]}`}>
              Fill in the most recent
            </Link>
          </Button>
        </div>
      )}

      {/* ---- legend, so the colours need no explaining ---- */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-green-600" />
          Filled in
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-amber-400" />
          Empty
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded ring-2 ring-primary ring-offset-1" />
          Today
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-muted" />
          Not yet
        </span>
      </div>

      {/* ---- every week, every day ---- */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {weeks.map((weekNo) => {
          const dates = datesInWeek(clock.firstDay, weekNo);
          const score = byWeek.get(weekNo);
          const started = dates[0] <= clock.today;

          return (
            <div
              key={weekNo}
              className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center"
            >
              <div className="w-28 shrink-0">
                <p className="text-sm font-medium">Week {weekNo}</p>
                <p className="tabular text-xs text-muted-foreground">
                  {started
                    ? `${Number(score?.percentage ?? 0).toFixed(1)}%`
                    : "Not yet"}
                </p>
              </div>

              <div className="flex flex-1 flex-wrap gap-2">
                {dates.map((date) => (
                  <DayCell
                    key={date}
                    date={date as IsoDate}
                    entry={byDate.get(date) ?? null}
                    today={clock.today}
                    writable={participantMayWrite(settings, date as IsoDate).allowed}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        You can fill in or change any day of the challenge until the last day of
        week 12. After that a BCJ organiser can still correct a day for you, and
        every change is recorded.
      </p>
    </div>
  );
}

/**
 * One day. A link when it can be opened, a plain box when it cannot, so a
 * future day never looks tappable.
 */
function DayCell({
  date,
  entry,
  today,
  writable,
}: {
  date: IsoDate;
  entry: { status: string; dailyPercentage: string | null } | null;
  today: IsoDate;
  writable: boolean;
}) {
  const dayNumber = Number(date.slice(8, 10));
  const isToday = date === today;
  const future = date > today;
  const filled = entry !== null && entry.status !== "missing";
  const locked = entry?.status === "locked";

  const base =
    "relative flex size-11 shrink-0 flex-col items-center justify-center rounded-lg text-sm font-medium tabular";

  if (future) {
    return (
      <span
        className={cn(base, "bg-muted text-muted-foreground/60")}
        aria-label={`${formatIsoDateLong(date)}: not yet`}
      >
        {dayNumber}
      </span>
    );
  }

  const tone = filled
    ? "bg-green-600 text-white hover:bg-green-700"
    : "bg-amber-400 text-amber-950 hover:bg-amber-500";

  const label = `${formatIsoDateLong(date)}: ${
    filled
      ? `${Number(entry?.dailyPercentage ?? 0).toFixed(0)} per cent`
      : "nothing filled in"
  }${isToday ? ", today" : ""}`;

  const cell = (
    <span
      className={cn(
        base,
        tone,
        isToday && "ring-2 ring-primary ring-offset-2",
        !writable && !locked && "opacity-70",
      )}
    >
      {dayNumber}
      {locked && <Lock className="absolute right-0.5 top-0.5 size-2.5" />}
    </span>
  );

  return (
    <Link href={`/app?date=${date}`} aria-label={label} title={label}>
      {cell}
    </Link>
  );
}
