"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { recomputeOne, type ParticipantActionState } from "../actions";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className="h-11 gap-2"
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      {pending ? "Rescoring…" : "Rescore"}
    </Button>
  );
}

/**
 * Rescores every stored day for this participant from its raw inputs, then
 * the weeks and the final score. A repair, for use after a settings change or
 * a suspected inconsistency; ordinary corrections recompute on their own.
 */
export function RecomputeButton({ participantId }: { participantId: string }) {
  const [state, action] = useActionState<ParticipantActionState | null, FormData>(
    recomputeOne,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="participantId" value={participantId} />
      <Inner />
    </form>
  );
}
