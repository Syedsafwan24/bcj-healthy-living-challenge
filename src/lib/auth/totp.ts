import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import * as OTPAuth from "otpauth";

import { env } from "@/lib/env";

/**
 * Two-factor authentication — build specification section 2.3.
 *
 * TOTP is mandatory for every admin account. There is no "remember this
 * device" option and no way to disable the second factor.
 *
 * The secret is encrypted at rest with AES-256-GCM using a key held in the
 * environment and not in the database, so a database dump alone does not
 * yield working second factors.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16;

function key(): Buffer {
  const raw = Buffer.from(env.totpEncryptionKey, "base64");
  if (raw.length !== 32) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY must be 32 bytes, base64 encoded. " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return raw;
}

/** Stored layout: iv (12 bytes) || auth tag (16 bytes) || ciphertext. */
export function encryptSecret(plain: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptSecret(stored: Buffer): string {
  const iv = stored.subarray(0, IV_LENGTH);
  const tag = stored.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = stored.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/* ------------------------------------------------------------------ */
/* Enrolment and verification                                          */
/* ------------------------------------------------------------------ */

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secret: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: env.totpIssuer,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/** otpauth:// URI for the QR code shown during enrolment. */
export function totpUri(secret: string, accountLabel: string): string {
  return totp(secret, accountLabel).toString();
}

/**
 * Verifies a six-digit code. A window of 1 accepts the previous and next
 * 30-second step, which covers ordinary clock drift on a phone.
 */
export function verifyTotp(
  secret: string,
  token: string,
  label = "admin",
): boolean {
  const cleaned = token.replace(/\D/g, "");
  if (cleaned.length !== 6) return false;
  const delta = totp(secret, label).validate({ token: cleaned, window: 1 });
  return delta !== null;
}

/* ------------------------------------------------------------------ */
/* Recovery codes                                                      */
/* ------------------------------------------------------------------ */

/**
 * Eight single-use recovery codes shown once at enrolment. Only hashes are
 * stored. There is no password-reset link that bypasses TOTP: a locked-out
 * admin is restored by another super admin, or by a recovery code.
 */
export const RECOVERY_CODE_COUNT = 8;

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0 O 1 I L

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
    return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
  });
}

export function normaliseRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Constant-time comparison for fixed-length tokens. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
