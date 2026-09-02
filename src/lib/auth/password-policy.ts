/**
 * Password policy — build specification section 2.3.
 *
 * Minimum length 12 characters, with no composition rules and no forced
 * rotation, which is what NIST 800-63B recommends.
 *
 * Kept separate from `password.ts` so the rule can be shared with client
 * forms without pulling in argon2, which is server-only.
 */
export const MIN_PASSWORD_LENGTH = 12;
