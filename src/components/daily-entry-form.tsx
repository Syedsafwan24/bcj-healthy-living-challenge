"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { CheckCircle2, Lock, Utensils } from "lucide-react";
import { toast } from "sonner";

import {
  QuantitativeRow,
  YesNoButtons,
  YesNoRow,
  type TriState,
} from "@/components/entry-controls";
import { ScoreRing } from "@/components/score-ring";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { submitDay, type EntryState } from "@/app/app/actions";
import { DIET_OCCASIONS, type ChallengeConfig } from "@/lib/challenges";
import type { IsoDate } from "@/lib/dates";
import {
  scoreEntry,
  type EntryInputs,
  type ScoringSettings,
} from "@/lib/scoring";

/**
 * The daily log — build specification sections 5.1 and 9.5, from V6 section 6.
 *
 * The form grows as the weeks pass. Lifestyle challenges are grouped under
 * "New this week" and "Continuing", with the new challenge first. From week
 * 10, when nothing new unlocks, the heading becomes "All challenges".
 *
 * Nothing is pre-filled from the previous day. Carrying yesterday's values
 * forward would make a long form quicker to complete, and it would also let a
 * participant submit without reading anything, which inflates scores and
 * defeats the integrity rules in V6 section 8.
 *
 * The preview here uses the same pure function as the server. The server
 * value replaces it on save; no score is ever sent from the browser.
 */

export interface DailyFormValues {
  waterLitres: string;
  steps: string;
  sleepHours: string;
  c3CookAtHome: TriState;
  c4NoSugary: TriState;
  c5Vegetables: TriState;
  c6NoLateFood: TriState;
  c8Mindfulness: TriState;
  c9ScreenTime: TriState;
  breakfast: TriState;
  midMorning: TriState;
  lunch: TriState;
  eveningSnack: TriState;
  dinner: TriState;
}

export const EMPTY_FORM: DailyFormValues = {
  waterLitres: "",
  steps: "",
  sleepHours: "",
  c3CookAtHome: "",
  c4NoSugary: "",
  c5Vegetables: "",
  c6NoLateFood: "",
  c8Mindfulness: "",
  c9ScreenTime: "",
  breakfast: "",
  midMorning: "",
  lunch: "",
  eveningSnack: "",
  dinner: "",
};

