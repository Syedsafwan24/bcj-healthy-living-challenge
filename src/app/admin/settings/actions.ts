"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { verifyReauth } from "@/lib/auth/admin-auth";
import { requireAdmin } from "@/lib/auth/guards";
import { requestIp } from "@/lib/auth/session";
import { CHALLENGES } from "@/lib/challenges";
import { recomputeAll } from "@/lib/scoring-save";
import { getSettings } from "@/lib/settings";
import { fieldErrors, reauthSchema, settingsSchema } from "@/lib/validation";

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
const SCORING_FIELDS = ["startDate", "totalWeeks", "maxActiveWeek", "missingScoresZero"];

const TRACKED = [
  "startDate",
  "totalWeeks",
  "maxActiveWeek",
  "timezone",
  "submissionCutoff",
  "missingScoresZero",
];

export async function updateSettings(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();
  const before = await getSettings();

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = settingsSchema.safeParse({
    ...raw,
    missingScoresZero: formData.get("missingScoresZero") ?? false,
  });
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

  // V6 section 8: the scoring rules are frozen once the competition starts.
  if (before.rulesLocked) {
    const frozen =
      values.startDate !== before.startDate ||
      values.totalWeeks !== before.totalWeeks ||
      values.maxActiveWeek !== before.maxActiveWeek;
    if (frozen) {
      return {
        ok: false,
        error:
          "The scoring rules are locked. Unlock them below, with your password and authenticator code, before changing the start date, the number of weeks or the active weeks.",
      };
    }
  }

  const [after] = await db
    .update(settings)
    .set({
      startDate: values.startDate,
      totalWeeks: values.totalWeeks,
      maxActiveWeek: values.maxActiveWeek,
      timezone: values.timezone,
      submissionCutoff: values.submissionCutoff,
      missingScoresZero: values.missingScoresZero,
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
