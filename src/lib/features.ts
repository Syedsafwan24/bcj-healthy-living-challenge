/**
 * Feature switches that are BCJ's decision rather than the specification's.
 *
 * Kept in one file so a change of mind is one line, not a hunt through pages.
 */

/**
 * Whether participants can see the leaderboard.
 *
 * Specification section 5.1 lists `/app/leaderboard` as a participant route and
 * V6 section 9 defines the ranking, but BCJ chose to keep standings private to
 * organisers (1 September 2026) — so participants compete against their own
 * score rather than watching each other.
 *
 * Organisers always keep `/admin/leaderboard`. Set this to true to publish the
 * board to participants, which is the usual thing to do once the competition
 * has finished and the winners are announced.
 */
export const PARTICIPANT_LEADERBOARD_VISIBLE = false;
