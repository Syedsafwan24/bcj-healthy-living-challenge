import "server-only";

import { hash, verify } from "@node-rs/argon2";

export { MIN_PASSWORD_LENGTH } from "./password-policy";

/**
 * Password hashing — build specification section 2.3.
 *
 * argon2id at the current OWASP parameters. Minimum length 12 characters,
 * no composition rules and no forced rotation, which is what NIST 800-63B
 * recommends.
 *
 * OWASP Password Storage Cheat Sheet, argon2id: 19 MiB of memory,
 * two iterations, one degree of parallelism.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // KiB, 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashSecret(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed hash, so a corrupted row
 * fails closed instead of leaking a 500 that distinguishes it from a wrong
 * password.
 */
export async function verifySecret(
  storedHash: string | null | undefined,
  plain: string,
): Promise<boolean> {
  if (!storedHash) return false;
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

/**
 * Sign-in must take the same time whether or not the email exists
 * (section 2.3). When no account is found, hash a throwaway value so the
 * response is not measurably faster.
 */
export async function burnTime(): Promise<void> {
  await hash("timing-equalisation-placeholder", ARGON2_OPTIONS);
}
