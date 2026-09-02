import Link from "next/link";
import {
  CalendarCheck,
  Lock,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { formatIsoDateLong } from "@/lib/dates";
import { getAdminOverview } from "@/lib/queries";
import { competitionClock, getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

/** `/admin` — registrations, today's submission count, averages (section 5.2). */
export default async function AdminOverviewPage() {
  await requireAdmin();
  const settings = await getSettings();
  const clock = competitionClock(settings);

  const overview = await getAdminOverview(settings, clock.today);

  const activeCount = overview.registrations.active;
  const submittedToday = overview.today.submitted;
  const outstanding = Math.max(0, activeCount - submittedToday);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clock.started
              ? clock.finished
                ? `The challenge finished on ${formatIsoDateLong(clock.lastDay)}.`
                : `Week ${clock.currentWeek} of ${settings.totalWeeks} · ${formatIsoDateLong(clock.today)}`
              : `Starts ${formatIsoDateLong(clock.firstDay)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {settings.rulesLocked && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" />
              Rules locked
            </Badge>
          )}
          <Badge variant="outline">{settings.timezone}</Badge>
        </div>
      </header>

      {overview.registrations.pending > 0 && (
        <Alert>
          <UserCheck className="size-4" />
          <AlertTitle>
            {overview.registrations.pending} registration
            {overview.registrations.pending === 1 ? " is" : "s are"} on hold
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              A participant on hold cannot sign in or log a day. Registrations
              are active by default, so someone is only here because an
              organiser put them on hold.
            </p>
            <Button asChild size="sm" variant="outline" className="h-11">
              <Link href="/admin/participants?status=pending">
                Review them
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ---- counters ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<Users className="size-4" />}
          label="Registered"
          value={overview.registrations.total}
          note={`${activeCount} active${overview.registrations.pending > 0 ? ` · ${overview.registrations.pending} on hold` : ""}`}
        />
        <Stat
          icon={<CalendarCheck className="size-4" />}
          label="Logged today"
          value={submittedToday}
          note={
            clock.started && !clock.finished
              ? `${outstanding} still outstanding`
              : "Outside the competition window"
          }
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          label="Average today"
          value={`${overview.today.averagePercentage.toFixed(1)}%`}
          note="Across submitted records only"
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          label="Average final score"
          value={overview.overall.averageFinal.toFixed(1)}
          note={`Out of ${settings.totalWeeks * 100}`}
        />
      </div>

      {/* ---- quick links ---- */}
      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            href: "/admin/participants",
            title: "Participants",
            body: "Search the roster, correct details, assign diet categories and open one person's record.",
          },
          {
            href: "/admin/entries",
            title: "Daily entries",
            body: "See one day across every participant and correct verified inputs.",
          },
          {
            href: "/admin/exports",
            title: "Exports",
            body: "Daily, weekly and final results as CSV, XLSX and PDF.",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <p className="font-semibold">{item.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </Link>
        ))}
      </section>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Scores are calculated on the server from raw inputs. No screen here
        edits a point value or a percentage directly — corrections change the
        inputs and the totals recompute.
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        <p className="tabular mt-2 text-3xl font-semibold">{value}</p>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}
