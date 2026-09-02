import "server-only";

/**
 * Environment — build specification section 13.
 *
 * Read through these helpers rather than process.env directly, so a missing
 * secret fails at the point of use with a message that names the variable.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. See section 13 of the build specification.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get totpEncryptionKey() {
    return required("TOTP_ENCRYPTION_KEY");
  },
  get totpIssuer() {
    return process.env.TOTP_ISSUER ?? "BCJ Challenge";
  },
  get appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  },
  /* ---- SMTP, the mail transport (specification section 6 names Resend;
     BCJ chose SMTP on their own domain instead) ---- */
  get smtpHost() {
    return process.env.SMTP_HOST ?? "";
  },
  get smtpPort() {
    return Number(process.env.SMTP_PORT ?? 465);
  },
  get smtpUser() {
    return process.env.SMTP_USER ?? "";
  },
  get smtpPassword() {
    return process.env.SMTP_PASSWORD ?? "";
  },
  /**
   * Implicit TLS on 465, STARTTLS on 587. Derived from the port unless
   * SMTP_SECURE says otherwise, because getting this wrong is the single most
   * common cause of a mailer that hangs rather than fails.
   */
  get smtpSecure() {
    const explicit = process.env.SMTP_SECURE;
    if (explicit) return explicit.toLowerCase() === "true";
    return Number(process.env.SMTP_PORT ?? 465) === 465;
  },
  /** True once enough is configured to actually send. */
  get smtpConfigured() {
    return Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
    );
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "BCJ Healthy Living <no-reply@bcjed.com>";
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  /** Optional. Blank disables the check. */
  get adminIpAllowlist(): string[] {
    const raw = process.env.ADMIN_IP_ALLOWLIST ?? "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  /**
   * Two-factor authentication for admin accounts.
   *
   * Specification section 2.3 requires it on every admin sign-in, because an
   * admin can change any score, read every participant's health data and
   * alter the settings that drive the whole competition. It is a switch
   * rather than a hard-coded rule so BCJ can run without an authenticator
   * app during setup, but it should be left on in production.
   *
   * Defaults to on: only an explicit "false" turns it off.
   */
  get adminRequireTotp(): boolean {
    return (process.env.ADMIN_REQUIRE_TOTP ?? "true").toLowerCase() !== "false";
  },

  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
