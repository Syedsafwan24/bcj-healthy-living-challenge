"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { resetCompetition, type SettingsState } from "./actions";
import { RESET_PHRASE } from "./constants";

/**
 * End of season. Clears one year's competition so the same installation runs
 * the next one.
 *
 * Three separate things stand between a stray click and an empty database: the
 * dialog, the exact phrase typed by hand, and the organiser's own password.
 * The phrase matters most — a password prompt is muscle memory, whereas typing
 * "CLEAR ALL RECORDS" is impossible to do without reading it.
 *
 * The button stays enabled until the phrase matches, rather than the dialog
 * refusing on submit, so the requirement is visible before anything is typed.
 */
/**
 * Enabled even before the phrase matches.
 *
 * It used to be disabled until the typed phrase was exact, which reads as a
 * broken button: nothing explains why it will not press, and a browser that
 * autofills the phrase box — see below — leaves an organiser clicking a dead
 * control with no idea what is wrong. Pressing it now says what is missing,
 * and the server refuses a wrong phrase anyway.
 *
 * The check is on the click rather than on the form's submit, because this is
 * a Radix AlertDialogAction: it closes the dialog on click whatever the form
 * does, so blocking only the submission would take the dialog away — along
 * with the message explaining why nothing happened, and everything typed.
 */
function ResetButton({
  armed,
  onBlocked,
}: {
  armed: boolean;
  onBlocked: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <AlertDialogAction
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (armed) return;
        // Stops the submit and stops the dialog closing, in one.
        event.preventDefault();
        onBlocked();
      }}
      className="bg-destructive text-white hover:bg-destructive/90"
    >
      {pending ? "Clearing…" : "Clear the competition"}
    </AlertDialogAction>
  );
}

export function ResetControls({
  requireTotp,
  participantCount,
  recordedDays,
  competitionClosed,
}: {
  requireTotp: boolean;
  participantCount: number;
  /** Daily records that will go with them. */
  recordedDays: number;
  /** The season has to be closed before it can be cleared. */
  competitionClosed: boolean;
}) {
  const [state, action] = useActionState<SettingsState | null, FormData>(
    resetCompetition,
    null,
  );
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  // The phrase box starts read-only. Chrome and Edge fill the first text
  // input of any form containing a password with the saved username, and they
  // ignore autocomplete="off" while doing it — which put an email address in
  // the phrase box and left the button disabled. A read-only input is not
  // filled, and it becomes writable the moment somebody means to type in it.
  const [phraseReady, setPhraseReady] = useState(false);
  const [phraseError, setPhraseError] = useState<string | null>(null);

  const armed = confirm.trim() === RESET_PHRASE;

  useEffect(() => {
    if (state?.ok && state.message) {
      toast.success(state.message, { duration: 10_000 });
      setOpen(false);
      setConfirm("");
      setPhraseReady(false);
      setPhraseError(null);
    } else if (state?.error) {
      // Long, because a failure here names what the database refused.
      toast.error(state.error, { duration: 20_000 });
    }
  }, [state]);

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-destructive">
          <TriangleAlert className="size-4" />
          End of season
        </CardTitle>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Empties the site so BCJ can run next year&apos;s challenge on it.
            Everything from this season goes.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="font-medium text-destructive">Deleted for ever</p>
              <ul className="mt-2 space-y-1">
                <li>
                  <strong className="text-foreground">
                    All {participantCount} participant
                    {participantCount === 1 ? "" : "s"}
                  </strong>{" "}
                  &mdash; every registration, name, email and mobile number
                </li>
                <li>
                  <strong className="text-foreground">
                    All {recordedDays.toLocaleString()} recorded day
                    {recordedDays === 1 ? "" : "s"}
                  </strong>{" "}
                  &mdash; every answer anybody gave
                </li>
                <li>Every weekly score, final score and leaderboard position</li>
                <li>
                  Health records: blood group, blood pressure, diabetes status
                  and blood sugar
                </li>
                <li>
                  Everyone&apos;s sign-in, so no participant can log in again
                </li>
              </ul>
            </div>

            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">Kept</p>
              <ul className="mt-2 space-y-1">
                <li>Organiser accounts, including yours</li>
                <li>The diet categories and their plans</li>
                <li>The audit history, with this deletion recorded in it</li>
              </ul>
              <p className="mt-2">
                Registration numbering restarts at BCJ0001 and the scoring rules
                unlock, ready for next year&apos;s start date.
              </p>
            </div>
          </div>

          <p className="font-medium text-destructive">
            There is no undo. Export the results first, and make sure you have a
            database backup you have actually restored from before.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!competitionClosed && (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">
              Close the competition first.
            </strong>{" "}
            The season has to be finished before it can be cleared &mdash;
            otherwise this would delete days participants are still allowed to
            fill in. Use the card above.
          </p>
        )}

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="h-11 border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={participantCount === 0 || !competitionClosed}
              title={
                participantCount === 0
                  ? "There are no participants to clear."
                  : !competitionClosed
                    ? "Close the competition first."
                    : undefined
              }
            >
              Delete everything and start a new season
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <form action={action}>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete all {participantCount} participant
                  {participantCount === 1 ? "" : "s"} and all{" "}
                  {recordedDays.toLocaleString()} recorded day
                  {recordedDays === 1 ? "" : "s"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Every registration, every answer, every score and every health
                  record from this season is deleted for ever. This cannot be
                  undone. Confirm with your own password
                  {requireTotp ? " and authenticator code" : ""}, and type the
                  phrase exactly.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-4 py-4">
                <Field
                  id="reset-confirm"
                  label={`Type ${RESET_PHRASE}`}
                  required
                  error={phraseError ?? state?.errors?.confirm}
                  hint="Typed by hand, so this cannot be done by accident."
                >
                  <Input
                    id="reset-confirm"
                    name="confirm"
                    value={confirm}
                    readOnly={!phraseReady}
                    onFocus={() => setPhraseReady(true)}
                    onChange={(event) => {
                      setConfirm(event.target.value);
                      setPhraseError(null);
                    }}
                    autoComplete="off"
                    // Honoured by 1Password and LastPass; the browsers' own
                    // managers are handled by readOnly above.
                    data-1p-ignore
                    data-lpignore="true"
                    spellCheck={false}
                    placeholder={RESET_PHRASE}
                    className="h-11 font-mono"
                  />
                </Field>

                <Field
                  id="reset-password"
                  label="Password"
                  required
                  error={state?.errors?.password}
                >
                  <Input
                    id="reset-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="h-11"
                  />
                </Field>

                {requireTotp && (
                  <Field
                    id="reset-totp"
                    label="Authenticator code"
                    required
                    error={state?.errors?.totp}
                  >
                    <Input
                      id="reset-totp"
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

                <Field
                  id="reset-reason"
                  label="Reason"
                  hint="Recorded in the audit history."
                >
                  <Textarea
                    id="reset-reason"
                    name="reason"
                    rows={2}
                    maxLength={500}
                    placeholder="End of the 2026 season"
                  />
                </Field>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <ResetButton
                  armed={armed}
                  onBlocked={() =>
                    setPhraseError(
                      confirm.trim().length === 0
                        ? `Type ${RESET_PHRASE} to confirm.`
                        : `That is not the phrase. Type ${RESET_PHRASE} exactly.`,
                    )
                  }
                />
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
