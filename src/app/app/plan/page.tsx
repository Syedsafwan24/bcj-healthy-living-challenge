import { Info, Utensils } from "lucide-react";
import type { Metadata } from "next";

import { MetricIcon } from "@/components/metric";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireParticipant } from "@/lib/auth/guards";
import { DIET_OCCASIONS, POINTS_PER_DIET_OCCASION } from "@/lib/challenges";
import { getParticipantProfile } from "@/lib/queries";

export const metadata: Metadata = { title: "My plan", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/plan` — the participant's own diet category and plan, V5 section 6
 * (specification section 5.1).
 *
 * Open item O-6: V5 section 5 states that a diet occasion earns its 2 points
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
            registration. Your five diet occasions still count towards your
            score in the meantime.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            The five occasions
          </h2>
          <Badge variant="secondary">10 points a day</Badge>
        </div>

        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {DIET_OCCASIONS.map((occasion) => (
            <li key={occasion.field} className="flex items-center gap-3 p-4">
              <span
                aria-hidden
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background:
                    "color-mix(in oklch, var(--color-metric-nutrition) 14%, transparent)",
                  color: "var(--color-metric-nutrition)",
                }}
              >
                <Utensils size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{occasion.title}</p>
                <p className="text-sm text-muted-foreground">
                  Answer Yes when you followed your approved plan for this
                  occasion.
                </p>
              </div>
              <span className="tabular shrink-0 text-sm font-semibold">
                {POINTS_PER_DIET_OCCASION} pts
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Alert>
        <Info className="size-4" />
        <AlertTitle>What counts as following the plan</AlertTitle>
        <AlertDescription>
          Answer Yes for an occasion when you ate what your assigned plan sets
          out for it. If you are unsure, ask a BCJ organiser rather than
          guessing — the same rule has to apply to everyone.
        </AlertDescription>
      </Alert>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Your diet score counts every day from week 1 and is part of your
        ordinary daily score, not a bonus and not a tie-breaker.
      </p>
    </div>
  );
}
