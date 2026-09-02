"use client";

import { FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Export controls. Each button posts to /admin/exports/download, which
 * streams the file back with a Content-Disposition header.
 *
 * These are plain forms rather than server actions, because a server action
 * cannot return a file download.
 */

const FORMATS = [
  { value: "csv", label: "CSV", icon: Table2 },
  { value: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", icon: FileText },
] as const;

export function ExportForm({
  kind,
  withRange = false,
  defaultFrom,
  defaultTo,
  min,
  max,
}: {
  kind: "daily" | "weekly" | "final" | "participants";
  withRange?: boolean;
  defaultFrom?: string;
  defaultTo?: string;
  min?: string;
  max?: string;
}) {
  return (
    <form
      action="/admin/exports/download"
      method="post"
      className="space-y-5"
    >
      <input type="hidden" name="kind" value={kind} />

      {withRange && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${kind}-from`} label="From" required>
            <Input
              id={`${kind}-from`}
              name="from"
              type="date"
              defaultValue={defaultFrom}
              min={min}
              max={max}
              className="h-11"
            />
          </Field>
          <Field id={`${kind}-to`} label="To" required>
            <Input
              id={`${kind}-to`}
              name="to"
              type="date"
              defaultValue={defaultTo}
              min={min}
              max={max}
              className="h-11"
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FORMATS.map((format) => {
          const Icon = format.icon;
          return (
            <Button
              key={format.value}
              type="submit"
              name="format"
              value={format.value}
              variant="outline"
              className="h-11 gap-2"
            >
              <Icon className="size-4" />
              {format.label}
            </Button>
          );
        })}
      </div>
    </form>
  );
}

export function HealthExportForm({
  requireTotp,
}: {
  requireTotp: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
        Export with health fields
      </Button>
    );
  }

  return (
    <form action="/admin/exports/download" method="post" className="space-y-5">
      <input type="hidden" name="kind" value="final" />
      <input type="hidden" name="includeHealth" value="true" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="health-password" label="Your password" required>
          <Input
            id="health-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-11"
          />
        </Field>
        {requireTotp && (
          <Field id="health-totp" label="Authenticator code" required>
            <Input
              id="health-totp"
              name="totp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              required
              className="tabular h-11 text-center tracking-[0.3em]"
            />
          </Field>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Format</Label>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((format) => {
            const Icon = format.icon;
            return (
              <Button
                key={format.value}
                type="submit"
                name="format"
                value={format.value}
                variant="outline"
                className="h-11 gap-2"
              >
                <Icon className="size-4" />
                {format.label}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
