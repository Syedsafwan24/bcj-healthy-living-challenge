import { Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { CHALLENGES, DIET_MAX } from "@/lib/challenges";
import {
  daysBetween,
  formatDateTime,
  formatIsoDateLong,
  type IsoDate,
} from "@/lib/dates";
import {
  blockIsClosed,
  blockIsClosingNow,
  daysUntilBlockCloses,
  entryBlocks,
} from "@/lib/entry-blocks";
import { dailyMaxForWeek } from "@/lib/scoring";
import { env } from "@/lib/env";
import { competitionClock, getSettings } from "@/lib/settings";
import { db } from "@/db";
import { dailyEntries, participants } from "@/db/schema";
import { and, count, eq, lte, ne } from "drizzle-orm";

import { CloseControls } from "./close-controls";
import { RecomputeControls } from "./recompute-controls";
import { ResetControls } from "./reset-controls";
import { LockControls, SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * `/admin/settings` — start date, submission deadline, the scoring-rule lock,
 * closing the competition and the end-of-season reset (specification section
 * 5.2).
 */
export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const [{ value: participantCount }] = await db
    .select({ value: count() })
    .from(participants);
  const clock = competitionClock(settings);

  // What closing would cost: every elapsed day, for every active participant,
  // that nobody has filled in. Shown on the close card so the decision is made
  // with the number in front of the organiser rather than after the fact.
  const through: IsoDate =
    daysBetween(clock.today, clock.lastDay) < 0 ? clock.lastDay : clock.today;
  const elapsed = clock.started
    ? daysBetween(clock.firstDay, through) + 1
    : 0;

  const [[{ value: activeCount }], [{ value: recordedDays }]] = await Promise.all([
    db
      .select({ value: count() })
      .from(participants)
      .where(eq(participants.status, "active")),
    db
      .select({ value: count() })
      .from(dailyEntries)
      .where(
        and(
          ne(dailyEntries.status, "missing"),
          lte(dailyEntries.entryDate, through),
        ),
      ),
  ]);

  const outstandingDays = Math.max(0, activeCount * elapsed - recordedDays);

  const blocks = entryBlocks(clock.firstDay, settings.totalWeeks);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {!clock.started
              ? `Starts ${formatIsoDateLong(clock.firstDay)}.`
              : clock.closed
                ? "Closed. The results are final."
                : clock.weeksOver
                  ? "The 12 weeks are over. Days are still open until you close it."
                  : `Running — week ${clock.currentWeek} of ${settings.totalWeeks}.`}
          </p>
        </div>
        {settings.rulesLocked && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" />
            Rules locked
          </Badge>
        )}
      </header>

      {clock.started && !clock.closed && !settings.rulesLocked && (
        <Alert>
          <TriangleAlert className="size-4" />
          <AlertTitle>The competition is running with rules unlocked</AlertTitle>
          <AlertDescription>
            V6 section 8 forbids changing scoring rules mid-competition without
            formal approval. Lock them below once BCJ has signed off the start
            date and the week structure.
          </AlertDescription>
        </Alert>
      )}

      <SettingsForm
        settings={{
          startDate: settings.startDate,
          totalWeeks: settings.totalWeeks,
          maxActiveWeek: settings.maxActiveWeek,
          timezone: settings.timezone,
          submissionCutoff: settings.submissionCutoff.slice(0, 5),
          rulesLocked: settings.rulesLocked,
        }}
        challengeCount={CHALLENGES.length}
      />

      <LockControls
        locked={settings.rulesLocked}
        requireTotp={env.adminRequireTotp}
      />

      <RecomputeControls participantCount={activeCount} />

      <CloseControls
        closed={clock.closed}
        closedAt={
          clock.closedAt
            ? formatDateTime(clock.closedAt, settings.timezone)
            : null
        }
        weeksOver={clock.weeksOver}
        started={clock.started}
        lastDay={formatIsoDateLong(clock.lastDay)}
        outstandingDays={outstandingDays}
        requireTotp={env.adminRequireTotp}
      />

      <ResetControls
        requireTotp={env.adminRequireTotp}
        participantCount={participantCount}
      />

      {/* ---- when each block of the challenge shuts ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entry deadlines</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The challenge is filled in four weeks at a time, and each block gets
            one further week to catch up before it closes for good. These
            deadlines are automatic — the nightly job scores every day still
            empty at 0% and makes the block final. Only the last block waits for
            you.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Weeks</th>
                  <th className="py-2 pr-4 font-medium">Days covered</th>
                  <th className="py-2 pr-4 font-medium">Catch-up week</th>
                  <th className="py-2 font-medium">Closes</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((block) => {
                  const closed =
                    clock.closed || blockIsClosed(block, clock.today);
                  const closingNow = blockIsClosingNow(block, clock.today);
                  const left = daysUntilBlockCloses(block, clock.today);

                  return (
                    <tr key={block.index} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        {block.firstWeek}–{block.lastWeek}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatIsoDateLong(block.firstDay)} –{" "}
                        {formatIsoDateLong(block.lastDay)}
                      </td>
                      <td className="tabular py-2 pr-4 text-muted-foreground">
                        {block.catchUpWeek ?? "—"}
                      </td>
                      <td className="py-2">
                        {closed ? (
                          <span className="text-muted-foreground">
                            Closed
                            {block.closesAfter
                              ? ` after ${formatIsoDateLong(block.closesAfter)}`
                              : " by an organiser"}
                          </span>
                        ) : block.closesAfter ? (
                          <span
                            className={
                              closingNow
                                ? "font-medium text-amber-700 dark:text-amber-400"
                                : undefined
                            }
                          >
                            {formatIsoDateLong(block.closesAfter)}
                            {closingNow && left !== null
                              ? ` — in ${left} day${left === 1 ? "" : "s"}`
                              : ""}
                          </span>
                        ) : (
                          <span className="font-medium">
                            When you close the competition
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ---- what the current settings mean ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily maxima under these settings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Specification section 4.7. Each active challenge is worth 10
            points and stays active for the rest of the challenge once its week
            arrives; diet adds 10 every day from week 1.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Week</th>
                  <th className="py-2 pr-4 font-medium">Active</th>
                  <th className="py-2 pr-4 font-medium">Lifestyle</th>
                  <th className="py-2 pr-4 font-medium">Diet</th>
                  <th className="py-2 font-medium">Daily max</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: settings.totalWeeks }, (_, i) => i + 1).map(
                  (weekNo) => {
                    const active = Math.min(
                      weekNo,
                      Math.min(settings.maxActiveWeek, CHALLENGES.length),
                    );
                    return (
                      <tr key={weekNo} className="border-b last:border-0">
                        <td className="tabular py-2 pr-4">{weekNo}</td>
                        <td className="tabular py-2 pr-4">{active}</td>
                        <td className="tabular py-2 pr-4">{active * 10}</td>
                        <td className="tabular py-2 pr-4">{DIET_MAX}</td>
                        <td className="tabular py-2 font-medium">
                          {dailyMaxForWeek(weekNo, settings.maxActiveWeek)}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            A final score of {settings.totalWeeks * 100} is the maximum: the sum
            of {settings.totalWeeks} weekly percentages.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
