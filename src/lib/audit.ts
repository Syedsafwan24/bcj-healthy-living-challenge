import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { admins, auditLog, participants } from "@/db/schema";
import { requestIp } from "@/lib/auth/session";

/**
 * Audit history — V5 section 12 and V6 section 8, build specification 2.3.
 *
 * Every admin sign-in, failed attempt, session revocation, correction,
 * settings change and health-data view is written here with the actor, IP
 * and timestamp. A correction also carries a required reason.
 *
 * The table is append-only. The application role has INSERT and SELECT on it
 * and nothing else — see `src/db/grants.sql`.
 */

export type AuditAction =
  | "admin.login"
  | "admin.login_failed"
  | "admin.logout"
  | "admin.locked"
  | "admin.invited"
  | "admin.invite_accepted"
  | "admin.disabled"
  | "admin.deleted"
  | "admin.enabled"
  | "admin.password_changed"
  | "admin.totp_enrolled"
  | "admin.recovery_used"
  | "admin.recovery_regenerated"
  | "admin.session_revoked"
  | "admin.reauthenticated"
  | "participant.login"
  | "participant.login_failed"
  | "participant.logout"
  | "participant.registered"
  | "participant.ids_resent"
  | "participant.activated"
  | "participant.withdrawn"
  | "participant.deleted"
  | "participant.diet_assigned"
  | "participant.updated"
  | "entry.submitted"
  | "entry.self_corrected"
  | "entry.admin_corrected"
  | "entry.marked_missing"
  | "entry.locked"
  | "settings.changed"
  | "settings.rules_locked"
  | "settings.rules_unlocked"
  | "export.generated"
  | "health.viewed"
  | "scores.recomputed"
  | "competition.reset";

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  actorAdminId?: string | null;
  actorParticipantId?: string | null;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  /** Pass an IP when the caller already has one; otherwise it is read here. */
  ip?: string | null;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const ip = input.ip !== undefined ? input.ip : await requestIp();
  await db.insert(auditLog).values({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    actorAdminId: input.actorAdminId ?? null,
    actorParticipantId: input.actorParticipantId ?? null,
    field: input.field ?? null,
    oldValue: stringify(input.oldValue),
    newValue: stringify(input.newValue),
    reason: input.reason ?? null,
    ip: ip ?? undefined,
  });
}

/**
 * Writes one row per changed field, which is what makes an entry correction
 * reviewable field by field on /admin/audit.
 */
export async function recordFieldChanges(
  base: Omit<AuditInput, "field" | "oldValue" | "newValue">,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Promise<number> {
  const ip = base.ip !== undefined ? base.ip : await requestIp();
  const rows = fields
    .filter((field) => stringify(before[field]) !== stringify(after[field]))
    .map((field) => ({
      action: base.action,
      entityType: base.entityType,
      entityId: base.entityId ?? null,
      actorAdminId: base.actorAdminId ?? null,
      actorParticipantId: base.actorParticipantId ?? null,
      field,
      oldValue: stringify(before[field]),
      newValue: stringify(after[field]),
      reason: base.reason ?? null,
      ip: ip ?? undefined,
    }));

  if (rows.length === 0) return 0;
  await db.insert(auditLog).values(rows);
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Reading — /admin/audit                                              */
/* ------------------------------------------------------------------ */

export interface AuditFilter {
  entityId?: string;
  action?: string;
  actorAdminId?: string;
  limit?: number;
  offset?: number;
}

export async function listAudit(filter: AuditFilter = {}) {
  const limit = Math.min(filter.limit ?? 100, 500);
  const offset = filter.offset ?? 0;

  const conditions = [sql`true`];
  if (filter.entityId) conditions.push(sql`${auditLog.entityId} = ${filter.entityId}`);
  if (filter.action) conditions.push(sql`${auditLog.action} = ${filter.action}`);
  if (filter.actorAdminId)
    conditions.push(sql`${auditLog.actorAdminId} = ${filter.actorAdminId}`);

  const where = sql.join(conditions, sql` AND `);

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      field: auditLog.field,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      reason: auditLog.reason,
      ip: auditLog.ip,
      createdAt: auditLog.createdAt,
      adminName: admins.name,
      adminEmail: admins.email,
      participantName: participants.fullName,
      participantRegistrationId: participants.registrationId,
    })
    .from(auditLog)
    .leftJoin(admins, eq(admins.id, auditLog.actorAdminId))
    .leftJoin(participants, eq(participants.id, auditLog.actorParticipantId))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function countAudit(filter: AuditFilter = {}): Promise<number> {
  const conditions = [sql`true`];
  if (filter.entityId) conditions.push(sql`${auditLog.entityId} = ${filter.entityId}`);
  if (filter.action) conditions.push(sql`${auditLog.action} = ${filter.action}`);
  if (filter.actorAdminId)
    conditions.push(sql`${auditLog.actorAdminId} = ${filter.actorAdminId}`);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(sql.join(conditions, sql` AND `));
  return row?.count ?? 0;
}
