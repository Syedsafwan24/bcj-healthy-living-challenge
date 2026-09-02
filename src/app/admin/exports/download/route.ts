import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { getAdminSession, touchAdminSession } from "@/lib/auth/session";
import { verifyReauth } from "@/lib/auth/admin-auth";
import { env } from "@/lib/env";
import { isIsoDate, type IsoDate } from "@/lib/dates";
import { buildExport, type ExportKind } from "@/lib/exports/data";
import {
  CONTENT_TYPES,
  exportFilename,
  toCsv,
  toXlsx,
} from "@/lib/exports/formats";
import { getSettings } from "@/lib/settings";

/**
 * `/admin/exports/download` — build specification section 5.2 and 6.
 *
 * Daily, weekly and final results as CSV, XLSX and PDF. Every export is
 * written to the audit history.
 *
 * A bulk export that includes health fields requires re-authentication with
 * password and TOTP (section 2.3), which is why this is a POST: the form on
 * /admin/exports carries the two factors when they are needed.
 */

const KINDS: ExportKind[] = ["daily", "weekly", "final", "participants"];
const FORMATS = ["csv", "xlsx", "pdf"] as const;
type Format = (typeof FORMATS)[number];

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session || (env.adminRequireTotp && !session.totpEnrolled)) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  await touchAdminSession(session.sessionId);

  const form = await request.formData();
  const kind = String(form.get("kind") ?? "") as ExportKind;
  const format = String(form.get("format") ?? "") as Format;
  const includeHealth = form.get("includeHealth") === "true";
  const fromRaw = String(form.get("from") ?? "");
  const toRaw = String(form.get("to") ?? "");
  // Carried from the filter bar on /admin/participants, so the file matches
  // the list the organiser was looking at.
  const statusRaw = String(form.get("status") ?? "");
  const searchRaw = String(form.get("q") ?? "").slice(0, 100);

  if (!KINDS.includes(kind) || !FORMATS.includes(format)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Health fields are behind a fresh password and TOTP check, whatever the
  // session says.
  if (includeHealth) {
    const password = String(form.get("password") ?? "");
    const totp = String(form.get("totp") ?? "");
    const verified = await verifyReauth(session.adminId, password, totp);

    if (!verified) {
      await recordAudit({
        action: "admin.login_failed",
        entityType: "admin",
        entityId: session.adminId,
        actorAdminId: session.adminId,
        reason: "Re-authentication failed for a health-data export",
        ip,
      });
      return NextResponse.redirect(
        new URL("/admin/exports?reauth=failed", request.url),
        { status: 303 },
      );
    }

    await recordAudit({
      action: "admin.reauthenticated",
      entityType: "admin",
      entityId: session.adminId,
      actorAdminId: session.adminId,
      reason: "Exporting results with health fields",
      ip,
    });
  }

  const settings = await getSettings();

  const table = await buildExport(settings, {
    kind,
    from: isIsoDate(fromRaw) ? (fromRaw as IsoDate) : undefined,
    to: isIsoDate(toRaw) ? (toRaw as IsoDate) : undefined,
    includeHealth,
    status: statusRaw || undefined,
    search: searchRaw || undefined,
  });

  await recordAudit({
    action: "export.generated",
    entityType: "export",
    actorAdminId: session.adminId,
    newValue: {
      kind,
      format,
      rows: table.rows.length,
      includeHealth,
      from: fromRaw || null,
      to: toRaw || null,
      status: statusRaw || null,
      search: searchRaw || null,
    },
    ip,
  });

  if (includeHealth) {
    await recordAudit({
      action: "health.viewed",
      entityType: "export",
      actorAdminId: session.adminId,
      newValue: `${table.rows.length} participants exported with health fields`,
      ip,
    });
  }

  const filename = exportFilename(kind, format, table.generatedAt);
  const headers = {
    "Content-Type": CONTENT_TYPES[format],
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (format === "csv") {
    return new NextResponse(toCsv(table), { headers });
  }

  if (format === "xlsx") {
    const buffer = await toXlsx(table);
    return new NextResponse(new Uint8Array(buffer), { headers });
  }

  // Imported lazily so the PDF renderer is not pulled into every request.
  const { toPdf } = await import("@/lib/exports/pdf");
  const buffer = await toPdf(table);
  return new NextResponse(new Uint8Array(buffer), { headers });
}
