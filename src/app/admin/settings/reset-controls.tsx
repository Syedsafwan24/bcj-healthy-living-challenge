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
function ResetButton({ armed }: { armed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <AlertDialogAction
      type="submit"
      disabled={!armed || pending}
      className="bg-destructive text-white hover:bg-destructive/90"
    >
      {pending ? "Clearing…" : "Clear the competition"}
    </AlertDialogAction>
  );
}

export function ResetControls({
  requireTotp,
  participantCount,
}: {
  requireTotp: boolean;
  participantCount: number;
}) {
  const [state, action] = useActionState<SettingsState | null, FormData>(
    resetCompetition,
    null,
  );
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok && state.message) {
      toast.success(state.message, { duration: 10_000 });
      setOpen(false);
      setConfirm("");
    } else if (state?.error) {
      toast.error(state.error);
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
            Clears this year&apos;s competition so BCJ can run the next one on
            the same site. It deletes{" "}
            <strong className="text-foreground">
              every participant, their daily entries, weekly scores, final
              scores and health records
            </strong>
            , and sets registration numbering back to BCJ0001.
          </p>
          <p>
            Organiser accounts, diet categories and the audit history are kept.
            The scoring rules are unlocked so next year&apos;s start date can be
            set.
          </p>
          <p className="font-medium text-destructive">
            There is no undo. Export the results first, and make sure you have a
            database backup you have actually restored from before.
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="h-11 border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={participantCount === 0}
              title={
                participantCount === 0
                  ? "There are no participants to clear."
                  : undefined
              }
            >
              Clear competition records
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <form action={action}>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {participantCount} participant
                  {participantCount === 1 ? "" : "s"} and everything they
                  recorded?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Confirm with your own password
                  {requireTotp ? " and authenticator code" : ""}, and type the
                  phrase exactly.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-4 py-4">
                <Field
                  id="reset-confirm"
                  label={`Type ${RESET_PHRASE}`}
                  required
                  error={state?.errors?.confirm}
                >
                  <Input
                    id="reset-confirm"
                    name="confirm"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="off"
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
                <ResetButton armed={confirm.trim() === RESET_PHRASE} />
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
