import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";

import { RegistrationId } from "@/components/registration-id";
import { ScoreBar } from "@/components/score-ring";
import { EntryStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import {
  addDays,
  formatIsoDateLong,
  isIsoDate,
  isScorableDate,
  weekNoFor,
  type IsoDate,
} from "@/lib/dates";
import { listEntriesForDate } from "@/lib/queries";
import { dailyMaxForWeek, formatPoints } from "@/lib/scoring";
import { competitionClock, getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Daily entries" };
export const dynamic = "force-dynamic";

/** `/admin/entries` — one day across every active participant (section 5.2). */
export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const settings = await getSettings();
  const clock = competitionClock(settings);
  const params = await searchParams;

  const requested = params.date;
  const entryDate: IsoDate =
    requested && isIsoDate(requested)
      ? requested
      : clock.finished
        ? clock.lastDay
        : clock.started
          ? clock.today
          : clock.firstDay;

  const inWindow = isScorableDate(clock.firstDay, settings.totalWeeks, entryDate);
  const weekNo = inWindow ? weekNoFor(clock.firstDay, entryDate) : null;
  const rows = inWindow ? await listEntriesForDate(entryDate) : [];

  const submitted = rows.filter(
    (r) => r.status === "submitted" || r.status === "locked",
  ).length;
  const missing = rows.length - submitted;
  const average =
    submitted === 0
      ? 0
      : rows
          .filter((r) => r.status === "submitted" || r.status === "locked")
          .reduce((sum, r) => sum + Number(r.dailyPercentage ?? 0), 0) / submitted;

  const previous = addDays(entryDate, -1);
  const next = addDays(entryDate, 1);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Daily entries</h1>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="icon" className="size-11">
              <Link
                href={`/admin/entries?date=${previous}`}
                aria-label="Previous day"
                className={cn(
                  previous < clock.firstDay && "pointer-events-none opacity-50",
                )}
              >
                <ChevronLeft className="size-4" />
              </Link>
            </Button>

            <form action="/admin/entries" className="flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={entryDate}
                min={clock.firstDay}
                max={clock.lastDay}
                className="h-11 rounded-lg border bg-background px-3 text-sm"
                aria-label="Choose a date"
              />
              <Button type="submit" variant="outline" className="h-11">
                Go
              </Button>
            </form>

            <Button asChild variant="outline" size="icon" className="size-11">
              <Link
                href={`/admin/entries?date=${next}`}
                aria-label="Next day"
                className={cn(
                  next > clock.lastDay && "pointer-events-none opacity-50",
                )}
              >
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {formatIsoDateLong(entryDate)}
            {weekNo ? ` · Week ${weekNo} · max ${dailyMaxForWeek(weekNo, settings.maxActiveWeek)} points` : ""}
          </p>
        </div>
      </header>

      {!inWindow ? (
        <div className="rounded-xl border bg-card py-12 text-center text-muted-foreground">
          That date falls outside the {settings.totalWeeks}-week competition
          window ({clock.firstDay} to {clock.lastDay}).
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Submitted" value={submitted} />
            <Stat label="No record" value={missing} />
            <Stat label="Average" value={`${average.toFixed(1)}%`} />
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participant</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Registration ID
                  </TableHead>
                  <TableHead className="w-56">Score</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Points
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No active participants yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.participantId}>
                      <TableCell>
                        <Link
                          href={`/admin/participants/${row.participantId}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {row.displayName}
                        </p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <RegistrationId value={row.registrationId} size="sm" />
                      </TableCell>
                      <TableCell>
                        {row.entryId && row.status !== "missing" ? (
                          <ScoreBar
                            percentage={Number(row.dailyPercentage ?? 0)}
                            label={`${row.displayName}: ${Number(row.dailyPercentage ?? 0).toFixed(1)} per cent`}
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular hidden text-right lg:table-cell">
                        {row.entryId && row.status !== "missing"
                          ? `${formatPoints(row.dailyPoints)}/${row.maxPoints}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <EntryStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {row.entryId ? (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-11"
                          >
                            <Link href={`/admin/entries/${row.entryId}/edit`}>
                              Correct
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-11"
                          >
                            <Link
                              href={`/admin/entries/new?participantId=${row.participantId}&date=${entryDate}`}
                            >
                              Record
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
