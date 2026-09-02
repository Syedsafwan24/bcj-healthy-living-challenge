import { Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { CHALLENGES } from "@/lib/challenges";
import { formatIsoDateLong } from "@/lib/dates";
import { dailyMaxForWeek } from "@/lib/scoring";
import { env } from "@/lib/env";
import { competitionClock, getSettings } from "@/lib/settings";
import { db } from "@/db";
import { participants } from "@/db/schema";
import { count } from "drizzle-orm";

import { ResetControls } from "./reset-controls";
import { LockControls, SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * `/admin/settings` — start date, submission deadline, correction window
 * (specification section 5.2).
 */
export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const [{ value: participantCount }] = await db
    .select({ value: count() })
    .from(participants);
  const clock = competitionClock(settings);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clock.started
              ? clock.finished
                ? "The competition has finished."
                : `Running — week ${clock.currentWeek} of ${settings.totalWeeks}.`
              : `Starts ${formatIsoDateLong(clock.firstDay)}.`}
          </p>
        </div>
        {settings.rulesLocked && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" />
            Rules locked
          </Badge>
        )}
      </header>

      {clock.started && !settings.rulesLocked && (
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
          missingScoresZero: settings.missingScoresZero,
          rulesLocked: settings.rulesLocked,
        }}
        challengeCount={CHALLENGES.length}
      />

      <LockControls
        locked={settings.rulesLocked}
        requireTotp={env.adminRequireTotp}
      />

      <ResetControls
        requireTotp={env.adminRequireTotp}
        participantCount={participantCount}
      />

      {/* ---- what the current settings mean ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily maxima under these settings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Specification section 4.7. Each active challenge is worth 10 points
            and diet adds 10 every day from week 1.
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
                        <td className="tabular py-2 pr-4">10</td>
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
