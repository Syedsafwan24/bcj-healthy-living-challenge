import Link from "next/link";
import { Trophy } from "lucide-react";
import type { Metadata } from "next";

import { ListExport } from "@/components/list-export";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import {
  getLeaderboard,
  groupLeaderboard,
  leaderboardCategories,
  type LeaderboardGroup,
  type LeaderboardSegment,
} from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

/**
 * `/admin/leaderboard` — the same ranking participants see, so an organiser
 * can check standings without signing in as someone.
 *
 * The overall division is the ranking V6 section 9 defines. The diet-category
 * and gender divisions are additions BCJ asked for; neither source document
 * divides the leaderboard, and because every day is scored as a percentage of
 * its own maximum no division is advantaged.
 *
 * Full names are shown here, which the participant-facing board does not do.
 * This screen is behind an organiser session, and identifying two people who
 * chose similar display names is exactly what an organiser needs.
 */

// Category + gender is the default: it is the division BCJ awards prizes on.
// Overall stays available as the single ranking V6 section 9 defines.
const SEGMENTS: Array<{ value: LeaderboardSegment; label: string }> = [
  { value: "diet_gender", label: "Diet category + gender" },
  { value: "overall", label: "Overall" },
];

export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string; cat?: string }>;
}) {
  await requireAdmin();
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} active participant{rows.length === 1 ? "" : "s"} ranked
            by final score out of {maxScore}. This is what participants see, with
            full names added.
          </p>
        </div>
        {rows.length > 0 && <ListExport kind="participants" status="active" />}
      </header>

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
                  ? "/admin/leaderboard"
                  : `/admin/leaderboard?by=${option.value}`
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
            <Link href="/admin/leaderboard">All categories</Link>
          </Button>
          {categories.map((option) => (
            <Button
              key={option.code}
              asChild
              size="sm"
              variant={category === option.code ? "secondary" : "ghost"}
              className="h-11"
            >
              <Link href={`/admin/leaderboard?cat=${encodeURIComponent(option.code)}`}>
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
            The leaderboard fills in once active participants start logging days.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <AdminLeaderboardTable
              key={group.key}
              group={group}
              showTitle={segment !== "overall"}
            />
          ))}
        </div>
      )}

      <p className="text-sm leading-relaxed text-muted-foreground">
        {segment === "diet_gender"
          ? "Prizes are decided on these divisions: each diet category is split by gender, and every division is ranked from 1. Only active participants appear; anyone on hold is excluded."
          : "Overall is the single ranking the challenge rules define. Prizes are decided on the diet category and gender divisions. Only active participants appear; anyone on hold is excluded."}
      </p>
    </div>
  );
}

function AdminLeaderboardTable({
  group,
  showTitle,
}: {
  group: LeaderboardGroup;
  showTitle: boolean;
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

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead className="hidden lg:table-cell">Diet category</TableHead>
              <TableHead className="text-right">Final score</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Percentage
              </TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.rows.map((row) => (
              <TableRow key={row.participantId}>
                <TableCell>
                  <span
                    className={cn(
                      "tabular inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                      row.rank <= 3
                        ? "bg-gold-300 text-green-950"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {row.rank}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{row.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.gender === "male" ? "Male" : "Female"}
                  </p>
                </TableCell>
                <TableCell className="hidden text-sm lg:table-cell">
                  {row.dietCategory ?? (
                    <span className="text-muted-foreground">Not assigned</span>
                  )}
                </TableCell>
                <TableCell className="tabular text-right font-semibold">
                  {row.finalScore.toFixed(1)}
                </TableCell>
                <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">
                  {row.finalPercentage.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline" className="h-11">
                    <Link href={`/admin/participants/${row.participantId}`}>
                      Open
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
