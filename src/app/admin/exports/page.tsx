import { HeartPulse, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { addDays, type IsoDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { competitionClock, getSettings } from "@/lib/settings";

import { ExportForm, HealthExportForm } from "./export-forms";

export const metadata: Metadata = { title: "Exports" };
export const dynamic = "force-dynamic";

/**
 * `/admin/exports` — daily, weekly and final results as CSV, XLSX and PDF
 * (specification section 5.2).
 *
 * All three formats are built from the same stored calculated columns the
 * screens read, so an export cannot disagree with the screen.
 */
export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ reauth?: string }>;
}) {
  await requireAdmin();
  const settings = await getSettings();
  const clock = competitionClock(settings);
  const params = await searchParams;

  const lastDay = addDays(settings.startDate as IsoDate, settings.totalWeeks * 7 - 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Percentages are exported at four decimal places, the precision they
          are stored at, so the figures match the screens exactly.
        </p>
      </header>

      {params.reauth === "failed" && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>Those details were not accepted</AlertTitle>
          <AlertDescription>
            The health export was not produced. The failed attempt has been
            recorded.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Participants</CardTitle>
          <p className="text-sm text-muted-foreground">
            The registration list: contact details, diet category, status and
            final score. One row per participant.
          </p>
        </CardHeader>
        <CardContent>
          <ExportForm kind="participants" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily results</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every raw input and the score for each day, one row per participant
            per date.
          </p>
        </CardHeader>
        <CardContent>
          <ExportForm
            kind="daily"
            withRange
            defaultFrom={settings.startDate}
            defaultTo={clock.finished ? lastDay : clock.today}
            min={settings.startDate}
            max={lastDay}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Weekly results</CardTitle>
          <p className="text-sm text-muted-foreground">
            One row per participant, one column per week, plus the total that
            forms the final score.
          </p>
        </CardHeader>
        <CardContent>
          <ExportForm kind="weekly" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Final results</CardTitle>
          <p className="text-sm text-muted-foreground">
            Rank, final score out of {settings.totalWeeks * 100} and final
            percentage, with contact and registration details.
          </p>
        </CardHeader>
        <CardContent>
          <ExportForm kind="final" />
        </CardContent>
      </Card>

      {/* ---- health export, behind re-authentication ---- */}
      <Card
        style={{
          borderColor:
            "color-mix(in oklch, var(--color-metric-vitals) 35%, transparent)",
        }}
      >
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <span
            aria-hidden
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background:
                "color-mix(in oklch, var(--color-metric-vitals) 14%, transparent)",
              color: "var(--color-metric-vitals)",
            }}
          >
            <HeartPulse className="size-5" />
          </span>
          <div>
            <CardTitle className="text-lg">
              Final results including health fields
            </CardTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Blood group, blood pressure, diabetes status and blood sugar.
              Section 2.3 requires your password
              {env.adminRequireTotp ? " and authenticator code" : ""} again
              before a bulk export that includes them, whatever your session
              says. The export is recorded in the audit history.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <HealthExportForm requireTotp={env.adminRequireTotp} />
        </CardContent>
      </Card>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Open item O-12: the health fields decide where this data may be hosted.
        Confirm with BCJ whether it must stay in Saudi Arabia before circulating
        an export outside the organising team.
      </p>
    </div>
  );
}
