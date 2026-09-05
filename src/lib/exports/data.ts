import "server-only";

import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  dailyEntries,
  dietCategories,
  finalScores,
  participantHealth,
  participants,
  weeklyScores,
  type Settings,
} from "@/db/schema";
import { addDays, weekNoFor, type IsoDate } from "@/lib/dates";
import { dailyMaxForWeek } from "@/lib/scoring";

/**
 * Export data — build specification section 5.2 and 11.
 *
 * Daily, weekly and final results. The figures come from the stored
 * calculated columns, which are the same values the screens read, so an
 * export can never disagree with the screen (P6: "Exports match the screen
 * exactly").
 *
 * Health fields are included only when `includeHealth` is set, which the
 * caller sets only after a re-authentication (section 2.3).
 */

export type ExportKind = "daily" | "weekly" | "final" | "participants";

export interface ExportOptions {
  kind: ExportKind;
  /** Daily exports only. Omit for the whole competition. */
  from?: IsoDate;
  to?: IsoDate;
  includeHealth?: boolean;
  /** Participants export: mirrors the filter on /admin/participants. */
  status?: string;
  search?: string;
}

export interface ExportTable {
  title: string;
  subtitle: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  generatedAt: Date;
}

const NUMERIC = (value: unknown, dp = 4): string =>
  value === null || value === undefined ? "" : Number(value).toFixed(dp);

/* ------------------------------------------------------------------ */
/* Daily                                                               */
/* ------------------------------------------------------------------ */

async function dailyTable(
  settings: Settings,
  options: ExportOptions,
): Promise<ExportTable> {
  const first = (options.from ?? settings.startDate) as IsoDate;
  const last =
    (options.to as IsoDate) ??
    addDays(settings.startDate as IsoDate, settings.totalWeeks * 7 - 1);

  const rows = await db
    .select({
      registrationId: participants.registrationId,
      seqNo: participants.seqNo,
      fullName: participants.fullName,
      displayName: participants.displayName,
      dietTitle: dietCategories.title,
      entryDate: dailyEntries.entryDate,
      weekNo: dailyEntries.weekNo,
      waterLitres: dailyEntries.waterLitres,
      steps: dailyEntries.steps,
      sleepHours: dailyEntries.sleepHours,
      c3CookAtHome: dailyEntries.c3CookAtHome,
      c4NoSugary: dailyEntries.c4NoSugary,
      c5Vegetables: dailyEntries.c5Vegetables,
      c6NoLateFood: dailyEntries.c6NoLateFood,
      c8Mindfulness: dailyEntries.c8Mindfulness,
      c9ScreenTime: dailyEntries.c9ScreenTime,
      breakfast: dailyEntries.breakfast,
      midMorning: dailyEntries.midMorning,
      lunch: dailyEntries.lunch,
      eveningSnack: dailyEntries.eveningSnack,
      dinner: dailyEntries.dinner,
      dailyPoints: dailyEntries.dailyPoints,
      maxPoints: dailyEntries.maxPoints,
      dailyPercentage: dailyEntries.dailyPercentage,
      status: dailyEntries.status,
      submittedAt: dailyEntries.submittedAt,
    })
    .from(dailyEntries)
    .innerJoin(participants, eq(participants.id, dailyEntries.participantId))
    .leftJoin(dietCategories, eq(dietCategories.id, participants.dietCategoryId))
    .where(
      and(gte(dailyEntries.entryDate, first), lte(dailyEntries.entryDate, last)),
    )
    .orderBy(asc(participants.seqNo), asc(dailyEntries.entryDate));

  const yesNo = (value: boolean | null) =>
    value === true ? "Yes" : value === false ? "No" : "";

  return {
    title: "BCJ Healthy Living Challenge — daily results",
    subtitle: `${first} to ${last} · ${rows.length} records`,
    columns: [
      "No.",
      "Registration ID",
      "Full name",
      "Display name",
      "Diet category",
      "Date",
      "Week",
      "C1 water (L)",
      "C2 steps",
      "C3 cook at home",
      "C4 no sugary drinks & desserts",
      "C5 vegetables",
      "C6 no eating after 8 PM",
      "C7 sleep (h)",
      "C8 mindfulness",
      "C9 screen time",
      // Kept so answers given before BCJ reduced the diet section to two
      // meals are still exported, but marked, because they no longer score.
      "Breakfast (retired)",
      "Mid-morning (retired)",
      "Lunch",
      "Evening snack (retired)",
      "Dinner",
      "Points",
      "Maximum",
      "Percentage",
      "Status",
      "Submitted at",
    ],
    rows: rows.map((r) => [
      r.seqNo,
      r.registrationId,
      r.fullName,
      r.displayName,
      r.dietTitle ?? "",
      r.entryDate,
      r.weekNo,
      r.waterLitres ?? "",
      r.steps ?? "",
      yesNo(r.c3CookAtHome),
      yesNo(r.c4NoSugary),
      yesNo(r.c5Vegetables),
      yesNo(r.c6NoLateFood),
      r.sleepHours ?? "",
      yesNo(r.c8Mindfulness),
      yesNo(r.c9ScreenTime),
      yesNo(r.breakfast),
      yesNo(r.midMorning),
      yesNo(r.lunch),
      yesNo(r.eveningSnack),
      yesNo(r.dinner),
      // Number, not the fixed-scale string the numeric column returns, so the
      // Points column stays sortable and summable in Excel.
      Number(r.dailyPoints ?? 0),
      r.maxPoints ?? 0,
      NUMERIC(r.dailyPercentage),
      r.status,
      r.submittedAt ? r.submittedAt.toISOString() : "",
    ]),
    generatedAt: new Date(),
  };
}

