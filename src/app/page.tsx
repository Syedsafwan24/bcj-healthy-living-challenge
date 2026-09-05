import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ChallengeIcon } from "@/components/metric";
import { PublicShell } from "@/components/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CHALLENGES } from "@/lib/challenges";

/**
 * Dynamically rendered so the per-request CSP nonce from `src/middleware.ts`
 * reaches this page's script tags. A statically prerendered page is generated
 * at build time and cannot carry a per-request nonce, so its scripts would be
 * blocked by the Content-Security-Policy and the page would never hydrate.
 */
export const dynamic = "force-dynamic";

/** `/` — programme overview and register link (specification section 5.1). */
export default function HomePage() {
  return (
    <PublicShell>
      {/* ---- hero ---- */}
      <section className="border-b bg-linear-to-b from-green-50 to-background dark:from-green-900/40">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-24">
          <Badge
            variant="secondary"
            className="mb-5 rounded-full px-3 py-1 text-xs font-medium"
          >
            12 weeks · 9 challenges · one daily log
          </Badge>

          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-green-900 sm:text-5xl dark:text-green-50">
            One habit at a time, for twelve weeks.
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            The BCJ Healthy Living Challenge adds one new habit each week and
            keeps every earlier one running. Fill in your day in under a minute and
            watch your score build.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link href="/register">
                Register
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link href="/login">I have a registration ID</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ---- how scoring works ---- */}
      <section className="mx-auto w-full max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-semibold tracking-tight">How it is scored</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Every day",
              body: "Each active challenge is worth up to 10 points, and your two main meals are worth 10 more. Your day is scored as a percentage of that day's maximum.",
            },
            {
              title: "Every week",
              body: "Your week is the average of its seven daily percentages. A day you do not log counts as zero, so consistency matters more than any single day.",
            },
            {
              title: "At the end",
              body: "Your final score is the sum of your twelve weekly percentages, out of 1,200. The leaderboard shows rank, display name and final score.",
            },
          ].map((item) => (
            <Card key={item.title} className="border-border/70">
              <CardContent className="space-y-2 p-5">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- the challenges ---- */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            The nine challenges
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            One unlocks each week and stays with you. By week nine you are
            tracking all nine, and weeks ten to twelve repeat the full set.
          </p>

          <ol className="mt-8 grid gap-3 sm:grid-cols-2">
            {CHALLENGES.map((challenge) => (
              <li key={challenge.ref}>
                <div className="flex h-full items-start gap-4 rounded-xl border bg-card p-4">
                  <ChallengeIcon challenge={challenge} />
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="tabular text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Week {challenge.activatesWeek}
                      </span>
                    </div>
                    <p className="font-medium leading-snug">{challenge.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {challenge.hint}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-xl border bg-card p-5">
            <p className="font-medium">Your diet plan</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              BCJ assigns you a plan from your age and weight when your
              registration is approved. It is guidance for the challenges
              above rather than a separate score.
            </p>
          </div>
        </div>
      </section>

      {/* ---- closing ---- */}
      <section className="mx-auto w-full max-w-5xl px-5 py-16">
        <div className="rounded-2xl bg-green-900 px-6 py-10 text-center sm:px-12">
          <h2 className="text-2xl font-semibold tracking-tight text-green-50">
            Ready to start?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-green-100">
            Registration takes about two minutes. You will get a registration ID
            by email — that ID is how you sign in, so keep it safe.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-7 h-12 bg-green-300 px-6 text-green-950 hover:bg-green-200"
          >
            <Link href="/register">Register now</Link>
          </Button>
        </div>
      </section>
    </PublicShell>
  );
}
