"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { recomputeEveryone, type SettingsState } from "./actions";

/**
 * Rescoring every stored day.
 *
 * A day keeps the score it was given when it was written, which is what stops
 * anybody's total moving under their feet. The cost is that a change to the
 * scoring rules only reaches days recorded after it — and when the rules
 * change in the code rather than in the settings row, nothing on this screen
 * can notice. Hence a button.
 *
 * Not behind a confirmation: every day is recomputed from its own raw inputs
 * through the same function that scored it first, so a run that changes
 * nothing is indistinguishable from not running it.
 */
function RecomputeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="h-11 gap-2" disabled={pending}>
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      {pending ? "Rescoring…" : "Rescore every day"}
    </Button>
  );
}

export function RecomputeControls({ participantCount }: { participantCount: number }) {
  const [state, action] = useActionState<SettingsState | null, FormData>(
    async () => recomputeEveryone(),
    null,
  );

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message, { duration: 10_000 });
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <RefreshCw className="size-4" />
          Rescore every day
        </CardTitle>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Every recorded day keeps the points and the maximum it was given
            when it was saved, so a change to how days are scored reaches only
            the days recorded after it. This applies the current rules to every
            day already stored, for all {participantCount} participant
            {participantCount === 1 ? "" : "s"}.
          </p>
          <p>
            Nothing is lost: each day is recomputed from the answers the
            participant gave and its own date. Run it after a scoring rule
            changes — and it is safe to run when nothing has, because a day
            whose rules have not moved comes back identical.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <RecomputeButton />
        </form>
      </CardContent>
    </Card>
  );
}
