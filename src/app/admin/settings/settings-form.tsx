"use client";

import { Lock, Unlock } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
  lockRules,
  unlockRules,
  updateSettings,
  type SettingsState,
} from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-12">
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}

export function SettingsForm({
  settings,
  challengeCount,
}: {
  settings: {
    startDate: string;
    totalWeeks: number;
    maxActiveWeek: number;
    timezone: string;
    submissionCutoff: string;
    missingScoresZero: boolean;
    rulesLocked: boolean;
  };
  challengeCount: number;
}) {
  const [state, action] = useActionState<SettingsState | null, FormData>(
    updateSettings,
    null,
  );
  const [missingZero, setMissingZero] = useState(settings.missingScoresZero);

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
    if (state?.error) toast.error(state.error);
  }, [state]);

  const errors = state?.errors ?? {};
  const frozen = settings.rulesLocked;

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* ---- scoring rules, frozen once locked ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scoring rules</CardTitle>
          <p className="text-sm text-muted-foreground">
            {frozen
              ? "Locked. Unlock below to change these."
              : "These decide how every day is scored. Lock them once BCJ has approved them."}
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field
            id="startDate"
            label="Start date"
            required
            error={errors.startDate}
            hint="Week 1 begins on this date."
          >
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={settings.startDate}
              disabled={frozen}
              required
              className="h-11"
            />
          </Field>

          <Field
            id="totalWeeks"
            label="Total weeks"
            required
            error={errors.totalWeeks}
            hint="12 weeks is 84 days and a maximum of 1,200 (open item O-2)."
          >
            <Input
              id="totalWeeks"
              name="totalWeeks"
              type="number"
              min={1}
              max={52}
              defaultValue={settings.totalWeeks}
              disabled={frozen}
              required
              className="tabular h-11"
            />
          </Field>

          <Field
            id="maxActiveWeek"
            label="Weeks that unlock a challenge"
            required
            error={errors.maxActiveWeek}
            hint={`${challengeCount} challenges are configured. Weeks beyond this repeat the full set (open item O-1).`}
          >
            <Input
              id="maxActiveWeek"
              name="maxActiveWeek"
              type="number"
              min={1}
              max={challengeCount}
              defaultValue={settings.maxActiveWeek}
              disabled={frozen}
              required
              className="tabular h-11"
            />
          </Field>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              A missing submission scores 0%
            </Label>
            <div className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
              <Switch
                id="missingScoresZero"
                name="missingScoresZero"
                checked={missingZero}
                onCheckedChange={setMissingZero}
                value="true"
              />
              <Label htmlFor="missingScoresZero" className="text-sm font-normal">
                {missingZero ? "Yes" : "No — unrecorded days drop out"}
              </Label>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Open item O-3, assumed yes. With this on, a week is always divided
              by 7, so skipping a day cannot raise an average.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---- operational settings, always editable ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deadlines</CardTitle>
          <p className="text-sm text-muted-foreground">
            Open item O-4. These may be changed at any time; they do not alter
            how a stored day was scored.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field
            id="timezone"
            label="Timezone"
            required
            error={errors.timezone}
            hint="An IANA name, for example Asia/Riyadh."
          >
            <Input
              id="timezone"
              name="timezone"
              defaultValue={settings.timezone}
              required
              className="h-11"
            />
          </Field>

          <Field
            id="submissionCutoff"
            label="Submission deadline"
            required
            error={errors.submissionCutoff}
            hint="Local time in the timezone above."
          >
            <Input
              id="submissionCutoff"
              name="submissionCutoff"
              type="time"
              defaultValue={settings.submissionCutoff}
              required
              className="tabular h-11"
            />
          </Field>
        </CardContent>
      </Card>

      <SaveButton />
    </form>
  );
}

/**
 * V6 section 8: scoring rules are locked once the competition starts.
 * Unlocking requires the password and TOTP again (specification section 2.3).
 */
export function LockControls({
  locked,
  requireTotp,
}: {
  locked: boolean;
  requireTotp: boolean;
}) {
  const [state, action] = useActionState<SettingsState | null, FormData>(
    unlockRules,
    null,
  );
  const [lockState, lockAction] = useActionState<SettingsState | null, FormData>(
    async () => lockRules(),
    null,
  );

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
    if (state?.error) toast.error(state.error);
    if (lockState?.ok && lockState.message) toast.success(lockState.message);
  }, [state, lockState]);

  if (!locked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Unlock className="size-4" />
            Scoring rules are unlocked
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Lock them once BCJ has approved the start date and week structure.
            After that, the start date, the number of weeks and the active weeks
            become read-only until an organiser re-authenticates.
          </p>
        </CardHeader>
        <CardContent>
          <form action={lockAction}>
            <Button type="submit" className="h-11 gap-2">
              <Lock className="size-4" />
              Lock the scoring rules
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lock className="size-4" />
          Scoring rules are locked
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          V6 section 8 expects a formal approval behind any change while the
          competition is running. Unlocking asks for your password
          {requireTotp ? " and authenticator code" : ""} again, and is recorded
          in the audit history.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <Field id="unlock-password" label="Password" required>
            <Input
              id="unlock-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11"
            />
          </Field>
          {requireTotp && (
            <Field id="unlock-totp" label="Authenticator code" required>
              <Input
                id="unlock-totp"
                name="totp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                required
                className="tabular h-11 text-center tracking-[0.3em]"
              />
            </Field>
          )}
          <Button type="submit" variant="outline" className="h-11">
            Unlock
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
