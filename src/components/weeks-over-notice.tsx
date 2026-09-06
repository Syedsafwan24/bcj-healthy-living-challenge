import { Hourglass } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatIsoDateLong, type IsoDate } from "@/lib/dates";

/**
 * Shown between the last day of week 12 and the organisers closing the
 * competition.
 *
 * That gap is deliberate, and it needs explaining or it reads as a bug: the
 * challenge is plainly over, yet the days are still open. Somebody who is
 * behind must understand they still have time, and somebody who is finished
 * must understand nothing more can be earned — so it says both, and says the
 * end of it is a decision rather than a date, because nobody can be told when
 * it will come.
 */
export function WeeksOverNotice({ lastDay }: { lastDay: IsoDate }) {
  return (
    <Alert>
      <Hourglass className="size-4" />
      <AlertTitle>The 12 weeks are over</AlertTitle>
      <AlertDescription>
        The last day was {formatIsoDateLong(lastDay)}, so there is nothing new
        to earn. You can still go back and fill in any day you missed — every
        one you leave empty scores 0%. The BCJ organisers will close the
        challenge once everyone has had their chance, and after that no day can
        be changed.
      </AlertDescription>
    </Alert>
  );
}
