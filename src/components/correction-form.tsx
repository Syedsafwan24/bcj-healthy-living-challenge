"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { correctEntry, type CorrectionState } from "@/app/admin/entries/actions";
import {
  MealPairRow,
  QuantitativeRow,
  YesNoButtons,
  YesNoRow,
  type TriState,
} from "@/components/entry-controls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { DIET_OCCASIONS, type ChallengeConfig } from "@/lib/challenges";
import type { IsoDate } from "@/lib/dates";
import { scoreEntry, type EntryInputs, type ScoringSettings } from "@/lib/scoring";

/**
 * Admin correction form — build specification section 5.2.
 *
 * Corrects verified inputs only. The preview below is the same pure function
 * the server runs; nothing calculated is sent from the browser, and the
 * stored score is whatever the server computes on save.
 *
 * The reason is required and is written to the audit history alongside the
 * old and new value of every changed field.
 */

export interface CorrectionValues {
  waterLitres: string;
  steps: string;
  sleepHours: string;
  c3CookAtHome: TriState;
  c4NoSugary: TriState;
  c5Vegetables: TriState;
  c5VegetablesDinner: TriState;
  c6NoLateFood: TriState;
  c8Mindfulness: TriState;
  c9ScreenTime: TriState;
  breakfast: TriState;
  midMorning: TriState;
  lunch: TriState;
  eveningSnack: TriState;
  dinner: TriState;
}

function toInputs(values: CorrectionValues): EntryInputs {
  const tri = (v: TriState) => (v === "yes" ? true : v === "no" ? false : null);
  const num = (v: string) => (v === "" ? null : Number(v));
  return {
    waterLitres: num(values.waterLitres),
    steps: num(values.steps),
    sleepHours: num(values.sleepHours),
    c3CookAtHome: tri(values.c3CookAtHome),
    c4NoSugary: tri(values.c4NoSugary),
    c5Vegetables: tri(values.c5Vegetables),
    c5VegetablesDinner: tri(values.c5VegetablesDinner),
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

const REF_BY_FIELD: Record<string, string> = {
  waterLitres: "C1",
  steps: "C2",
  c3CookAtHome: "C3",
  c4NoSugary: "C4",
  c5Vegetables: "C5",
  c5VegetablesDinner: "C5",
  c6NoLateFood: "C6",
  sleepHours: "C7",
  c8Mindfulness: "C8",
  c9ScreenTime: "C9",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12 w-full">
      {pending ? "Saving and recomputing…" : "Save correction"}
    </Button>
  );
}

export function CorrectionForm({
  participantId,
  entryDate,
  weekNo,
  settings,
  activeChallenges,
  initialValues,
}: {
  participantId: string;
  entryDate: IsoDate;
  weekNo: number;
  settings: ScoringSettings;
  activeChallenges: ChallengeConfig[];
  initialValues: CorrectionValues;
}) {
  const [values, setValues] = useState(initialValues);
  const [state, action] = useActionState<CorrectionState | null, FormData>(
    correctEntry,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
    if (state?.error) toast.error(state.error);
  }, [state]);

  const preview = useMemo(
    () => scoreEntry(settings, toInputs(values), entryDate),
    [settings, values, entryDate],
  );

  const pointsFor = (field: string) =>
    preview.challenges.find((c) => c.ref === REF_BY_FIELD[field])?.points ?? 0;

  function set<K extends keyof CorrectionValues>(
    key: K,
    value: CorrectionValues[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  const errors = state?.errors ?? {};

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="entryDate" value={entryDate} />

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* ---- what this correction will store ---- */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">
              Week {weekNo} · {preview.activeChallenges} active challenge
              {preview.activeChallenges === 1 ? "" : "s"} + diet
            </p>
            <p className="text-xs text-muted-foreground">
              The active set comes from this entry&apos;s own date, not from today.
            </p>
          </div>
          <p className="tabular text-2xl font-semibold">
            {preview.dailyPoints} / {preview.maxPoints}
            <span className="ml-2 text-base font-medium text-muted-foreground">
              {preview.dailyPercentage.toFixed(4)}%
            </span>
          </p>
        </CardContent>
      </Card>

      {/* ---- lifestyle ---- */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Lifestyle challenges
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {activeChallenges.map((challenge) =>
            challenge.kind === "quantitative" ? (
              <QuantitativeRow
                key={challenge.ref}
                challenge={challenge}
                value={
                  values[
                    challenge.field as "waterLitres" | "steps" | "sleepHours"
                  ]
                }
                points={pointsFor(challenge.field)}
                onChange={(next) =>
                  set(challenge.field as keyof CorrectionValues, next as never)
                }
              />
            ) : challenge.kind === "mealPair" && challenge.secondField ? (
              <MealPairRow
                key={challenge.ref}
                challenge={challenge}
                first={values[challenge.field as keyof CorrectionValues] as TriState}
                second={
                  values[challenge.secondField as keyof CorrectionValues] as TriState
                }
                points={pointsFor(challenge.field)}
                onChange={(which) => {
                  const secondField =
                    challenge.secondField as keyof CorrectionValues;
                  // "None" is an explicit no to both — the answer that scores
                  // zero, as distinct from never having answered.
                  if (which === "none") {
                    set(challenge.field as keyof CorrectionValues, "no" as never);
                    set(secondField, "no" as never);
                    return;
                  }
                  const key =
                    which === "first"
                      ? (challenge.field as keyof CorrectionValues)
                      : secondField;
                  const current = values[key] as TriState;
                  set(key, (current === "yes" ? "no" : "yes") as never);
                }}
              />
            ) : (
              <YesNoRow
                key={challenge.ref}
                challenge={challenge}
                value={values[challenge.field as keyof CorrectionValues] as TriState}
                points={pointsFor(challenge.field)}
                onChange={(next) =>
                  set(challenge.field as keyof CorrectionValues, next as never)
                }
              />
            ),
          )}
        </div>
      </section>

      {/* ---- diet ---- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Diet</h2>
          <span className="tabular text-sm font-medium">
            {preview.dietEarned} / {preview.dietMax}
          </span>
        </div>
        <div className="divide-y rounded-xl border bg-card">
          {DIET_OCCASIONS.map((occasion) => (
            <div
              key={occasion.field}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium">{occasion.title}</span>
              <div className="sm:w-56">
                <input
                  type="hidden"
                  name={occasion.field}
                  value={values[occasion.field]}
                />
                <YesNoButtons
                  label={occasion.title}
                  value={values[occasion.field]}
                  onChange={(next) => set(occasion.field, next)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- reason, required ---- */}
      <section className="space-y-2">
        <label htmlFor="reason" className="text-sm font-medium">
          Reason for this correction <span className="text-destructive">*</span>
        </label>
        <Textarea
          id="reason"
          name="reason"
          rows={3}
          required
          minLength={5}
          maxLength={500}
          placeholder="For example: participant reported their step count by phone after their device failed."
        />
        {errors.reason && (
          <p className="text-xs font-medium text-destructive">{errors.reason}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Recorded in the audit history with your name, the IP address, the
          timestamp and every changed value.
        </p>
      </section>

      <SubmitButton />
    </form>
  );
}
