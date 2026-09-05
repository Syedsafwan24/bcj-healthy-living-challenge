import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/lib/env";

/**
 * Email — build specification section 6.
 *
 * Two jobs only: delivering a registration ID at sign-up, and re-sending
 * every ID registered against an address when a participant loses theirs
 * (section 2.1). Admin invitations use the same transport.
 *
 * The specification names Resend. BCJ chose SMTP on their own domain instead
 * (31 August 2026), so this sends through nodemailer.
 *
 * With SMTP unconfigured the message is logged rather than sent, so the
 * registration flow can be exercised in development without a mail account.
 */

let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!env.smtpConfigured) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure, // true for 465, false for 587 with STARTTLS
    auth: { user: env.smtpUser, pass: env.smtpPassword },
    // Reuse the connection between messages. Roughly half the cost of a send
    // is the TLS handshake and AUTH, so a registration that sends both the
    // participant email and the organiser alert pays it once instead of twice.
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    // A slow mail host must not hold a request open indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

interface Attachment {
  filename: string;
  content: Buffer;
}

interface Message {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Extra files beyond the inline logo, e.g. the 90-day handout. */
  attachments?: Attachment[];
}

/**
 * The BCJ crest, embedded rather than linked.
 *
 * Most email clients block remote images by default, so a URL would leave a
 * blank box for many recipients; a CID attachment always renders. The file is
 * a small copy of public/logo.png — the full crest is 536 kB and far too
 * heavy to attach to every message.
 */
const LOGO_CID = "bcj-logo";
let logoBuffer: Buffer | null | undefined;

function getLogo(): Buffer | null {
  if (logoBuffer !== undefined) return logoBuffer;
  try {
    logoBuffer = readFileSync(join(process.cwd(), "public/logo-email.png"));
  } catch (error) {
    // The mail still goes out; the header simply falls back to text.
    console.error("[email] logo not found, sending without it", error);
    logoBuffer = null;
  }
  return logoBuffer;
}

/**
 * BCJ's 90-day handout, attached to the registration email so a new
 * participant has the plan in hand from day one rather than needing to find
 * it on the site.
 *
 * Read once and cached, the same as the logo. Missing is not fatal: the
 * registration ID is the thing that must arrive, so a handout that failed to
 * load is dropped rather than blocking the send.
 */
const HANDOUT_FILENAME = "BCJ Healthy Living Challenge - 90 Day Handout.pdf";
let handoutBuffer: Buffer | null | undefined;

function getHandout(): Buffer | null {
  if (handoutBuffer !== undefined) return handoutBuffer;
  try {
    handoutBuffer = readFileSync(
      join(process.cwd(), "src/assets/bcj-90-day-handout.pdf"),
    );
  } catch (error) {
    console.error("[email] 90-day handout not found, sending without it", error);
    handoutBuffer = null;
  }
  return handoutBuffer;
}

async function send(message: Message): Promise<{ sent: boolean; id?: string }> {
  const transport = getTransport();

  const recipients = [message.to].flat().filter(Boolean);
  if (recipients.length === 0) return { sent: false };

  if (!transport) {
    console.info(
      [
        `[email] SMTP is not configured. Would have sent to ${[message.to].flat().join(", ")}`,
        `Subject: ${message.subject}`,
        message.text,
      ].join("\n"),
    );
    return { sent: false };
  }

  try {
    const logo = getLogo();
    const info = await transport.sendMail({
      from: env.emailFrom,
      to: recipients,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: [
        ...(logo
          ? [
              {
                filename: "bcj-logo.png",
                content: logo,
                cid: LOGO_CID,
                contentDisposition: "inline" as const,
              },
            ]
          : []),
        ...(message.attachments ?? []).map((a) => ({
          filename: a.filename,
          content: a.content,
          contentDisposition: "attachment" as const,
        })),
      ],
    });
    return { sent: true, id: info.messageId };
  } catch (error) {
    // A failed email must not lose a registration. The caller has already
    // committed the row, and the ID is also shown on screen.
    console.error("[email] send failed", error);
    return { sent: false };
  }
}

