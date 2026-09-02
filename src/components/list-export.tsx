"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Export buttons for a filtered list screen.
 *
 * Posts the same status and search the screen is showing, so the file matches
 * the rows on screen rather than the whole table.
 *
 * The download is fetched rather than submitted, for two reasons. A plain form
 * post gives no feedback at all: the button does nothing visible until the
 * file arrives, so an organiser clicks it again and exports twice. And when a
 * session has expired the post replaces the whole page with the route's raw
 * JSON error, which reads as the app having crashed.
 *
 * The <form> is kept and its native submit is only prevented once the handler
 * runs, so with JavaScript unavailable the buttons still post and still work.
 */

const FORMATS = [
  { value: "xlsx", label: "Excel", Icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", Icon: FileText },
  { value: "csv", label: "CSV", Icon: Table2 },
] as const;

export function ListExport({
  kind,
  status,
  search,
}: {
  kind: "participants";
  status?: string;
  search?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function download(format: string) {
    if (busy) return;
    setBusy(format);

    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("format", format);
      body.set("status", status ?? "");
      body.set("q", search ?? "");

      const response = await fetch("/admin/exports/download", {
        method: "POST",
        body,
      });

      if (!response.ok) {
        toast.error(
          response.status === 401
            ? "Your session has expired. Sign in again to export."
            : "That export could not be generated.",
        );
        return;
      }

      // The filename the route chose, so the file on disk matches the audit
      // entry rather than being named after the URL.
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = named ?? `bcj-${kind}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked on the next tick; revoking immediately cancels the download
      // in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error("That export could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      action="/admin/exports/download"
      method="post"
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const format = (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
          "value",
        );
        if (format) void download(format);
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="status" value={status ?? ""} />
      <input type="hidden" name="q" value={search ?? ""} />

      <span className="mr-1 text-sm text-muted-foreground">Export</span>
      {FORMATS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="submit"
          name="format"
          value={value}
          variant="outline"
          size="sm"
          disabled={busy !== null}
          className="h-11 gap-2"
        >
          {busy === value ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Icon className="size-4" />
          )}
          {busy === value ? "Preparing…" : label}
        </Button>
      ))}
    </form>
  );
}
