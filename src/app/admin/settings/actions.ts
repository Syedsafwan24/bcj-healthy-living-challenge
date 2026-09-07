"use server";

import { revalidatePath } from "next/cache";
import { count, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  auditLog,
  dailyEntries,
  finalScores,
  participants,
  settings,
  weeklyScores,
} from "@/db/schema";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { verifyReauth } from "@/lib/auth/admin-auth";
import { requireAdmin } from "@/lib/auth/guards";
import { requestIp } from "@/lib/auth/session";
import { CHALLENGES } from "@/lib/challenges";
import {
  lockEntriesThrough,
  sweepMissingDays,
  unlockEntriesAfter,
} from "@/lib/close-out";
import { daysBetween, formatIsoDateLong, type IsoDate } from "@/lib/dates";
import { closedBlocks } from "@/lib/entry-blocks";
import { recomputeAll } from "@/lib/scoring-save";
import { competitionClock, getSettings } from "@/lib/settings";
import { fieldErrors, reauthSchema, settingsSchema } from "@/lib/validation";
import { RESET_PHRASE } from "./constants";

/**
 * Competition settings — build specification sections 5.2, 7 and 11.
 *
 * `rules_locked` implements V6 section 8, which forbids changing scoring
 * rules during the competition without formal approval. Once it is true,
 * start_date, total_weeks and max_active_week become read-only.
 *
 * Unlocking requires re-authentication with password and TOTP (section 2.3).
 */

export interface SettingsState {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}

/** Changing any of these moves everyone's score, so they recompute. */
const SCORING_FIELDS = ["startDate", "totalWeeks", "maxActiveWeek"];

/** The three the lock freezes. Disabled on the form, so never submitted. */
const FROZEN_FIELDS = ["startDate", "totalWeeks", "maxActiveWeek"] as const;

const TRACKED = [
  "startDate",
  "totalWeeks",
  "maxActiveWeek",
  "timezone",
  "submissionCutoff",
];

export async function updateSettings(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();
  const before = await getSettings();

  const raw = Object.fromEntries(formData) as Record<string, string>;

  // V6 section 8: the scoring rules are frozen once locked.
  //
  // The form disables those three inputs, and a disabled input is not
  // submitted — so when the rules are locked they arrive absent, not
  // unchanged. Validating the form as it stands would then fail on three
  // fields the organiser cannot even edit, and the Deadlines card below them
  // could never be saved at all. So the stored values are filled in here.
  //
  // An explicit attempt to change one is still refused rather than quietly
  // ignored, which is what a request built by hand would look like.
  if (before.rulesLocked) {
    const changed = FROZEN_FIELDS.some(
      (field) =>
        raw[field] !== undefined &&
        raw[field] !== String((before as unknown as Record<string, unknown>)[field]),
    );
    if (changed) {
      return {
        ok: false,
        error:
          "The scoring rules are locked. Unlock them below, with your password and authenticator code, before changing the start date, the number of weeks or the active weeks.",
      };
    }
    raw.startDate = before.startDate;
    raw.totalWeeks = String(before.totalWeeks);
    raw.maxActiveWeek = String(before.maxActiveWeek);
  }

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const values = parsed.data;

  // Nine challenges are configured. Raising max_active_week beyond that would
  // add 10 points a day to the maximum with no input to earn them, which is
  // the failure mode open item O-1 warns about.
  if (values.maxActiveWeek > CHALLENGES.length) {
    return {
      ok: false,
      errors: {
        maxActiveWeek:
          `Only ${CHALLENGES.length} challenges are configured. Resolving open item O-1 the other ` +
          `way means naming a tenth measured challenge and adding it to lib/challenges.ts first.`,
      },
    };
  }

  const [after] = await db
    .update(settings)
    .set({
      startDate: values.startDate,
      totalWeeks: values.totalWeeks,
      maxActiveWeek: values.maxActiveWeek,
      timezone: values.timezone,
      submissionCutoff: values.submissionCutoff,
    })
    .where(eq(settings.id, 1))
    .returning();

  const ip = await requestIp();
  const changed = await recordFieldChanges(
    {
      action: "settings.changed",
      entityType: "settings",
      actorAdminId: admin.adminId,
      ip,
    },
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
    TRACKED,
  );

  // A change to any scoring input rewrites every stored score, because a day
  // scored under the old rules would otherwise disagree with the screen.
  const scoringChanged = SCORING_FIELDS.some(
    (field) =>
      String((before as unknown as Record<string, unknown>)[field]) !==
      String((after as unknown as Record<string, unknown>)[field]),
  );

  let recomputed = 0;
  if (scoringChanged) {
    recomputed = await recomputeAll(after);
    await recordAudit({
      action: "scores.recomputed",
      entityType: "settings",
      actorAdminId: admin.adminId,
      newValue: `${recomputed} participants rescored after a scoring settings change`,
      ip,
    });
  }

  revalidatePath("/admin/settings");
  revalidatePath("/app");
  revalidatePath("/app/leaderboard");

  return {
    ok: true,
    message:
      changed === 0
        ? "Nothing changed."
        : `Saved. ${changed} setting${changed === 1 ? "" : "s"} changed.` +
          (recomputed > 0
            ? ` ${recomputed} participant${recomputed === 1 ? "" : "s"} rescored.`
            : ""),
  };
}

