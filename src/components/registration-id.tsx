"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The registration ID — build specification sections 9.4 and 9.5.
 *
 * Always in JetBrains Mono, so that 0 and O, and 1 and l, are
 * distinguishable when a participant reads the code back over the phone.
 * Displayed on /register/success with a copy button.
 */

export function RegistrationId({
  value,
  className,
  size = "md",
}: {
  value: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "font-mono font-medium tracking-[0.08em]",
        size === "sm" && "text-sm",
        size === "md" && "text-base",
        size === "lg" && "text-2xl sm:text-3xl",
        className,
      )}
    >
      {value}
    </span>
  );
}

export function RegistrationIdCard({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Registration ID copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the ID and copy it by hand.");
    }
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-800 dark:bg-green-900/40">
      <p className="text-sm font-medium text-green-700 dark:text-green-200">
        Your registration ID
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <RegistrationId
          value={value}
          size="lg"
          className="text-green-900 dark:text-green-50"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copy}
          className="h-11 gap-2 bg-background"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-green-800 dark:text-green-100">
        This is how you sign in. There is no password, so keep it somewhere
        safe. We have emailed a copy to the address you gave.
      </p>
    </div>
  );
}