/* ------------------------------------------------------------------ */
/* Weekly                                                              */
/* ------------------------------------------------------------------ */

async function weeklyTable(settings: Settings): Promise<ExportTable> {
  const people = await db
    .select({
      id: participants.id,
      seqNo: participants.seqNo,
      registrationId: participants.registrationId,
      fullName: participants.fullName,
      displayName: participants.displayName,
      status: participants.status,
      dietTitle: dietCategories.title,
    })
    .from(participants)
    .leftJoin(dietCategories, eq(dietCategories.id, participants.dietCategoryId))
    .orderBy(asc(participants.seqNo));

  const scores = await db
    .select()
    .from(weeklyScores)
    .where(
      inArray(
        weeklyScores.participantId,
        people.map((p) => p.id),
      ),
    );

  const byParticipant = new Map<string, Map<number, (typeof scores)[number]>>();
  for (const score of scores) {
    if (!byParticipant.has(score.participantId)) {
      byParticipant.set(score.participantId, new Map());
    }
    byParticipant.get(score.participantId)!.set(score.weekNo, score);
  }

  const weekNumbers = Array.from({ length: settings.totalWeeks }, (_, i) => i + 1);

  return {
    title: "BCJ Healthy Living Challenge — weekly results",
    subtitle: `${settings.totalWeeks} weeks · ${people.length} participants`,
    columns: [
      "No.",
      "Registration ID",
      "Full name",
      "Display name",
      "Diet category",
      "Status",
      ...weekNumbers.map((w) => `Week ${w} %`),
      "Total",
    ],
    rows: people.map((person) => {
      const weeks = byParticipant.get(person.id);
      const values = weekNumbers.map((w) => Number(weeks?.get(w)?.percentage ?? 0));
      const total = values.reduce((sum, v) => sum + v, 0);
      return [
        person.seqNo,
        person.registrationId,
        person.fullName,
        person.displayName,
        person.dietTitle ?? "",
        person.status,
        ...values.map((v) => v.toFixed(4)),
        total.toFixed(4),
      ];
    }),
    generatedAt: new Date(),
  };
}

/* ------------------------------------------------------------------ */
/* Final                                                               */
/* ------------------------------------------------------------------ */