/**
 * Locks the scoring rules. Locking needs no re-authentication: it only ever
 * makes the competition stricter.
 */
export async function lockRules(): Promise<SettingsState> {
  const admin = await requireAdmin();

  await db.update(settings).set({ rulesLocked: true }).where(eq(settings.id, 1));

  await recordAudit({
    action: "settings.rules_locked",
    entityType: "settings",
    actorAdminId: admin.adminId,
    oldValue: false,
    newValue: true,
    ip: await requestIp(),
  });

  revalidatePath("/admin/settings");
  return { ok: true, message: "Scoring rules locked." };
}

/**
 * Unlocks the scoring rules. Section 2.3 requires the password and TOTP again,
 * regardless of an active session, before setting `rules_locked` back to false.
 */
export async function unlockRules(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const parsed = reauthSchema.safeParse({
    password: formData.get("password"),
    totp: formData.get("totp"),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const verified = await verifyReauth(
    admin.adminId,
    parsed.data.password,
    parsed.data.totp,
  );

  const ip = await requestIp();

  if (!verified) {
    await recordAudit({
      action: "admin.login_failed",
      entityType: "admin",
      entityId: admin.adminId,
      actorAdminId: admin.adminId,
      reason: "Re-authentication failed while unlocking the scoring rules",
      ip,
    });
    return {
      ok: false,
      error: "Those details were not accepted. The rules are still locked.",
    };
  }

  await recordAudit({
    action: "admin.reauthenticated",
    entityType: "admin",
    entityId: admin.adminId,
    actorAdminId: admin.adminId,
    reason: "Unlocking the scoring rules",
    ip,
  });

  await db.update(settings).set({ rulesLocked: false }).where(eq(settings.id, 1));

  await recordAudit({
    action: "settings.rules_unlocked",
    entityType: "settings",
    actorAdminId: admin.adminId,
    oldValue: true,
    newValue: false,
    reason: "Re-authenticated with password and TOTP",
    ip,
  });

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message:
      "Scoring rules unlocked. V6 section 8 expects a formal approval behind this — lock them again as soon as the change is made.",
  };
}

/* ------------------------------------------------------------------ */
/* Rescoring everyone                                                  */
/* ------------------------------------------------------------------ */

/**
 * Rescores every stored day for every active participant.
 *
 * A stored day keeps the points and the maximum it was given when it was
 * written. That is deliberate — a score should not silently change under
 * somebody's feet — but it means a change to the scoring rules only reaches
 * days recorded after it. Saving a scoring setting already triggers this;
 * this button is for the case where the rules changed in the code rather than
 * in the settings row, which no form can detect.
 *
 * It is not destructive: every day is recomputed from its own raw inputs and
 * its own date, through the same pure function that scored it originally. A
 * day whose inputs have not changed and whose rules have not changed comes
 * back identical, so running it twice is safe and running it needlessly costs
 * nothing but time.
 */
export async function recomputeEveryone(): Promise<SettingsState> {
  const admin = await requireAdmin();
  const settings = await getSettings();

  const count = await recomputeAll(settings);

  await recordAudit({
    action: "scores.recomputed",
    entityType: "settings",
    actorAdminId: admin.adminId,
    newValue: `${count} participants rescored`,
    reason: "Manual recomputation of every score from /admin/settings",
    ip: await requestIp(),
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");

  return {
    ok: true,
    message:
      count === 0
        ? "There are no active participants to rescore."
        : `Rescored every day for ${count} participant${count === 1 ? "" : "s"}.`,
  };
}

/* ------------------------------------------------------------------ */
/* Closing the competition                                             */
/* ------------------------------------------------------------------ */

/**
 * Declares the competition over.
 *
 * This is the deadline, not the end of week 12. The 12 weeks ending stops
 * anyone earning anything new, but the days stay writable afterwards so
 * participants who fell behind can go back and fill in what they missed. BCJ
 * decides how long that grace period runs, and this button ends it.
 *
 * Closing does three things, in this order, so the results are final the
 * moment the button is pressed rather than at the next cron run:
 *
 *   1. Records the closing time, which is what refuses every later write.
 *   2. Writes a `missing` row for every day nobody filled in, scoring it at
 *      0%, and rolls the weekly and final scores up. This is the same sweep
 *      the nightly job runs, so nothing is scored differently for having been
 *      closed by hand.
 *   3. Locks every recorded day, so even an organiser has to correct one
 *      deliberately and leave a trail.
 *
 * No re-authentication, on the same reasoning as locking the scoring rules:
 * it only ever makes the competition stricter, and it can be reopened — which
 * does ask for a password.
 */
export async function closeCompetition(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();
  const before = await getSettings();
  const clock = competitionClock(before);

  if (clock.closed) {
    return { ok: false, error: "The competition is already closed." };
  }
  if (!clock.started) {
    return {
      ok: false,
      error: `The challenge has not started yet. It begins on ${formatIsoDateLong(clock.firstDay)}.`,
    };
  }

  const closedAt = new Date();
  await db.update(settings).set({ closedAt }).where(eq(settings.id, 1));

  // Everything up to today, or the last day of week 12 if that came first.
  // Closing early must not score days that have not happened.
  const through: IsoDate =
    daysBetween(clock.today, clock.lastDay) < 0 ? clock.lastDay : clock.today;

  const after = await getSettings();
  const sweep = await sweepMissingDays(after, through);
  const locked = await lockEntriesThrough(clock.lastDay);

  const ip = await requestIp();
  await recordAudit({
    action: "competition.closed",
    entityType: "settings",
    actorAdminId: admin.adminId,
    oldValue: "open",
    newValue: `closed ${closedAt.toISOString()}; ${sweep.marked} days marked missing; ${locked} entries locked`,
    reason:
      String(formData.get("reason") ?? "").trim() ||
      (clock.weeksOver
        ? "The 12 weeks are over and the grace period has ended"
        : "Closed before the end of week 12"),
    ip,
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");

  return {
    ok: true,
    message:
      "The competition is closed. " +
      (sweep.marked > 0
        ? `${sweep.marked} unrecorded day${sweep.marked === 1 ? "" : "s"} scored 0%, and `
        : "") +
      `${locked} day${locked === 1 ? " is" : "s are"} now final. Participants can no longer change anything.`,
  };
}

/**
 * Reopens a competition closed by mistake.
 *
 * The mirror of unlocking the scoring rules: this loosens the competition, so
 * section 2.3 applies and the password and authenticator code are asked for
 * again regardless of an active session.
 *
 * Locked days go back to `submitted`. Days the close scored 0% keep their
 * `missing` status — that is the record of a day nobody filled in, and it is
 * overwritten the moment the participant fills it in.
 */
export async function reopenCompetition(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();
  const before = await getSettings();

  if (before.closedAt === null) {
    return { ok: false, error: "The competition is not closed." };
  }

  const parsed = reauthSchema.safeParse({
    password: formData.get("password"),
    totp: formData.get("totp"),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const verified = await verifyReauth(
    admin.adminId,
    parsed.data.password,
    parsed.data.totp,
  );
  const ip = await requestIp();

  if (!verified) {
    await recordAudit({
      action: "admin.login_failed",
      entityType: "admin",
      entityId: admin.adminId,
      actorAdminId: admin.adminId,
      reason: "Re-authentication failed while reopening the competition",
      ip,
    });
    return {
      ok: false,
      error: "Those details were not accepted. The competition is still closed.",
    };
  }

  await recordAudit({
    action: "admin.reauthenticated",
    entityType: "admin",
    entityId: admin.adminId,
    actorAdminId: admin.adminId,
    reason: "Reopening the competition",
    ip,
  });

  await db.update(settings).set({ closedAt: null }).where(eq(settings.id, 1));

  // Only the days reopening can actually give back. Weeks 1–4 closed at the
  // end of their own catch-up week, not because anybody pressed anything, so
  // reopening the competition does not reopen them — the nightly job would
  // lock them again the same night, and telling a participant a day is open
  // when it is not is worse than not reopening it.
  const after = await getSettings();
  const stillClosed = closedBlocks(
    after.startDate as IsoDate,
    after.totalWeeks,
    competitionClock(after).today,
  ).at(-1);
  const unlocked = await unlockEntriesAfter(stillClosed?.lastDay ?? null);

  await recordAudit({
    action: "competition.reopened",
    entityType: "settings",
    actorAdminId: admin.adminId,
    oldValue: before.closedAt.toISOString(),
    newValue: `open; ${unlocked} entries unlocked${
      stillClosed ? `; ${stillClosed.label} stay closed on their own deadline` : ""
    }`,
    reason:
      String(formData.get("reason") ?? "").trim() ||
      "Reopened by an organiser",
    ip,
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");

  return {
    ok: true,
    message:
      `The competition is open again and ${unlocked} day${unlocked === 1 ? "" : "s"} can be changed. ` +
      (stillClosed
        ? `Weeks 1–${stillClosed.lastWeek} stay closed: they passed their own catch-up deadline. `
        : "") +
      "Close it again once the correction is made.",
  };
}

/* ------------------------------------------------------------------ */
/* End of season — clearing the competition for the next year          */
/* ------------------------------------------------------------------ */

/**
 * Clears one year's competition so the same installation can run the next.
 *
 * Removed: every participant, and with them their health record, daily
 * entries, weekly scores, final score and any live session. The registration
 * sequence goes back to 1, so next year's first participant is BCJ0001 rather
 * than carrying on from wherever the last year stopped.
 *
 * Kept, deliberately:
 *
 *   Organiser accounts — the people running it are the same people, and this
 *   would otherwise lock BCJ out of its own installation.
 *
 *   Diet categories — the weight bands are the challenge's own reference data,
 *   not one year's results.
 *
 *   The audit history — this is a record of who changed what, and a reset is
 *   exactly the moment someone might want it gone. Deleting it here would
 *   make the audit log worthless, since anything it recorded could be erased
 *   by the person it recorded. The rows that pointed at deleted participants
 *   are detached, not removed, and the reset itself is written to it with the
 *   counts of everything destroyed.
 *
 * The scoring rules are unlocked, because the next thing anyone does after
 * this is set next year's start date, which rules_locked forbids.
 *
 * Guarded by re-authentication and a typed phrase. There is no undo, so the
 * only real protection is a restorable database backup — the UI says so.
 */
export async function resetCompetition(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  if (String(formData.get("confirm") ?? "").trim() !== RESET_PHRASE) {
    return {
      ok: false,
      errors: { confirm: `Type ${RESET_PHRASE} exactly to confirm.` },
    };
  }

  const parsed = reauthSchema.safeParse({
    password: formData.get("password"),
    totp: formData.get("totp"),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const verified = await verifyReauth(
    admin.adminId,
    parsed.data.password,
    parsed.data.totp,
  );
  const ip = await requestIp();

  if (!verified) {
    await recordAudit({
      action: "admin.login_failed",
      entityType: "admin",
      entityId: admin.adminId,
      actorAdminId: admin.adminId,
      reason: "Re-authentication failed while clearing the competition",
      ip,
    });
    return {
      ok: false,
      error: "Those details were not accepted. Nothing has been deleted.",
    };
  }

  // Counted before the delete, so the audit entry says what was destroyed.
  const [[people], [entries], [weeks], [finals]] = await Promise.all([
    db.select({ value: count() }).from(participants),
    db.select({ value: count() }).from(dailyEntries),
    db.select({ value: count() }).from(weeklyScores),
    db.select({ value: count() }).from(finalScores),
  ]);

  if (people.value === 0) {
    return { ok: false, error: "There are no participants to clear." };
  }

  await recordAudit({
    action: "admin.reauthenticated",
    entityType: "admin",
    entityId: admin.adminId,
    actorAdminId: admin.adminId,
    reason: "Clearing the competition records",
    ip,
  });

  await db.transaction(async (tx) => {
    // audit_log.actor_participant_id references participants without a
    // cascade, so the history is detached rather than blocking the delete.
    await tx
      .update(auditLog)
      .set({ actorParticipantId: null })
      .where(sql`${auditLog.actorParticipantId} IS NOT NULL`);

    // Health records, daily entries, weekly and final scores and participant
    // sessions all cascade from this one delete.
    await tx.delete(participants);

    // Next year starts at BCJ0001 again.
    await tx.execute(sql`SELECT setval('participant_seq', 1, false)`);

    // The next thing anyone does is set next year's start date, and next
    // year's competition has to start open rather than inheriting the closure
    // that ended the last one.
    await tx
      .update(settings)
      .set({ rulesLocked: false, closedAt: null })
      .where(eq(settings.id, 1));
  });

  await recordAudit({
    action: "competition.reset",
    entityType: "settings",
    actorAdminId: admin.adminId,
    oldValue: `${people.value} participants, ${entries.value} daily entries, ${weeks.value} weekly scores, ${finals.value} final scores`,
    newValue:
      "cleared; registration numbering reset to 1; scoring rules unlocked; competition reopened",
    reason: String(formData.get("reason") ?? "").trim() || "End of season reset",
    ip,
  });

  revalidatePath("/admin", "layout");

  return {
    ok: true,
    message:
      `Cleared ${people.value} participant${people.value === 1 ? "" : "s"} and ` +
      `${entries.value} recorded day${entries.value === 1 ? "" : "s"}. ` +
      "Organiser accounts, diet categories and the audit history are untouched.",
  };
}
