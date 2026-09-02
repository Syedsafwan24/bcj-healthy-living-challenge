import Link from "next/link";
import type { Metadata } from "next";

import { ScoreBar } from "@/components/score-ring";
import { WeeklyChart } from "@/components/weekly-chart-lazy";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireParticipant } from "@/lib/auth/guards";
import { getFinalScore, getWeeklyScores } from "@/lib/queries";
import { dailyMaxForWeek } from "@/lib/scoring";
import { competitionClock, getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Progress", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/progress` — the participant's own weekly percentages and final score
 * to date (specification section 5.1, V6 section 6).
 */
export default async function ProgressPage() {
  const session = await requireParticipant();
  const settings = await getSettings();
  const clock = competitionClock(settings);

  const [weekly, final] = await Promise.all([
    getWeeklyScores(session.participantId),
    getFinalScore(session.participantId),
  ]);

  const byWeek = new Map(weekly.map((w) => [w.weekNo, w]));
  const weeks = Array.from({ length: settings.totalWeeks }, (_, i) => {
    const weekNo = i + 1;
    const row = byWeek.get(weekNo);
    return {
      week: weekNo,
      percentage: Number(row?.percentage ?? 0),
      daysCounted: row?.daysCounted ?? 0,
      recorded: row !== undefined,
      dailyMax: dailyMaxForWeek(weekNo, settings.maxActiveWeek),
      isCurrent: clock.currentWeek === weekNo,
      isFuture: clock.currentWeek !== null && weekNo > clock.currentWeek,
    };
  });

  const maxScore = settings.totalWeeks * 100;
  const score = Number(final?.finalScore ?? 0);
  const percentage = Number(final?.finalPercentage ?? 0);
  const completedWeeks = weeks.filter((w) => !w.isFuture && !w.isCurrent).length;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Progress
        </h1>
        <p className="text-muted-foreground">
          Your final score is the sum of your twelve weekly percentages.
        </p>
      </header>

      {/* ---- final score ---- */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Final score to date</p>
            <p className="tabular mt-1 text-5xl font-semibold leading-none">
              {score.toFixed(1)}
              <span className="text-2xl font-medium text-muted-foreground">
                {" "}
                / {maxScore}
              </span>
            </p>
            <div className="mt-5">
              <ScoreBar
                percentage={percentage}
                label={`Final score ${percentage.toFixed(1)} per cent of the maximum`}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="text-sm text-muted-foreground">Weeks completed</p>
              <p className="tabular text-2xl font-semibold">
                {completedWeeks} / {settings.totalWeeks}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Best week</p>
              <p className="tabular text-2xl font-semibold">
                {weeks.some((w) => w.recorded)
                  ? `${Math.max(...weeks.map((w) => w.percentage)).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---- weekly chart ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Weekly percentages</CardTitle>
        </CardHeader>
        <CardContent>
          <WeeklyChart
            data={weeks.map((w) => ({
              week: w.week,
              percentage: w.percentage,
              recorded: w.recorded,
            }))}
          />
        </CardContent>
      </Card>

      {/* ---- week by week ---- */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Week by week</h2>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {weeks.map((week) => (
            <li key={week.week} className="flex items-center gap-4 p-4">
              <div className="w-24 shrink-0">
                <p className="flex items-center gap-2 font-medium">
                  Week {week.week}
                  {week.isCurrent && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      now
                    </Badge>
                  )}
                </p>
                <p className="tabular text-xs text-muted-foreground">
                  max {week.dailyMax}/day
                </p>
              </div>

              <div className="min-w-0 flex-1">
                {week.isFuture ? (
                  <p className="text-sm text-muted-foreground">Not started</p>
                ) : (
                  <ScoreBar
                    percentage={week.percentage}
                    label={`Week ${week.week}: ${week.percentage.toFixed(1)} per cent`}
                  />
                )}
              </div>

              <p className="tabular hidden w-24 shrink-0 text-right text-sm text-muted-foreground sm:block">
                {week.isFuture ? "—" : `${week.daysCounted} of 7 days filled in`}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Each week is the average of its seven daily percentages, so a day you do
        not log counts as zero.{" "}
        <Link href="/app/history" className="underline-offset-4 hover:underline">
          Check your history
        </Link>{" "}
        for days still inside the correction window.
      </p>
    </div>
  );
}
