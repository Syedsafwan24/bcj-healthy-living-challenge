/**
 * Checks the SMTP settings and optionally sends a real message.
 *
 *   npm run mail:test                    verify the connection only
 *   npm run mail:test -- you@example.com verify, then send a test email
 *
 * Run this before launch. A mail transport that is misconfigured fails
 * silently by design — a registration is never lost because an email could
 * not be sent — so nothing else will tell you it is broken.
 */

import { createRequire } from "node:module";

import "../src/db/load-env";

// `lib/env` and `lib/email` are marked "server-only", which throws outside a
// React server environment. Stub it before the dynamic imports below so this
// script can exercise the real modules rather than a copy of them.
const nodeRequire = createRequire(import.meta.url);
nodeRequire.cache[nodeRequire.resolve("server-only")] = {
  exports: {},
} as never;

async function main() {
  const recipient = process.argv[2];

  const { env } = await import("../src/lib/env");
  const { verifyTransport, sendRegistrationId } = await import("../src/lib/email");

  console.log("SMTP settings");
  console.log("  host:     ", env.smtpHost || "(not set)");
  console.log("  port:     ", env.smtpPort);
  console.log("  secure:   ", env.smtpSecure, env.smtpSecure ? "(implicit TLS)" : "(STARTTLS)");
  console.log("  user:     ", env.smtpUser || "(not set)");
  console.log("  password: ", env.smtpPassword ? "set" : "(not set)");
  console.log("  from:     ", env.emailFrom);
  console.log();

  const result = await verifyTransport();

  if (!result.ok) {
    console.error("FAILED:", result.reason);
    console.error(
      "\nCommon causes:\n" +
        "  - wrong port/secure pair. 465 needs secure=true, 587 needs secure=false\n" +
        "  - the mailbox needs an app password rather than the account password\n" +
        "  - the host blocks outbound SMTP from this network\n",
    );
    process.exit(1);
  }

  console.log("Connection and credentials accepted.");

  if (!recipient) {
    console.log("\nPass an address to send a real test message:");
    console.log("  npm run mail:test -- you@example.com");
    return;
  }

  console.log(`\nSending a sample registration email to ${recipient}...`);
  const sent = await sendRegistrationId({
    to: recipient,
    fullName: "Test Participant",
    registrationId: "BCJ0001-TEST",
  });

  if (sent.sent) {
    console.log(`Sent. Message id: ${sent.id}`);
    console.log("Check the inbox, and the spam folder if it is not there.");
  } else {
    console.error("The transport accepted the connection but the send failed.");
    console.error("See the error logged above.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
