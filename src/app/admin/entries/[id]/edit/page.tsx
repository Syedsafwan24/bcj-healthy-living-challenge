import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CorrectionForm, type CorrectionValues } from "@/components/correction-form";
import { RegistrationId } from "@/components/registration-id";
import { EntryStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { formatIsoDateLong, weekNoFor, type IsoDate } from "@/lib/dates";
import { getEntryById } from "@/lib/queries";
import { activeChallengesForWeek, formatPoints } from "@/lib/scoring";
import { getSettings, toScoringSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Correct an entry" };
export const dynamic = "force-dynamic";

/**
 * `/admin/entries/[id]/edit` — correct verified inputs. Scores recompute and
 * are never edited directly (specification section 5.2).
 */
export default async function EditEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const settings = await getSettings();

  const row = await getEntryById(id);
  if (!row) notFound();

  const { entry, participant } = row;
  const entryDate = entry.entryDate as IsoDate;

  // Derived from the entry's own date, so a correction made weeks later is
  // still scored against the week the entry belongs to (section 4.2, T9).
  const weekNo = weekNoFor(settings.startDate as IsoDate, entryDate);
  const activeChallenges = activeChallengesForWeek(weekNo, settings.maxActiveWeek);

  const initialValues: CorrectionValues = {
    waterLitres: entry.waterLitres ?? "",
    steps: entry.steps === null ? "" : String(entry.steps),
    sleepHours: entry.sleepHours ?? "",
    c3CookAtHome: tri(entry.c3CookAtHome),
    c4NoSugary: tri(entry.c4NoSugary),
    c5Vegetables: tri(entry.c5Vegetables),
    c5VegetablesDinner: tri(entry.c5VegetablesDinner),
    c6NoLateFood: tri(entry.c6NoLateFood),
    c8Mindfulness: tri(entry.c8Mindfulness),
    c9ScreenTime: tri(entry.c9ScreenTime),
    breakfast: tri(entry.breakfast),
    midMorning: tri(entry.midMorning),
    lunch: tri(entry.lunch),
    eveningSnack: tri(entry.eveningSnack),
    dinner: tri(entry.dinner),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-9">
          <Link href={`/admin/entries?date=${entryDate}`}>← Back to the day</Link>
        </Button>

        <h1 className="text-2xl font-semibold tracking-tight">
          Correct {formatIsoDateLong(entryDate)}
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/participants/${participant.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {participant.fullName}
          </Link>
          <RegistrationId value={participant.registrationId} size="sm" />
          <EntryStatusBadge status={entry.status} />
          <span className="tabular text-sm text-muted-foreground">
            Currently {formatPoints(entry.dailyPoints)}/{entry.maxPoints ?? 0} ·{" "}
            {Number(entry.dailyPercentage ?? 0).toFixed(4)}%
          </span>
        </div>
      </header>

      <CorrectionForm
        participantId={participant.id}
        entryDate={entryDate}
        weekNo={weekNo}
        settings={toScoringSettings(settings)}
        activeChallenges={activeChallenges}
        initialValues={initialValues}
      />
    </div>
  );
}

function tri(value: boolean | null): "yes" | "no" | "" {
  return value === true ? "yes" : value === false ? "no" : "";
}
