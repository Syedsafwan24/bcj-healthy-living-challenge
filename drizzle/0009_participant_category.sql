-- The competition category replaces gender, so that children are ranked in
-- their own prize division rather than against adults.
--
-- A rename rather than a new column: every row already holds 'male' or
-- 'female', both of which stay valid, so no data has to move and nobody's
-- division changes without an organiser deciding it. 'kids' is the third
-- value, and an organiser sets it from /admin/participants.
ALTER TABLE "participants" RENAME COLUMN "gender" TO "category";
