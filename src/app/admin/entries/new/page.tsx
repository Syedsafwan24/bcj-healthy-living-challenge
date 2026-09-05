import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { CorrectionForm, type CorrectionValues } from "@/components/correction-form";
import { RegistrationId } from "@/components/registration-id";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import {
  formatIsoDateLong,
  isIsoDate,
  isScorableDate,
  weekNoFor,
  type IsoDate,
} from "@/lib/dates";
import { getEntry, getParticipantProfile } from "@/lib/queries";
import { activeChallengesForWeek } from "@/lib/scoring";
import { getSettings, toScoringSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Record an entry" };
export const dynamic = "force-dynamic";

const EMPTY: CorrectionValues = {
  waterLitres: "",
  steps: "",
  sleepHours: "",
  c3CookAtHome: "",
  c4NoSugary: "",
  c5Vegetables: "",
  c5VegetablesDinner: "",
  c6NoLateFood: "",
  c8Mindfulness: "",
  c9ScreenTime: "",
  breakfast: "",
  midMorning: "",
  lunch: "",
  eveningSnack: "",
  dinner: "",
};

/**
 * Records a day on a participant's behalf, for example after they reported it
 * by phone once their own window had closed. The same server action and the
 * same audit trail as any other correction.
 */
export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ participantId?: string; date?: string }>;
}) {
  await requireAdmin();
  const settings = await getSettings();
  const params = await searchParams;

  const participantId = params.participantId;
  const entryDate = params.date;

  if (!participantId || !entryDate || !isIsoDate(entryDate)) {
    redirect("/admin/entries");
  }

  if (!isScorableDate(settings.startDate as IsoDate, settings.totalWeeks, entryDate)) {
    notFound();
  }

  const [participant, existing] = await Promise.all([
    getParticipantProfile(participantId),
    getEntry(participantId, entryDate as IsoDate),
  ]);

  if (!participant) notFound();

  // If a row already exists — including a `missing` placeholder written by the
  // nightly job — correct that one rather than creating a second.
  if (existing) redirect(`/admin/entries/${existing.id}/edit`);

  const weekNo = weekNoFor(settings.startDate as IsoDate, entryDate as IsoDate);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-9">
          <Link href={`/admin/entries?date=${entryDate}`}>← Back to the day</Link>
        </Button>

        <h1 className="text-2xl font-semibold tracking-tight">
          Record {formatIsoDateLong(entryDate as IsoDate)}
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/participants/${participant.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {participant.fullName}
          </Link>
          <RegistrationId value={participant.registrationId} size="sm" />
        </div>
      </header>

      <Alert>
        <AlertDescription>
          There is no record for this day yet. Anything you enter here is stored
          as verified input and scored on the server, with your name and reason
          in the audit history.
        </AlertDescription>
      </Alert>

      <CorrectionForm
        participantId={participant.id}
        entryDate={entryDate as IsoDate}
        weekNo={weekNo}
        settings={toScoringSettings(settings)}
        activeChallenges={activeChallengesForWeek(weekNo, settings.maxActiveWeek)}
        initialValues={EMPTY}
      />
    </div>
  );
}
