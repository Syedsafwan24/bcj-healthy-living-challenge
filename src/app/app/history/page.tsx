import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, Pencil } from "lucide-react";
import type { Metadata } from "next";

import { ScoreBar } from "@/components/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireParticipant } from "@/lib/auth/guards";
import { formatIsoDate, type IsoDate } from "@/lib/dates";
import { getWeeklyScores, getWeekGrid } from "@/lib/queries";
import { dailyMaxForWeek } from "@/lib/scoring";
import {
  competitionClock,
  getSettings,
  participantMayWrite,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "History", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/history` — the participant's own past days, editable inside the
 * correction window (specification section 5.1).
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireParticipant();
  const settings = await getSettings();
  const clock = competitionClock(settings);
  const params = await searchParams;

  const currentWeek = clock.currentWeek ?? (clock.finished ? settings.totalWeeks : 1);
  const requested = Number(params.week);
  const weekNo = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), settings.totalWeeks)
    : currentWeek;

  const [grid, weekly] = await Promise.all([
    getWeekGrid(settings, session.participantId, weekNo),
    getWeeklyScores(session.participantId),
  ]);

  const weekScore = weekly.find((w) => w.weekNo === weekNo);
  const dailyMax = dailyMaxForWeek(weekNo, settings.maxActiveWeek);

  // A day is "missed" once it is in the past with nothing recorded. Today is
  // never missed — the day is not over — and future days are simply not due.
  const missedDays = grid.filter(
    ({ date, entry }) =>
      date < clock.today && (!entry || entry.status === "missing"),
  ).length;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          History
        </h1>

        <div className="flex items-center justify-between gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-11"
            disabled={weekNo <= 1}
          >
            <Link
              href={`/app/history?week=${Math.max(1, weekNo - 1)}`}
              aria-disabled={weekNo <= 1}
              className={cn(weekNo <= 1 && "pointer-events-none opacity-50")}
            >
              <ChevronLeft className="size-4" />
              <span className="ml-1 hidden sm:inline">Previous</span>
            </Link>
          </Button>

          <div className="text-center">
            <p className="font-semibold">Week {weekNo}</p>
            <p className="tabular text-sm text-muted-foreground">
              {Number(weekScore?.percentage ?? 0).toFixed(1)}% · max {dailyMax}/day
            </p>
            {missedDays > 0 && (
              <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                {missedDays} day{missedDays === 1 ? "" : "s"} still empty
              </p>
            )}
          </div>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-11"
            disabled={weekNo >= settings.totalWeeks}
          >
            <Link
              href={`/app/history?week=${Math.min(settings.totalWeeks, weekNo + 1)}`}
              className={cn(
                weekNo >= settings.totalWeeks && "pointer-events-none opacity-50",
              )}
            >
              <span className="mr-1 hidden sm:inline">Next</span>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {grid.map(({ date, entry }) => {
          const permission = participantMayWrite(settings, date as IsoDate);
          const editable = permission.allowed && entry?.status !== "locked";
          const future = date > clock.today;
          const isToday = date === clock.today;
          const empty = !entry || entry.status === "missing";
          const missed = !future && !isToday && empty;
          const percentage = Number(entry?.dailyPercentage ?? 0);

          return (
            <li
              key={date}
              className={cn(
                "flex flex-col gap-3 border-l-4 border-l-transparent p-4 sm:flex-row sm:items-center",
                isToday && "border-l-primary bg-secondary/50",
                missed && "border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="w-24 shrink-0">
                  <p className="text-sm font-medium">{formatIsoDate(date)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en-GB", {
                      timeZone: "UTC",
                      weekday: "short",
                    }).format(new Date(`${date}T12:00:00Z`))}
                  </p>
                </div>

                <div className="min-w-0 flex-1">
                  {future ? (
                    <p className="text-sm text-muted-foreground">Not yet</p>
                  ) : entry && entry.status !== "missing" ? (
                    <ScoreBar
                      percentage={percentage}
                      label={`${formatIsoDate(date)}: ${percentage.toFixed(1)} per cent`}
                    />
                  ) : isToday ? (
                    <p className="text-sm font-medium">Nothing filled in yet</p>
                  ) : (
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Missed · scored 0%
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:w-52 sm:justify-end">
                {isToday && (
                  <Badge className="bg-primary text-primary-foreground">Today</Badge>
                )}
                {entry && entry.status !== "missing" && (
                  <span className="tabular text-sm text-muted-foreground">
                    {entry.dailyPoints}/{entry.maxPoints}
                  </span>
                )}
                {entry?.status === "locked" ? (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="size-3" />
                    Locked
                  </Badge>
                ) : future ? null : editable ? (
                  <Button asChild size="sm" variant="outline" className="h-11">
                    <Link href={`/app?date=${date}`}>
                      <Pencil className="size-3.5" />
                      <span className="ml-1">
                        {entry && entry.status !== "missing" ? "Change" : "Fill in"}
                      </span>
                    </Link>
                  </Button>
                ) : (
                  <Badge variant="outline">Too late</Badge>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-sm leading-relaxed text-muted-foreground">
        You can go back and fill in or change any day of the challenge, from any
        week, until the last day of week 12. After that a BCJ organiser can
        still correct a day for you, and every change is recorded.
      </p>
    </div>
  );
}
