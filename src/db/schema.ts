/**
 * Database schema — build specification section 7.
 *
 * Flat structure: one row per participant per day, one column per input,
 * matching the field list in V6 section 10 and V5 section 13.
 *
 * There is no users table. The registration ID is the credential and one
 * email may register several participants, so email is a non-unique column
 * on `participants` (open item O-7).
 */

import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Column types not built into drizzle                                 */
/* ------------------------------------------------------------------ */

const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

const inet = customType<{ data: string }>({
  dataType: () => "inet",
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/* ------------------------------------------------------------------ */
/* Competition settings, single row                                    */
/* ------------------------------------------------------------------ */

export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    startDate: date("start_date").notNull(),
    totalWeeks: integer("total_weeks").notNull().default(12),
    /** Open item O-1. C10 read as a phase label, so nine measured challenges. */
    maxActiveWeek: integer("max_active_week").notNull().default(9),
    timezone: text("timezone").notNull().default("Asia/Riyadh"),
    /** Open item O-4. */
    submissionCutoff: time("submission_cutoff").notNull().default("23:59"),
    /** Open item O-4. Days a participant may correct their own record. */
    // Retained but no longer read. BCJ's rule is that a participant may fill
    // in or correct any day until the last day of week 12, so there is no
    // rolling window — see participantMayWrite in lib/settings.ts.
    correctionDays: integer("correction_days").notNull().default(3),
    /** Open item O-3. A missing submission scores 0%. */
    missingScoresZero: boolean("missing_scores_zero").notNull().default(true),
    /**
     * V6 section 8 forbids changing scoring rules mid-competition without
     * formal approval. Once true, start_date, total_weeks and max_active_week
     * become read-only.
     */
    rulesLocked: boolean("rules_locked").notNull().default(false),
  },
  (t) => [check("settings_single_row", sql`${t.id} = 1`)],
);

/* ------------------------------------------------------------------ */
/* Admin accounts                                                      */
/* ------------------------------------------------------------------ */

export const adminStatuses = ["invited", "active", "disabled"] as const;
export type AdminStatus = (typeof adminStatuses)[number];

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  name: text("name").notNull(),
  /** Null until the invite is accepted. argon2id. */
  passwordHash: text("password_hash"),
  /** AES-256-GCM, key from TOTP_ENCRYPTION_KEY and never from the database. */
  totpSecretEnc: bytea("totp_secret_enc"),
  totpEnrolledAt: timestamp("totp_enrolled_at", { withTimezone: true }),
  /** argon2id hashes of eight single-use recovery codes. */
  recoveryCodes: text("recovery_codes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  status: text("status").notNull().default("invited"),
  inviteTokenHash: text("invite_token_hash"),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: inet("last_login_ip"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by").references((): AnyPgColumn => admins.id),
});

/* ------------------------------------------------------------------ */
/* Diet categories, V5 section 6                                       */
/* ------------------------------------------------------------------ */

export const dietCategories = pgTable("diet_categories", {
  id: serial("id").primaryKey(),
  /** kids_10_17 | kg_50_60 | kg_60_75 | kg_75_90 | kg_90_plus */
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  minAge: integer("min_age"),
  maxAge: integer("max_age"),
  minWeight: numeric("min_weight", { precision: 5, scale: 2 }),
  maxWeight: numeric("max_weight", { precision: 5, scale: 2 }),
  plan: text("plan"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/* ------------------------------------------------------------------ */
/* Participants                                                        */
/* ------------------------------------------------------------------ */

export const participantStatuses = ["pending", "active", "withdrawn"] as const;
export type ParticipantStatus = (typeof participantStatuses)[number];

export const genders = ["male", "female"] as const;
export const residenceStatuses = ["bachelor", "family"] as const;

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'BCJ0001-SYED' — generated in a server action, section 2.2 and O-13. */
    registrationId: text("registration_id").notNull().unique(),
    seqNo: integer("seq_no")
      .notNull()
      .default(sql`nextval('participant_seq')`),
    /** Deliberately not unique: one email may register several people (O-7). */
    email: citext("email").notNull(),
    fullName: text("full_name").notNull(),
    displayName: text("display_name").notNull(),
    mobile: text("mobile").notNull(),
    // No longer collected at registration (BCJ trimmed the form) — the diet
    // suggestion just skips the age-based kids check and always flags for
    // review when it is missing. An organiser can still add it later.
    age: integer("age"),
    gender: text("gender").notNull(),
    // No longer collected at registration; kept for anyone who wants to
    // record it on /admin/participants.
    areaOfResidence: text("area_of_residence"),
    residenceStatus: text("residence_status"),
    heightCm: numeric("height_cm", { precision: 5, scale: 2 }),
    // No longer required at registration. Without it the diet suggestion
    // cannot match a weight band, so it is left for an organiser to assign
    // (V5 section 6) rather than guessed.
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
    /** Open item O-10: confirm whether this is the same measurement. */
    startingWeightKg: numeric("starting_weight_kg", { precision: 5, scale: 2 }),
    dietCategoryId: integer("diet_category_id").references(
      () => dietCategories.id,
    ),
    status: text("status").notNull().default("pending"),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Form pages 2 to 7, which could not be read — open item O-8. */
    extra: jsonb("extra")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("participants_email_idx").on(t.email),
    index("participants_status_idx").on(t.status),
  ],
);

/** Health fields kept separate. Super admin only, never on the leaderboard. */
export const participantHealth = pgTable("participant_health", {
  participantId: uuid("participant_id")
    .primaryKey()
    .references(() => participants.id, { onDelete: "cascade" }),
  bloodGroup: text("blood_group"),
  bloodPressure: text("blood_pressure"),
  /** no | diagnosed | not_sure */
  diabetesStatus: text("diabetes_status"),
  bloodSugar: text("blood_sugar"),
});

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "cascade",
    }),
    adminId: uuid("admin_id").references(() => admins.id, {
      onDelete: "cascade",
    }),
    /** Absolute expiry: 8 hours for admins. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Admins only: 30 minutes, extended on activity. */
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    /**
     * A revoked session is kept rather than deleted so it stays visible in
     * the admin's own session list until it expires.
     */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "sessions_one_subject",
      sql`num_nonnulls(${t.participantId}, ${t.adminId}) = 1`,
    ),
    index("sessions_expires_at_idx").on(t.expiresAt),
    index("sessions_admin_id_idx")
      .on(t.adminId)
      .where(sql`${t.adminId} IS NOT NULL`),
  ],
);

