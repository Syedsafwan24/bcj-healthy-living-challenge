import Link from "next/link";
import { CalendarX2, Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatIsoDateLong } from "@/lib/dates";
import type { EntryBlock } from "@/lib/entry-blocks";

/**
 * The last chance to catch a four-week block up.
 *
 * Shown for the whole of a block's catch-up week — week 5 for weeks 1–4, week
 * 9 for weeks 5–8. After that the block is final and every empty day in it
 * scores 0% for good, so this is the only warning anybody gets and it has to
 * be impossible to miss: what closes, when, and how many days they personally
 * still have open.
 *
 * It says nothing when the participant has nothing outstanding. A warning that
 * fires at people who are up to date is a warning people learn to ignore.
 */
export function BlockClosingNotice({
  block,
  emptyDays,
  daysLeft,
}: {
  block: EntryBlock;
  /** Empty days inside this block, for this participant. */
  emptyDays: number;
  /** Days left to fill them in, counting today. */
  daysLeft: number;
}) {
  if (!block.closesAfter) return null;

  const urgent = daysLeft <= 2;

  return (
    <Alert
      className={
        emptyDays > 0
          ? "border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/20"
          : undefined
      }
    >
      <CalendarX2 className="size-4" />
      <AlertTitle>
        {block.label} close after {formatIsoDateLong(block.closesAfter)}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        {emptyDays > 0 ? (
          <p>
            You have{" "}
            <strong>
              {emptyDays} empty day{emptyDays === 1 ? "" : "s"}
            </strong>{" "}
            in {block.label.toLowerCase()} and{" "}
            <strong>
              {daysLeft} day{daysLeft === 1 ? "" : "s"}
            </strong>{" "}
            left to fill them in. {urgent ? "After that they are final and" : "Once that date passes they are final, and"}{" "}
            each one scores 0% for good.
          </p>
        ) : (
          <p>
            This is the last week to change anything in{" "}
            {block.label.toLowerCase()}. You have filled in every day, so there
            is nothing to do — after {formatIsoDateLong(block.closesAfter)} they
            can no longer be changed.
          </p>
        )}
        {emptyDays > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="h-11">
              <Link href="/app/history">Find my empty days</Link>
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Shown on a day that belongs to a block whose deadline has passed.
 *
 * Separate from the generic "closed for changes" banner because the reason
 * matters: this is not the challenge being over, it is one block of it, and
 * the rest of the challenge is still open for business.
 */
export function BlockClosedNotice({ block }: { block: EntryBlock }) {
  if (!block.closesAfter) return null;

  return (
    <Alert>
      <Lock className="size-4" />
      <AlertTitle>{block.label} are closed</AlertTitle>
      <AlertDescription>
        They closed after {formatIsoDateLong(block.closesAfter)} and can no
        longer be changed here. The later weeks are still open — ask a BCJ
        organiser if this day needs correcting.
      </AlertDescription>
    </Alert>
  );
}
