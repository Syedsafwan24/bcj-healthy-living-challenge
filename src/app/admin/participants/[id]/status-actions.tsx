"use client";

import { PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";

import {
  deleteParticipant,
  setParticipantStatus,
  type ParticipantActionState,
} from "../actions";

/**
 * Status controls, in the header where an organiser looks for them.
 *
 * Two actions, because there are only two things to decide: stop someone
 * competing, or remove them. An earlier version also offered "withdraw", but
 * it did exactly what hold did — not competing, records kept, reversible — so
 * it was two buttons for one outcome.
 *
 * Delete only appears while the participant has no recorded days. Once they
 * have logged anything, holding is the only option: their entries feed the
 * weekly and final scores and the audit trail refers to them, so removing the
 * row would erase part of the competition's record.
 */
export function StatusActions({
  participantId,
  fullName,
  status,
  entryCount,
}: {
  participantId: string;
  fullName: string;
  status: string;
  entryCount: number;
}) {
  const [state, action] = useActionState<ParticipantActionState | null, FormData>(
    setParticipantStatus,
    null,
  );
  const [deleteState, deleteAction] = useActionState<
    ParticipantActionState | null,
    FormData
  >(deleteParticipant, null);

  useEffect(() => {
    for (const s of [state, deleteState]) {
      if (s?.ok && s.message) toast.success(s.message);
      if (s?.error) toast.error(s.error);
    }
  }, [state, deleteState]);

  return (
    <div className="flex flex-wrap gap-2">
      {status === "active" ? (
        <ConfirmAction
          action={action}
          participantId={participantId}
          next="pending"
          trigger={
            <>
              <PauseCircle className="size-4" />
              Put on hold
            </>
          }
          title={`Put ${fullName} on hold?`}
          description="They stop competing and drop off the leaderboard immediately, and any signed-in session is ended. Their records are kept, and you can make them active again at any time."
          confirmLabel="Put on hold"
        />
      ) : (
        <StatusButton
          action={action}
          participantId={participantId}
          next="active"
          icon={<PlayCircle className="size-4" />}
          label="Make active"
        />
      )}

      {entryCount === 0 && (
        <ConfirmAction
          action={deleteAction}
          participantId={participantId}
          trigger={
            <>
              <Trash2 className="size-4" />
              Delete
            </>
          }
          title={`Delete ${fullName}?`}
          description="This removes the registration entirely and cannot be undone. It is available because they have not recorded a single day. The audit history keeps a record that the deletion happened."
          confirmLabel="Delete permanently"
          destructive
        />
      )}
    </div>
  );
}

function Submit({
  children,
  destructive,
}: {
  children: React.ReactNode;
  destructive?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={destructive ? "destructive" : "outline"}
      disabled={pending}
      className="h-11 gap-2"
    >
      {pending ? "Working…" : children}
    </Button>
  );
}

function StatusButton({
  action,
  participantId,
  next,
  icon,
  label,
}: {
  action: (formData: FormData) => void;
  participantId: string;
  next: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="status" value={next} />
      <Submit>
        {icon}
        {label}
      </Submit>
    </form>
  );
}

function ConfirmAction({
  action,
  participantId,
  next,
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
}: {
  action: (formData: FormData) => void;
  participantId: string;
  next?: string;
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant={destructive ? "outline" : "outline"}
          className={
            destructive
              ? "h-11 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              : "h-11 gap-2"
          }
        >
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={action}>
          <input type="hidden" name="participantId" value={participantId} />
          {next && <input type="hidden" name="status" value={next} />}
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            <label htmlFor={`reason-${participantId}`} className="text-sm font-medium">
              Reason
            </label>
            <Textarea
              id={`reason-${participantId}`}
              name="reason"
              rows={2}
              maxLength={500}
              placeholder="Recorded in the audit history."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit">{confirmLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
