import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

/**
 * Header for the standalone sign-in screens, which sit outside both shells:
 * /admin/login, /admin/recovery, /admin/invite/[token].
 *
 * They are reached directly from an email or a bookmark, so they carry an
 * explicit way back to the public site rather than relying on the browser's
 * back button.
 */
export function AuthHeader({
  backHref = "/",
  backLabel = "Home",
}: {
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-5">
        <Brand href="/" />
        <Button asChild variant="ghost" className="h-11 gap-2">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            {backLabel}
          </Link>
        </Button>
      </div>
    </header>
  );
}