/**
 * Checks the SMTP settings without sending anything. Used by the mail test
 * script and by /admin/settings to show whether email is working.
 */
export async function verifyTransport(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const transport = getTransport();
  if (!transport) {
    return {
      ok: false,
      reason:
        "SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD.",
    };
  }
  try {
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const BRAND = "#023223"; // green-900, BCJ brand colour
const ACCENT = "#0B8256"; // green-600

function layout(heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F7FAF9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#161C19">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E2E8E5">
    <tr><td style="background:${BRAND};padding:18px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:12px;vertical-align:middle">
          <img src="cid:${LOGO_CID}" width="44" height="44" alt="Bhatkal Community Jeddah"
               style="display:block;width:44px;height:44px;border:0;border-radius:22px">
        </td>
        <td style="vertical-align:middle;color:#ffffff;font-size:15px;font-weight:600;line-height:1.3">
          BCJ Healthy Living<br>
          <span style="font-size:11px;font-weight:400;letter-spacing:.1em;text-transform:uppercase;color:#A0E7C6">12-week challenge</span>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:${BRAND}">${heading}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:16px 24px;background:#F7FAF9;color:#4E5C56;font-size:12px;line-height:1.6">
      Bhatkal Community Jeddah · <a href="${env.appUrl}" style="color:${ACCENT}">${appHost()}</a><br>
      This message was sent because someone registered this address for the 12-week challenge.
    </td></tr>
  </table>
</body></html>`;
}

/**
 * The site's own hostname, for the email footer.
 *
 * Derived from NEXT_PUBLIC_APP_URL rather than written in, so moving the app
 * to a new address does not leave every email pointing at the old one.
 */
function appHost(): string {
  try {
    return new URL(env.appUrl).host;
  } catch {
    return env.appUrl;
  }
}

function idBlock(registrationId: string): string {
  return `<p style="margin:0 0 8px;color:#4E5C56;font-size:14px">Your registration ID</p>
    <p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:26px;letter-spacing:.06em;font-weight:600;color:${BRAND};background:#EBFAF2;border:1px solid #A0E7C6;border-radius:10px;padding:14px 18px;display:inline-block">${registrationId}</p>`;
}

/** Sent once at registration. The ID is also shown on /register/success. */
export async function sendRegistrationId(params: {
  to: string;
  fullName: string;
  registrationId: string;
}) {
  const url = `${env.appUrl}/login`;
  const handout = getHandout();
  return send({
    to: params.to,
    subject: `Your BCJ Challenge registration ID — ${params.registrationId}`,
    attachments: handout
      ? [{ filename: HANDOUT_FILENAME, content: handout }]
      : undefined,
    text: [
      `As-salamu alaykum ${params.fullName},`,
      "",
      `You are registered for the BCJ Healthy Living Challenge.`,
      `Your registration ID is ${params.registrationId}`,
      "",
      `This ID is how you sign in. There is no password. Keep it somewhere safe.`,
      `You can sign in straight away — there is nothing to wait for.`,
      `Sign in at ${url}`,
      "",
      `If several people registered from this address, each has their own ID and signs in separately.`,
      ...(handout ? ["", `Your 90-day handout is attached to this email.`] : []),
    ].join("\n"),
    html: layout(
      `As-salamu alaykum ${escapeHtml(params.fullName)}`,
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6">You are registered for the BCJ Healthy Living Challenge, 12 weeks of daily logging.</p>
       ${idBlock(escapeHtml(params.registrationId))}
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6">This ID is how you sign in. There is no password, so keep it somewhere safe. You can sign in straight away — there is nothing to wait for. If several people registered from this address, each has their own ID and signs in separately.</p>
       <p style="margin:0"><a href="${url}" style="background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:600">Sign in</a></p>${
         handout
           ? `<p style="margin:20px 0 0;font-size:13px;color:#4E5C56">Your 90-day handout is attached to this email.</p>`
           : ""
       }`,
    ),
  });
}

/**
 * Lost-ID recovery, section 2.1: every ID registered against the address is
 * re-sent to that address. Nothing is revealed to the person who typed it
 * unless they can read that mailbox.
 */
export async function sendRecoveredIds(params: {
  to: string;
  people: Array<{ fullName: string; registrationId: string; status: string }>;
}) {
  const url = `${env.appUrl}/login`;
  const rows = params.people
    .map(
      (p) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8E5;font-size:15px">${escapeHtml(
          p.fullName,
        )}${p.status !== "active" ? ` <span style="color:#4E5C56;font-size:13px">(${escapeHtml(p.status)})</span>` : ""}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E2E8E5;text-align:right;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;font-weight:600;color:${BRAND}">${escapeHtml(
          p.registrationId,
        )}</td></tr>`,
    )
    .join("");

  return send({
    to: params.to,
    subject: "Your BCJ Challenge registration IDs",
    text: [
      "These are the registration IDs held against this email address:",
      "",
      ...params.people.map((p) => `${p.fullName}: ${p.registrationId}`),
      "",
      `Sign in at ${url}`,
    ].join("\n"),
    html: layout(
      "Your registration IDs",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">These are the registration IDs held against this email address. Each person signs in separately with their own ID.</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${rows}</table>
       <p style="margin:0"><a href="${url}" style="background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:600">Sign in</a></p>`,
    ),
  });
}

/** Admin invite, section 2.3: single-use token valid for 48 hours. */
export async function sendAdminInvite(params: {
  to: string;
  name: string;
  token: string;
  invitedBy: string;
}) {
  const url = `${env.appUrl}/admin/invite/${params.token}`;
  return send({
    to: params.to,
    subject: "You have been invited as a BCJ Challenge administrator",
    text: [
      `${params.name},`,
      "",
      `${params.invitedBy} has invited you to administer the BCJ Healthy Living Challenge.`,
      "",
      `Set your password and enrol your authenticator app here. The link is single use and expires in 48 hours:`,
      url,
      "",
      "You will need an authenticator app such as Google Authenticator, Microsoft Authenticator or Aegis. Two-factor authentication is required on every sign-in and cannot be disabled.",
    ].join("\n"),
    html: layout(
      "Administrator invitation",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${escapeHtml(
        params.invitedBy,
      )} has invited you to administer the BCJ Healthy Living Challenge.</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6">You will set a password and enrol an authenticator app in one step. The link below is single use and expires in 48 hours.</p>
       <p style="margin:0 0 20px"><a href="${url}" style="background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:600">Accept the invitation</a></p>
       <p style="margin:0;font-size:13px;line-height:1.6;color:#4E5C56">Two-factor authentication is required on every sign-in and cannot be disabled. Have Google Authenticator, Microsoft Authenticator or Aegis ready before you start.</p>`,
    ),
  });
}

/**
 * Tells the organisers that someone has registered, so a pending participant
 * is not left waiting for approval.
 *
 * Deliberately carries no health fields. Blood pressure, diabetes status and
 * blood sugar are visible only on the participant record, where the view is
 * written to the audit log (specification sections 2.3 and 11); putting them
 * in an email would route them around that.
 */
/**
 * The evening nudge — one message a day to a participant who has not filled
 * in today, sent a few hours before the cutoff.
 *
 * Only ever sent to somebody who has not recorded the day, so a participant
 * who keeps up never hears from it. It carries no score and no health
 * information: a reminder that sits unread in an inbox should not be a
 * disclosure (specification section 11).
 *
 * Every one says how to stop them. A daily email for twelve weeks with no
 * way out is how a sending domain ends up in spam folders, and the switch
 * lives on a screen the participant already signs into.
 */
export async function sendDailyReminder(params: {
  to: string;
  firstName: string;
  weekNo: number;
  emptyDays: number;
}) {
  const url = `${env.appUrl}/app`;
  const settingsUrl = `${env.appUrl}/app/profile`;

  const behind =
    params.emptyDays > 0
      ? `You also have ${params.emptyDays} earlier day${
          params.emptyDays === 1 ? "" : "s"
        } still empty. You can fill in any day until the challenge ends.`
      : "";

  return send({
    to: params.to,
    subject: `Fill in today — BCJ Healthy Living, week ${params.weekNo}`,
    text: [
      `As-salamu alaykum ${params.firstName},`,
      "",
      `You have not filled in today yet. It takes under a minute.`,
      url,
      ...(behind ? ["", behind] : []),
      "",
      `To stop these reminders, open ${settingsUrl} and turn them off.`,
    ].join("\n"),
    html: layout(
      `As-salamu alaykum ${escapeHtml(params.firstName)}`,
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6">You have not filled in today yet — week ${params.weekNo} of the challenge. It takes under a minute.</p>
       <p style="margin:0 0 20px"><a href="${url}" style="background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:600">Fill in today</a></p>
       ${
         behind
           ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${escapeHtml(behind)}</p>`
           : ""
       }
       <p style="margin:0;font-size:13px;color:#4E5C56">Would rather not get these? <a href="${settingsUrl}" style="color:${ACCENT}">Turn reminders off</a> in My details.</p>`,
    ),
  });
}

export async function sendNewRegistrationAlert(params: {
  to: string[];
  fullName: string;
  registrationId: string;
  email: string;
  mobile: string;
  // Neither is collected at registration any more, so either may be absent.
  age: number | null;
  weightKg: string | null;
  dietCategory: string | null;
  dietNeedsReview: boolean;
  participantId: string;
}) {
  const reviewUrl = `${env.appUrl}/admin/participants/${params.participantId}`;

  const facts: Array<[string, string]> = [
    ["Registration ID", params.registrationId],
    ["Email", params.email],
    ["Mobile", params.mobile],
    ["Age", params.age != null ? String(params.age) : "Not given"],
    ["Weight", params.weightKg != null ? `${params.weightKg} kg` : "Not given"],
    [
      "Suggested diet plan",
      params.dietCategory
        ? params.dietNeedsReview
          ? `${params.dietCategory} — needs review`
          : params.dietCategory
        : "None matched — assign one",
    ],
  ];

  const rows = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #E2E8E5;color:#4E5C56;font-size:14px">${escapeHtml(
          label,
        )}</td>
        <td style="padding:8px 0;border-bottom:1px solid #E2E8E5;text-align:right;font-size:14px;font-weight:500">${escapeHtml(
          value,
        )}</td></tr>`,
    )
    .join("");

  return send({
    to: params.to,
    subject: `New registration — ${params.fullName} (${params.registrationId})`,
    text: [
      `${params.fullName} has registered for the BCJ Healthy Living Challenge.`,
      "",
      ...facts.map(([label, value]) => `${label}: ${value}`),
      "",
      "They are active and can start logging immediately. Confirm their diet plan when you get a chance.",
      `Review: ${reviewUrl}`,
    ].join("\n"),
    html: layout(
      "New registration",
      `<p style="margin:0 0 18px;font-size:15px;line-height:1.6"><strong>${escapeHtml(
        params.fullName,
      )}</strong> has registered for the challenge.</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${rows}</table>
       ${
         params.dietNeedsReview || !params.dietCategory
           ? `<p style="margin:0 0 20px;padding:12px 14px;background:#FDF7E7;border:1px solid #EFCB6A;border-radius:8px;font-size:14px;line-height:1.6;color:#8A6408">The diet plan could not be matched automatically. Confirm it when you get a chance (open item O-11).</p>`
           : ""
       }
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6">They are active and can start logging immediately. Confirm their diet plan when you get a chance.</p>
       <p style="margin:0"><a href="${reviewUrl}" style="background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:600">Review this registration</a></p>`,
    ),
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
