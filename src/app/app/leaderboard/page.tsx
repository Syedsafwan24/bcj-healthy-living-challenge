import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import type { Metadata } from "next";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireParticipant } from "@/lib/auth/guards";
import {
  getLeaderboard,
  groupLeaderboard,
  leaderboardCategories,
  type LeaderboardGroup,
  type LeaderboardSegment,
} from "@/lib/queries";
import { PARTICIPANT_LEADERBOARD_VISIBLE } from "@/lib/features";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leaderboard",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/**
 * `/app/leaderboard` — V6 section 9 and V5 section 11: rank, approved display
 * name, final score and final percentage, ranked by final score.
 *
 * The registration ID is not shown. V6 does not list it, and because the ID is
 * the only participant credential a leaderboard carrying it would hand out
 * sign-in codes (specification section 2.2).
 *
 * The overall ranking is the one the specification defines. The diet-category
 * and gender views are additions BCJ asked for: neither document divides the
 * leaderboard, and V5 section 6 describes the categories as differing "food
 * and portion guidance" rather than competition classes. Because every day is
 * scored as a percentage of its own maximum, no category is advantaged, so
 * these divisions are about recognition rather than fairness.
 *
 * Gold marks the top three of each division, always with dark text: white on
 * gold-500 measures 2.38:1 and fails (section 9.2).
 */

// Category + gender is the default: it is the division BCJ awards prizes on.
// Overall stays available as the single ranking V6 section 9 defines.
const SEGMENTS: Array<{ value: LeaderboardSegment; label: string }> = [
  { value: "diet_gender", label: "Diet category + gender" },
  { value: "overall", label: "Overall" },
];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string; cat?: string }>;
}) {
  // Hidden from participants at BCJ's request. Enforced here rather than only
  // in the navigation, so typing the URL does not reach it either.
  if (!PARTICIPANT_LEADERBOARD_VISIBLE) notFound();

  const session = await requireParticipant();
  const settings = await getSettings();
  const params = await searchParams;

  const segment: LeaderboardSegment = SEGMENTS.some((s) => s.value === params.by)
    ? (params.by as LeaderboardSegment)
    : "diet_gender";

  const rows = await getLeaderboard();
  const allGroups = groupLeaderboard(rows, segment);

  // One tab per diet category. With six categories the divided board is
  // twelve stacked tables, which is a lot of scrolling to compare the two
  // halves of one category — the comparison an organiser actually makes.
  const categories = segment === "diet_gender" ? leaderboardCategories(allGroups) : [];
  const category =
    categories.some((c) => c.code === params.cat) ? params.cat : undefined;
  const groups = category
    ? allGroups.filter((g) => g.categoryCode === category)
    : allGroups;
  const maxScore = settings.totalWeeks * 100;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Leaderboard
        </h1>
        <p className="text-muted-foreground">
          Ranked by final score out of {maxScore}. Ties share a rank, with the
          earlier registration listed first.
        </p>
      </header>

      {/* ---- division selector ---- */}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {SEGMENTS.map((option) => (
          <Button
            key={option.value}
            asChild
            size="sm"
            variant={segment === option.value ? "secondary" : "ghost"}
            className="h-11"
          >
            <Link
              href={
                option.value === "diet_gender"
                  ? "/app/leaderboard"
                  : `/app/leaderboard?by=${option.value}`
              }
            >
              {option.label}
            </Link>
          </Button>
        ))}
      </div>

      {categories.length > 1 && (
        <div
          className="flex flex-wrap gap-1 rounded-lg border bg-card p-1"
          role="group"
          aria-label="Diet category"
        >
          <Button
            asChild
            size="sm"
            variant={category ? "ghost" : "secondary"}
            className="h-11"
          >
            <Link href="/app/leaderboard">All categories</Link>
          </Button>
          {categories.map((option) => (
            <Button
              key={option.code}
              asChild
              size="sm"
              variant={category === option.code ? "secondary" : "ghost"}
              className="h-11"
            >
              <Link href={`/app/leaderboard?cat=${encodeURIComponent(option.code)}`}>
                {option.title}
              </Link>
            </Button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center">
          <Trophy className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 font-medium">No scores yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The leaderboard fills in as participants log their first days.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <LeaderboardTable
              key={group.key}
              group={group}
              showTitle={segment !== "overall"}
              meId={session.participantId}
            />
          ))}
        </div>
      )}

      <p className="text-sm leading-relaxed text-muted-foreground">
        {segment === "overall"
          ? "Only display names appear here. Registration IDs, contact details and health information are never shown on the leaderboard."
          : "Each diet category is ranked separately for men and for women. Every division is scored the same way — each day counts as a percentage of that day's own maximum — so no group is advantaged."}
      </p>
    </div>
  );
}

function LeaderboardTable({
  group,
  showTitle,
  meId,
}: {
  group: LeaderboardGroup;
  showTitle: boolean;
  meId: string;
}) {
  return (
    <section className="space-y-2">
      {showTitle && (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
          <span className="tabular text-sm text-muted-foreground">
            {group.rows.length}{" "}
            {group.rows.length === 1 ? "participant" : "participants"}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead className="text-right">Final score</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Percentage
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.rows.map((row) => {
              const isMe = row.participantId === meId;
              const medal = row.rank <= 3;
              return (
                <TableRow
                  key={row.participantId}
                  className={cn(isMe && "bg-secondary/60")}
                >
                  <TableCell>
                    <span
                      className={cn(
                        "tabular inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                        medal
                          ? "bg-gold-300 text-green-950"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {row.rank}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.displayName}
                    {isMe && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        you
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">
                    {row.finalScore.toFixed(1)}
                  </TableCell>
                  <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">
                    {row.finalPercentage.toFixed(1)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