async function finalTable(
  settings: Settings,
  includeHealth: boolean,
): Promise<ExportTable> {
  const rows = await db
    .select({
      id: participants.id,
      seqNo: participants.seqNo,
      registrationId: participants.registrationId,
      fullName: participants.fullName,
      displayName: participants.displayName,
      email: participants.email,
      mobile: participants.mobile,
      age: participants.age,
      gender: participants.gender,
      areaOfResidence: participants.areaOfResidence,
      residenceStatus: participants.residenceStatus,
      weightKg: participants.weightKg,
      startingWeightKg: participants.startingWeightKg,
      status: participants.status,
      dietTitle: dietCategories.title,
      finalScore: finalScores.finalScore,
      finalPercentage: finalScores.finalPercentage,
    })
    .from(participants)
    .leftJoin(dietCategories, eq(dietCategories.id, participants.dietCategoryId))
    .leftJoin(finalScores, eq(finalScores.participantId, participants.id))
    .orderBy(asc(participants.seqNo));

  // Ranked the same way as the leaderboard: final score, then earlier
  // registration (open item O-5).
  const ranked = [...rows]
    .filter((r) => r.status === "active")
    .sort((a, b) => Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0));
  const rankById = new Map<string, number>();
  ranked.forEach((row, index) => {
    const previous = ranked[index - 1];
    const rank =
      previous && Number(previous.finalScore ?? 0) === Number(row.finalScore ?? 0)
        ? rankById.get(previous.id)!
        : index + 1;
    rankById.set(row.id, rank);
  });

  const health = includeHealth
    ? new Map(
        (
          await db
            .select()
            .from(participantHealth)
            .where(
              inArray(
                participantHealth.participantId,
                rows.map((r) => r.id),
              ),
            )
        ).map((h) => [h.participantId, h]),
      )
    : null;

  const columns = [
    "Rank",
    "No.",
    "Registration ID",
    "Full name",
    "Display name",
    "Email",
    "Mobile",
    "Age",
    "Gender",
    "Area",
    "Residence status",
    "Diet category",
    "Weight (kg)",
    "Starting weight (kg)",
    "Status",
    "Final score",
    `Maximum (${settings.totalWeeks * 100})`,
    "Final percentage",
  ];

  if (includeHealth) {
    columns.push("Blood group", "Blood pressure", "Diabetes", "Blood sugar");
  }

  return {
    title: "BCJ Healthy Living Challenge — final results",
    subtitle: includeHealth
      ? `${rows.length} participants · includes health fields`
      : `${rows.length} participants`,
    columns,
    rows: rows.map((r) => {
      const base: Array<string | number> = [
        rankById.get(r.id) ?? "",
        r.seqNo,
        r.registrationId,
        r.fullName,
        r.displayName,
        r.email,
        r.mobile,
        r.age ?? "",
        r.gender,
        r.areaOfResidence ?? "",
        r.residenceStatus ?? "",
        r.dietTitle ?? "",
        r.weightKg ?? "",
        r.startingWeightKg ?? "",
        r.status,
        NUMERIC(r.finalScore ?? 0),
        settings.totalWeeks * 100,
        NUMERIC(r.finalPercentage ?? 0, 3),
      ];

      if (includeHealth) {
        const h = health?.get(r.id);
        base.push(
          h?.bloodGroup ?? "",
          h?.bloodPressure ?? "",
          h?.diabetesStatus ?? "",
          h?.bloodSugar ?? "",
        );
      }
      return base;
    }),
    generatedAt: new Date(),
  };
}

/* ------------------------------------------------------------------ */
/* Participants roster                                                 */
/* ------------------------------------------------------------------ */

/**
 * The registration list as shown on /admin/participants, including whatever
 * status filter and search the organiser had applied, so the file matches the
 * screen they exported it from.
 *
 * Health fields are never included here. They sit behind the re-authenticated
 * export on /admin/exports, so that every disclosure is deliberate and
 * audited (specification sections 2.3 and 11).
 */
