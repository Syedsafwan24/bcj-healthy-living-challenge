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
  /**
   * The site's own absolute URL, e.g. https://health.bcjed.com.
   *
   * Every link BCJ sends anyone is built from this: the sign-in link in a
   * registration email, the recovered-ID email, an organiser invitation. It
   * is the one setting that is silently useless when wrong — the app runs
   * perfectly and every email points somewhere nobody can reach — so an
   * unset value in production is reported rather than quietly replaced with
   * localhost.
   *
   * Trailing slashes are stripped, because callers append "/login".
   */
  get appUrl() {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (configured) return configured.replace(/\/+$/, "");

    if (process.env.NODE_ENV === "production") {
      console.error(
        "[env] NEXT_PUBLIC_APP_URL is not set. Every link in every email " +
          "will point at localhost. Set it to the site's own address.",
      );
    }
    return "https://health.bcjed.com";
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
  /* ---- web push ---- */
  get vapidPublicKey() {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  },
  get vapidPrivateKey() {
    return process.env.VAPID_PRIVATE_KEY ?? "";
  },
  get vapidSubject() {
    return process.env.VAPID_SUBJECT ?? "mailto:no-reply@bcjed.com";
  },
  /**
   * Notifications are offered only when a key pair is configured. Without
   * one the browser cannot subscribe at all, so the app hides the option
   * rather than showing a switch that silently fails.
   */
  get pushConfigured() {
    return Boolean(this.vapidPublicKey && this.vapidPrivateKey);
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