/* ------------------------------------------------------------------ */
/* Daily entries                                                       */
/* ------------------------------------------------------------------ */

export const entryStatuses = ["draft", "submitted", "locked", "missing"] as const;
export type EntryStatus = (typeof entryStatuses)[number];

export const dailyEntries = pgTable(
  "daily_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    weekNo: integer("week_no").notNull(),

    waterLitres: numeric("water_litres", { precision: 5, scale: 2 }),
    steps: integer("steps"),
    sleepHours: numeric("sleep_hours", { precision: 4, scale: 2 }),

    c3CookAtHome: boolean("c3_cook_at_home"),
    c4NoSugary: boolean("c4_no_sugary"),
    c5Vegetables: boolean("c5_vegetables"),
    c6NoLateFood: boolean("c6_no_late_food"),
    c8Mindfulness: boolean("c8_mindfulness"),
    c9ScreenTime: boolean("c9_screen_time"),

    breakfast: boolean("breakfast"),
    midMorning: boolean("mid_morning"),
    lunch: boolean("lunch"),
    eveningSnack: boolean("evening_snack"),
    dinner: boolean("dinner"),

    /** Written by the server only. No endpoint accepts these. */
    dailyPoints: integer("daily_points"),
    maxPoints: integer("max_points"),
    dailyPercentage: numeric("daily_percentage", { precision: 9, scale: 4 }),

    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true }),
  },
  (t) => [
    unique("daily_entries_participant_date").on(t.participantId, t.entryDate),
    check("daily_entries_water_non_negative", sql`${t.waterLitres} >= 0`),
    check("daily_entries_steps_non_negative", sql`${t.steps} >= 0`),
    check("daily_entries_sleep_non_negative", sql`${t.sleepHours} >= 0`),
    index("daily_entries_entry_date_idx").on(t.entryDate),
    index("daily_entries_participant_week_idx").on(t.participantId, t.weekNo),
  ],
);

export const weeklyScores = pgTable(
  "weekly_scores",
  {
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    weekNo: integer("week_no").notNull(),
    percentage: numeric("percentage", { precision: 9, scale: 4 }).notNull(),
    daysCounted: integer("days_counted").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.weekNo] })],
);

export const finalScores = pgTable("final_scores", {
  participantId: uuid("participant_id")
    .primaryKey()
    .references(() => participants.id, { onDelete: "cascade" }),
  finalScore: numeric("final_score", { precision: 10, scale: 4 }).notNull(),
  finalPercentage: numeric("final_percentage", {
    precision: 6,
    scale: 3,
  }).notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Audit history, V5 section 12 and V6 section 8                       */
/* ------------------------------------------------------------------ */

/**
 * Append-only. The application role is granted INSERT and SELECT on this
 * table, never UPDATE or DELETE — see `src/db/grants.sql`.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorAdminId: uuid("actor_admin_id").references(() => admins.id),
    actorParticipantId: uuid("actor_participant_id").references(
      () => participants.id,
    ),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    field: text("field"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Both indexes order with plain DESC, i.e. NULLS FIRST.
    //
    // That has to match the ORDER BY the application emits exactly. Drizzle's
    // column `.desc()` inside an index() builds "DESC NULLS LAST", while the
    // query helper desc() builds a plain "DESC" — and Postgres will not use an
    // index whose null ordering differs from the sort, even on a NOT NULL
    // column. Measured at 30,000 rows: matching gives an index scan in 0.026 ms,
    // mismatched falls back to a sequential scan and sort at 3.43 ms.
    index("audit_log_entity_idx").on(t.entityId, sql`${t.createdAt} DESC`),
    // The default /admin/audit view filters on nothing and orders by date, so
    // without this it sorts the whole table. audit_log is the fastest-growing
    // table here — one row per submission, correction, sign-in and health view.
    index("audit_log_created_at_idx").on(sql`${t.createdAt} DESC`),
  ],
);

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

/**
 * Sign-in attempt counters, section 2.2 and 2.3: five attempts per IP per
 * minute. Kept in the database rather than in memory so the limit holds
 * across serverless instances.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    /** e.g. 'participant-login:203.0.113.4' */
    key: text("key").notNull(),
    /** Start of the one-minute window. */
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index("rate_limits_window_idx").on(t.windowStart),
  ],
);

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type Settings = typeof settings.$inferSelect;
export type Admin = typeof admins.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type ParticipantHealth = typeof participantHealth.$inferSelect;
export type DietCategory = typeof dietCategories.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type DailyEntry = typeof dailyEntries.$inferSelect;
export type WeeklyScore = typeof weeklyScores.$inferSelect;
export type FinalScore = typeof finalScores.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
