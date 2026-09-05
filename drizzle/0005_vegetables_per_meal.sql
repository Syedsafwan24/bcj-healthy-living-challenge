ALTER TABLE "daily_entries" ADD COLUMN "c5_vegetables_dinner" boolean;--> statement-breakpoint
-- Rows written before this answered one question: vegetables with *every*
-- main meal. That answer covers dinner as much as lunch, so it is copied
-- across. Without this a day that scored 10 for C5 would silently drop to 5
-- the next time anything recomputed it.
UPDATE "daily_entries" SET "c5_vegetables_dinner" = "c5_vegetables" WHERE "c5_vegetables" IS NOT NULL;