function toInputs(values: DailyFormValues): EntryInputs {
  const tri = (v: TriState) => (v === "yes" ? true : v === "no" ? false : null);
  const num = (v: string) => (v === "" ? null : Number(v));
  return {
    waterLitres: num(values.waterLitres),
    steps: num(values.steps),
    sleepHours: num(values.sleepHours),
    c3CookAtHome: tri(values.c3CookAtHome),
    c4NoSugary: tri(values.c4NoSugary),
    c5Vegetables: tri(values.c5Vegetables),
    c6NoLateFood: tri(values.c6NoLateFood),
    c8Mindfulness: tri(values.c8Mindfulness),
    c9ScreenTime: tri(values.c9ScreenTime),
    breakfast: tri(values.breakfast),
    midMorning: tri(values.midMorning),
    lunch: tri(values.lunch),
    eveningSnack: tri(values.eveningSnack),
    dinner: tri(values.dinner),
  };
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full">
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function DailyEntryForm({
  entryDate,
  settings,
  activeChallenges,
  initialValues,
  readOnly,
  readOnlyReason,
  alreadySubmitted,
  weekNo,
  isRepeatPhase,
  dietPlanNote,
}: {
  entryDate: IsoDate;
  settings: ScoringSettings;
  activeChallenges: ChallengeConfig[];
  initialValues: DailyFormValues;
  readOnly: boolean;
  readOnlyReason?: string;
  alreadySubmitted: boolean;
  weekNo: number;
  isRepeatPhase: boolean;
  dietPlanNote?: string;
}) {
  const [values, setValues] = useState<DailyFormValues>(initialValues);
  // Cleared as soon as an answer changes, so the panel never reports a score
  // that no longer matches what is on the form.
  const [dirtySinceSave, setDirtySinceSave] = useState(false);
  const [state, action] = useActionState<EntryState | null, FormData>(
    submitDay,
    null,
  );

  // Re-seed when the participant navigates to a different day.
  useEffect(() => {
    setValues(initialValues);
    setDirtySinceSave(false);
  }, [initialValues, entryDate]);

  // A toast says "saved" and then disappears, which is thin feedback for the
  // one moment a participant most wants to know what they earned. The result
  // stays on screen instead, and the page scrolls up to it — the save button
  // is pinned to the bottom, so without this the confirmation lands above the
  // fold and is never seen.
  useEffect(() => {
    if (state?.ok && state.saved) {
      // The save is the new baseline: what is on the form now matches what
      // was stored, so the panel is showing a current score, not a stale one.
      setDirtySinceSave(false);
      toast.success(
        `Saved. ${state.saved.dailyPoints} of ${state.saved.maxPoints} points.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const saved = state?.ok && state.saved && !dirtySinceSave ? state.saved : null;

  const preview = useMemo(
    () => scoreEntry(settings, toInputs(values), entryDate),
    [settings, values, entryDate],
  );

  const pointsFor = (field: string) =>
    preview.challenges.find((c) => c.ref === refFor(field))?.points ?? 0;

  const newThisWeek = isRepeatPhase
    ? []
    : activeChallenges.filter((c) => c.activatesWeek === weekNo);
  const continuing = activeChallenges.filter(
    (c) => !newThisWeek.includes(c),
  );

  const dietAnswered = preview.diet.filter((d) => d.answered).length;

  function set<K extends keyof DailyFormValues>(key: K, value: DailyFormValues[K]) {
    setDirtySinceSave(true);
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function renderRow(challenge: ChallengeConfig, isNew: boolean) {
    if (challenge.kind === "quantitative") {
      return (
        <QuantitativeRow
          key={challenge.ref}
          challenge={challenge}
          value={values[challenge.field as "waterLitres" | "steps" | "sleepHours"]}
          points={pointsFor(challenge.field)}
          onChange={(next) =>
            set(challenge.field as keyof DailyFormValues, next as never)
          }
          disabled={readOnly}
          isNew={isNew}
        />
      );
    }
    return (
      <YesNoRow
        key={challenge.ref}
        challenge={challenge}
        value={values[challenge.field as keyof DailyFormValues] as TriState}
        points={pointsFor(challenge.field)}
        onChange={(next) =>
          set(challenge.field as keyof DailyFormValues, next as never)
        }
        disabled={readOnly}
        isNew={isNew}
      />
    );
  }

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="entryDate" value={entryDate} />

      {saved && (
        <div className="rounded-2xl border border-green-600/40 bg-green-50 p-5 text-center dark:bg-green-950/30">
          <p className="flex items-center justify-center gap-2 text-lg font-semibold text-green-800 dark:text-green-300">
            <CheckCircle2 className="size-5" />
            Saved
          </p>
          <p className="tabular mt-2 text-2xl font-semibold">
            {saved.dailyPoints} / {saved.maxPoints} points
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {saved.dailyPercentage.toFixed(1)}% for this day. You can change it
            any time before the challenge ends.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm" variant="outline" className="h-11">
              <Link href="/app/history">See all my days</Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-11">
              <Link href="/app/progress">My progress</Link>
            </Button>
          </div>
        </div>
      )}

      {/* ---- score, live preview until saved ---- */}
      <section className="flex flex-col items-center rounded-2xl border bg-card px-5 py-8">
        <ScoreRing
          percentage={preview.dailyPercentage}
          points={preview.dailyPoints}
          maxPoints={preview.maxPoints}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          {readOnly
            ? "Your score for this day"
            : "This updates as you fill in the form below."}
        </p>
      </section>

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {readOnly && readOnlyReason && (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>{readOnlyReason}</AlertDescription>
        </Alert>
      )}

      {/* ---- lifestyle challenges ---- */}
      {isRepeatPhase ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              All challenges
            </h2>
            <span className="tabular text-sm text-muted-foreground">
              {preview.lifestyleEarned} / {preview.lifestyleMax}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Weeks 10 to 12 repeat the full set. Nothing new unlocks, so this is
            the same nine challenges you have been tracking since week 9.
          </p>
          <div className="grid gap-3">
            {activeChallenges.map((challenge) => renderRow(challenge, false))}
          </div>
        </section>
      ) : (
        <>
          {newThisWeek.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  New this week
                </h2>
                <Badge className="bg-green-600 text-white">Week {weekNo}</Badge>
              </div>
              <div className="grid gap-3">
                {newThisWeek.map((challenge) => renderRow(challenge, true))}
              </div>
            </section>
          )}

          {continuing.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  Continuing
                </h2>
                <span className="tabular text-sm text-muted-foreground">
                  {preview.lifestyleEarned} / {preview.lifestyleMax}
                </span>
              </div>
              <div className="grid gap-3">
                {continuing.map((challenge) => renderRow(challenge, false))}
              </div>
            </section>
          )}
        </>
      )}

      <Separator />

      {/* ---- diet, two main meals worth 5 points each ---- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Your diet plan</h2>
          <span className="tabular text-sm font-medium">
            {preview.dietEarned} / {preview.dietMax}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {dietPlanNote ??
            "Five points for each meal you followed your approved BCJ plan."}
        </p>

        <div className="divide-y rounded-xl border bg-card">
          {DIET_OCCASIONS.map((occasion) => {
            const value = values[occasion.field] as TriState;
            return (
              <div
                key={occasion.field}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background:
                        "color-mix(in oklch, var(--color-metric-nutrition) 14%, transparent)",
                      color: "var(--color-metric-nutrition)",
                    }}
                  >
                    <Utensils size={16} />
                  </span>
                  <span className="font-medium">{occasion.title}</span>
                </div>
                <div className="sm:w-56">
                  <input type="hidden" name={occasion.field} value={value} />
                  <YesNoButtons
                    label={occasion.title}
                    value={value}
                    onChange={(next) => set(occasion.field, next)}
                    disabled={readOnly}
                    size="sm"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="tabular text-xs text-muted-foreground">
          {dietAnswered} of {DIET_OCCASIONS.length} answered.
        </p>
      </section>

      {!readOnly && (
        <div className="sticky bottom-20 z-30 -mx-5 border-t bg-background/95 px-5 py-4 backdrop-blur md:bottom-0">
          <div className="flex items-center justify-between gap-4 pb-3">
            <span className="text-sm text-muted-foreground">Today&apos;s score</span>
            <span className="tabular text-lg font-semibold">
              {preview.dailyPoints} / {preview.maxPoints} ·{" "}
              {preview.dailyPercentage.toFixed(1)}%
            </span>
          </div>
          <SubmitButton
            label={alreadySubmitted ? "Save changes" : "Save my day"}
          />
        </div>
      )}
    </form>
  );
}

/** Maps an input column back to its challenge reference. */
function refFor(field: string): string {
  switch (field) {
    case "waterLitres":
      return "C1";
    case "steps":
      return "C2";
    case "c3CookAtHome":
      return "C3";
    case "c4NoSugary":
      return "C4";
    case "c5Vegetables":
      return "C5";
    case "c6NoLateFood":
      return "C6";
    case "sleepHours":
      return "C7";
    case "c8Mindfulness":
      return "C8";
    case "c9ScreenTime":
      return "C9";
    default:
      return "";
  }
}
