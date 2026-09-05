import Link from "next/link";
import { notFound } from "next/navigation";
import { HeartPulse } from "lucide-react";
import type { Metadata } from "next";

import { RegistrationId } from "@/components/registration-id";
import { ScoreBar } from "@/components/score-ring";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { requestIp } from "@/lib/auth/session";
import { formatDateTime, formatIsoDate, type IsoDate } from "@/lib/dates";
import { listDietCategories } from "@/lib/diet";
import {
  getEntriesBetween,
  getFinalScore,
  getParticipantHealth,
  getParticipantProfile,
  getWeeklyScores,
} from "@/lib/queries";
import { dailyMaxForWeek, formatPoints } from "@/lib/scoring";
import { competitionClock, getSettings } from "@/lib/settings";

import { ParticipantEditor } from "./editor";
import { RecomputeButton } from "./recompute-button";
import { StatusActions } from "./status-actions";

export const metadata: Metadata = { title: "Participant" };
export const dynamic = "force-dynamic";

/**
 * `/admin/participants/[id]` — daily records and progress for one participant
 * (specification section 5.2).
 *
 * Reading this page reveals health fields, so the visit is written to
 * `audit_log` with the actor, the IP and the timestamp (section 2.3).
 */
export default async function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const settings = await getSettings();
  const clock = competitionClock(settings);

  const profile = await getParticipantProfile(id);
  if (!profile) notFound();

  const [health, weekly, final, entries, categories] = await Promise.all([
    getParticipantHealth(id),
    getWeeklyScores(id),
    getFinalScore(id),
    getEntriesBetween(id, clock.firstDay, clock.lastDay),
    listDietCategories(),
  ]);

  // Every health-data view is logged — specification section 2.3 and 11.
  await recordAudit({
    action: "health.viewed",
    entityType: "participant",
    entityId: id,
    actorAdminId: admin.adminId,
    reason: "Opened the participant record",
    ip: await requestIp(),
  });

  const byWeek = new Map(weekly.map((w) => [w.weekNo, w]));
  // Delete is offered only while nothing has been recorded — see StatusActions.
  const recordedDays = entries.filter((e) => e.status !== "missing").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-9">
            <Link href="/admin/participants">← All participants</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile.fullName}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <RegistrationId value={profile.registrationId} size="sm" />
            <StatusBadge status={profile.status} />
            {profile.dietTitle && (
              <span className="text-sm text-muted-foreground">
                {profile.dietTitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href={`/admin/audit?entityId=${profile.id}`}>
              Audit history
            </Link>
          </Button>
          <RecomputeButton participantId={profile.id} />
        </div>
      </header>

      {/* Suspend, withdraw or remove — kept beside the name rather than buried
          in the Details tab, because they are decisions rather than edits. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {profile.status === "active"
            ? `Competing. ${recordedDays} day${recordedDays === 1 ? "" : "s"} recorded.`
            : "On hold — cannot sign in, log a day or appear on the leaderboard. Their records are kept."}
        </p>
        <StatusActions
          participantId={profile.id}
          fullName={profile.fullName}
          status={profile.status}
          entryCount={recordedDays}
        />
      </div>

      {/* ---- scores ---- */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Final score</p>
            <p className="tabular mt-1 text-3xl font-semibold">
              {Number(final?.finalScore ?? 0).toFixed(1)}
              <span className="text-lg font-medium text-muted-foreground">
                {" "}
                / {settings.totalWeeks * 100}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Final percentage</p>
            <p className="tabular mt-1 text-3xl font-semibold">
              {Number(final?.finalPercentage ?? 0).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Days recorded</p>
            <p className="tabular mt-1 text-3xl font-semibold">
              {entries.filter((e) => e.status !== "missing").length}
              <span className="text-lg font-medium text-muted-foreground">
                {" "}
                / {settings.totalWeeks * 7}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="weeks">
        <TabsList>
          <TabsTrigger value="weeks">Weeks</TabsTrigger>
          <TabsTrigger value="days">Daily records</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
        </TabsList>

        {/* ---- weekly ---- */}
        <TabsContent value="weeks" className="mt-4">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {Array.from({ length: settings.totalWeeks }, (_, i) => i + 1).map(
              (weekNo) => {
                const row = byWeek.get(weekNo);
                return (
                  <li key={weekNo} className="flex items-center gap-4 p-4">
                    <div className="w-24 shrink-0">
                      <p className="font-medium">Week {weekNo}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        max {dailyMaxForWeek(weekNo, settings.maxActiveWeek)}/day
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <ScoreBar
                        percentage={Number(row?.percentage ?? 0)}
                        label={`Week ${weekNo}`}
                      />
                    </div>
                    <p className="tabular hidden w-24 shrink-0 text-right text-sm text-muted-foreground sm:block">
                      {row?.daysCounted ?? 0}/7 logged
                    </p>
                  </li>
                );
              },
            )}
          </ul>
        </TabsContent>

        {/* ---- daily ---- */}
        <TabsContent value="days" className="mt-4">
          {entries.length === 0 ? (
            <div className="rounded-xl border bg-card py-12 text-center text-muted-foreground">
              No records yet.
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-4 p-4">
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-medium">
                      {formatIsoDate(entry.entryDate as IsoDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Week {entry.weekNo} · {entry.status}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <ScoreBar
                      percentage={Number(entry.dailyPercentage ?? 0)}
                      label={entry.entryDate}
                    />
                  </div>
                  <span className="tabular hidden w-20 shrink-0 text-right text-sm text-muted-foreground sm:block">
                    {formatPoints(entry.dailyPoints)}/{entry.maxPoints}
                  </span>
                  <Button asChild size="sm" variant="outline" className="h-11">
                    <Link href={`/admin/entries/${entry.id}/edit`}>Correct</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ---- details, editable ---- */}
        <TabsContent value="details" className="mt-4">
          <ParticipantEditor
            participant={{
              id: profile.id,
              fullName: profile.fullName,
              email: profile.email,
              mobile: profile.mobile,
              age: profile.age,
              gender: profile.gender,
              weightKg: profile.weightKg,
              dietCategoryId: profile.dietCategoryId,
              status: profile.status,
            }}
            categories={categories.map((c) => ({ id: c.id, title: c.title }))}
            registeredAt={formatDateTime(profile.registeredAt, settings.timezone)}
          />
        </TabsContent>

        {/* ---- health, super admin only ---- */}
        <TabsContent value="health" className="mt-4">
          <Card
            style={{
              borderColor:
                "color-mix(in oklch, var(--color-metric-vitals) 35%, transparent)",
            }}
          >
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <span
                aria-hidden
                className="inline-flex size-10 items-center justify-center rounded-xl"
                style={{
                  background:
                    "color-mix(in oklch, var(--color-metric-vitals) 14%, transparent)",
                  color: "var(--color-metric-vitals)",
                }}
              >
                <HeartPulse className="size-5" />
              </span>
              <div>
                <CardTitle className="text-lg">Health baseline</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Organisers only. Never shown on the leaderboard or in a
                  participant-facing export. This view has been logged.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                {[
                  ["Blood group", health?.bloodGroup],
                  ["Blood pressure", health?.bloodPressure],
                  [
                    "Diabetes / sugar",
                    health?.diabetesStatus === "diagnosed"
                      ? "Yes — diagnosed"
                      : health?.diabetesStatus === "not_sure"
                        ? "Not sure"
                        : health?.diabetesStatus === "no"
                          ? "No"
                          : null,
                  ],
                  ["Blood sugar reading", health?.bloodSugar],
                ].map(([label, value]) => (
                  <div
                    key={label as string}
                    className="flex items-baseline justify-between gap-4 py-3"
                  >
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="text-right text-sm font-medium">
                      {value || <span className="text-muted-foreground">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
