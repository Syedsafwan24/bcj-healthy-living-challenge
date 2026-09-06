"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarCheck, FlagOff, TriangleAlert, Undo2 } from "lucide-react";
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

import {
  closeCompetition,
  reopenCompetition,
  type SettingsState,
} from "./actions";

/**
 * Closing the competition — the moment BCJ declares the results final.
 *
 * The 12 weeks ending does not do this on its own. Days stay open afterwards
 * so anyone who fell behind can fill in what they missed, and how long that
 * grace period runs is the organisers' decision, not the calendar's. This is
 * where that decision is made.
 *
 * Behind a dialog rather than a bare button: it takes the app away from every
 * participant at once. Reopening asks for a password, on the same reasoning as
 * the scoring-rule lock — closing only tightens, reopening loosens.
 */

function CloseButton() {
  const { pending } = useFormStatus();
  return (
    <AlertDialogAction type="submit" disabled={pending}>
      {pending ? "Closing…" : "Close the competition"}
    </AlertDialogAction>
  );
}

function ReopenButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="h-11 gap-2" disabled={pending}>
      <Undo2 className="size-4" />
      {pending ? "Reopening…" : "Reopen the competition"}
    </Button>
  );
}

export function CloseControls({
  closed,
  closedAt,
  weeksOver,
  started,
  lastDay,
  outstandingDays,
  requireTotp,
}: {
  closed: boolean;
  /** Already formatted for the competition timezone. */
  closedAt: string | null;
  weeksOver: boolean;
  started: boolean;
  /** The last day of week 12, formatted. */
  lastDay: string;
  /** Days nobody has filled in, which closing will score 0%. */
  outstandingDays: number;
  requireTotp: boolean;
}) {
  const [closeState, closeAction] = useActionState<SettingsState | null, FormData>(
    closeCompetition,
    null,
  );
  const [reopenState, reopenAction] = useActionState<
    SettingsState | null,
    FormData
  >(reopenCompetition, null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (closeState?.ok && closeState.message) {
      toast.success(closeState.message, { duration: 10_000 });
      setOpen(false);
    } else if (closeState?.error) {
      toast.error(closeState.error);
    }
  }, [closeState]);

  useEffect(() => {
    if (reopenState?.ok && reopenState.message) {
      toast.success(reopenState.message, { duration: 10_000 });
    } else if (reopenState?.error) {
      toast.error(reopenState.error);
    }
  }, [reopenState]);

  /* ---- already closed ---- */

  if (closed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlagOff className="size-4" />
            The competition is closed
          </CardTitle>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Closed {closedAt ?? "by an organiser"}. Participants can see their
              results but can no longer fill in or change a day, and every
              recorded day is final.
            </p>
            <p>
              Reopen it only to let somebody finish what they missed. It asks
              for your password
              {requireTotp ? " and authenticator code" : ""}, unlocks every day
              again, and is recorded in the audit history.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={reopenAction} className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <Field
              id="reopen-password"
              label="Password"
              required
              error={reopenState?.errors?.password}
            >
              <Input
                id="reopen-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11"
              />
            </Field>

            {requireTotp && (
              <Field
                id="reopen-totp"
                label="Authenticator code"
                required
                error={reopenState?.errors?.totp}
              >
                <Input
                  id="reopen-totp"
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

            <ReopenButton />
          </form>
        </CardContent>
      </Card>
    );
  }

  /* ---- still open ---- */

  return (
    <Card className={weeksOver ? "border-primary/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarCheck className="size-4" />
          {weeksOver ? "The 12 weeks are over" : "Close the competition"}
        </CardTitle>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {weeksOver ? (
            <p>
              The last scorable day was{" "}
              <strong className="text-foreground">{lastDay}</strong>. Days are
              still open so anyone who fell behind can fill in what they missed,
              and participants are told the results are waiting on your
              decision. Close it when you are satisfied everyone has had their
              chance.
            </p>
          ) : (
            <p>
              The challenge runs to{" "}
              <strong className="text-foreground">{lastDay}</strong>. Days stay
              open after that so anyone behind can catch up, until you close it
              here.
            </p>
          )}
          <p>
            Closing scores every unfilled day at 0%, makes every recorded day
            final, and stops participants changing anything. The results and
            exports do not change afterwards.
          </p>
          {outstandingDays > 0 && (
            <p>
              <strong className="text-foreground">
                {outstandingDays.toLocaleString()} day
                {outstandingDays === 1 ? "" : "s"}
              </strong>{" "}
              across the roster still have nothing recorded. Closing now scores
              every one of them 0%.
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button
              className="h-11 gap-2"
              variant={weeksOver ? "default" : "outline"}
              disabled={!started}
              title={
                started ? undefined : "The challenge has not started yet."
              }
            >
              <FlagOff className="size-4" />
              Close the competition
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <form action={closeAction}>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Close the competition and make the results final?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {outstandingDays > 0
                    ? `${outstandingDays.toLocaleString()} unrecorded day${outstandingDays === 1 ? "" : "s"} will be scored 0% and every recorded day locked. Participants can no longer change anything.`
                    : "Every recorded day is locked and participants can no longer change anything."}
                </AlertDialogDescription>
              </AlertDialogHeader>

              {!weeksOver && (
                <div className="mt-4 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="leading-relaxed">
                    The 12 weeks have not finished. Closing now ends the
                    challenge early, and every remaining day scores 0%.
                  </p>
                </div>
              )}

              <div className="space-y-4 py-4">
                <Field
                  id="close-reason"
                  label="Reason"
                  hint="Recorded in the audit history."
                >
                  <Textarea
                    id="close-reason"
                    name="reason"
                    rows={2}
                    maxLength={500}
                    placeholder="Grace period over — results announced at the closing event"
                  />
                </Field>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <CloseButton />
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