async function participantsTable(
  settings: Settings,
  options: ExportOptions,
): Promise<ExportTable> {
  const conditions = [sql`true`];

  if (options.status && options.status !== "all") {
    conditions.push(sql`${participants.status} = ${options.status}`);
  }
  if (options.search) {
    const term = `%${options.search.toLowerCase()}%`;
    conditions.push(sql`(
      lower(${participants.fullName}) LIKE ${term}
      OR lower(${participants.displayName}) LIKE ${term}
      OR lower(${participants.email}::text) LIKE ${term}
      OR lower(${participants.registrationId}) LIKE ${term}
      OR ${participants.mobile} LIKE ${term}
    )`);
  }

  const rows = await db
    .select({
      seqNo: participants.seqNo,
      registrationId: participants.registrationId,
      fullName: participants.fullName,
      displayName: participants.displayName,
      email: participants.email,
      mobile: participants.mobile,
      age: participants.age,
      gender: participants.gender,
      areaOfResidence: participants.areaOfResidence,
      residenceStatus: participants.residenceStatus,
      heightCm: participants.heightCm,
      weightKg: participants.weightKg,
      startingWeightKg: participants.startingWeightKg,
      dietTitle: dietCategories.title,
      status: participants.status,
      registeredAt: participants.registeredAt,
      finalScore: finalScores.finalScore,
    })
    .from(participants)
    .leftJoin(dietCategories, eq(dietCategories.id, participants.dietCategoryId))
    .leftJoin(finalScores, eq(finalScores.participantId, participants.id))
    .where(sql.join(conditions, sql` AND `))
    .orderBy(asc(participants.seqNo));

  const filters = [
    options.status && options.status !== "all" ? `status: ${options.status}` : null,
    options.search ? `search: "${options.search}"` : null,
  ].filter(Boolean);

  return {
    title: "BCJ Healthy Living Challenge — participants",
    subtitle:
      `${rows.length} participant${rows.length === 1 ? "" : "s"}` +
      (filters.length > 0 ? ` · ${filters.join(" · ")}` : ""),
    columns: [
      "No.",
      "Registration ID",
      "Full name",
      "Display name",
      "Email",
      "Mobile",
      "Age",
      "Gender",
      "Area",
      "Residence",
      "Height (cm)",
      "Weight (kg)",
      "Starting weight (kg)",
      "Diet category",
      "Status",
      "Registered",
      "Final score",
    ],
    rows: rows.map((r) => [
      r.seqNo,
      r.registrationId,
      r.fullName,
      r.displayName,
      r.email,
      r.mobile,
      r.age ?? "",
      r.gender,
      r.areaOfResidence ?? "",
      r.residenceStatus ?? "",
      r.heightCm ?? "",
      r.weightKg ?? "",
      r.startingWeightKg ?? "",
      r.dietTitle ?? "",
      r.status,
      new Intl.DateTimeFormat("en-GB", {
        timeZone: settings.timezone,
        dateStyle: "medium",
      }).format(r.registeredAt),
      r.finalScore ? Number(r.finalScore).toFixed(4) : "",
    ]),
    generatedAt: new Date(),
  };
}

/* ------------------------------------------------------------------ */

export async function buildExport(
  settings: Settings,
  options: ExportOptions,
): Promise<ExportTable> {
  switch (options.kind) {
    case "daily":
      return dailyTable(settings, options);
    case "weekly":
      return weeklyTable(settings);
    case "final":
      return finalTable(settings, options.includeHealth ?? false);
    case "participants":
      return participantsTable(settings, options);
  }
}

/** Week and daily maximum for a date, used in the PDF header. */
export function weekSummary(settings: Settings, date: IsoDate) {
  const weekNo = weekNoFor(settings.startDate as IsoDate, date);
  return { weekNo, dailyMax: dailyMaxForWeek(weekNo, settings.maxActiveWeek) };
}
