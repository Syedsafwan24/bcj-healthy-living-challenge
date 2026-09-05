import { Info } from "lucide-react";
import type { Metadata } from "next";

import { MetricIcon } from "@/components/metric";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireParticipant } from "@/lib/auth/guards";
import { getParticipantProfile } from "@/lib/queries";

export const metadata: Metadata = { title: "My plan", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/plan` — the participant's own diet category and plan, V5 section 6
 * (specification section 5.1).
 *
 * Open item O-6: V5 section 5 states that a meal earns its 5 points
 * only when the participant follows the approved plan for that occasion, and
 * that BCJ should approve the exact definition before launch. Whatever BCJ
 * decides is shown as helper text beside each meal — the copy below is the
 * placeholder until that answer arrives.
 */
export default async function PlanPage() {
  const session = await requireParticipant();
  const profile = await getParticipantProfile(session.participantId);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My diet plan
        </h1>
        <p className="text-muted-foreground">
          Assigned by BCJ from your age and weight when your registration was
          approved.
        </p>
      </header>

      {profile?.dietTitle ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <MetricIcon metric="nutrition" icon="salad" />
            <div>
              <CardTitle className="text-lg">{profile.dietTitle}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your assigned category
              </p>
            </div>
          </CardHeader>
          {profile.dietPlan && (
            <CardContent>
              <p className="leading-relaxed">{profile.dietPlan}</p>
            </CardContent>
          )}
        </Card>
      ) : (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>No plan assigned yet</AlertTitle>
          <AlertDescription>
            A BCJ organiser assigns your diet category when they review your
            registration.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="size-4" />
        <AlertTitle>How your plan is used</AlertTitle>
        <AlertDescription>
          Your plan is guidance from the BCJ nutrition team for your category.
          It is not scored on its own — your daily points come from the
          lifestyle challenges. If you are unsure what your plan asks for, ask
          a BCJ organiser rather than guessing.
        </AlertDescription>
      </Alert>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Eating vegetables with your main meals is scored from week 5 as one of
        the twelve weekly challenges, on the Today screen.
      </p>
    </div>
  );
}
