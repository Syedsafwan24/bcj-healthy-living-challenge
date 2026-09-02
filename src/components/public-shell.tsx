import Link from "next/link";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

/** Header and footer for the signed-out pages: /, /register, /login. */
export function PublicShell({
  children,
  action = "register",
}: {
  children: React.ReactNode;
  action?: "register" | "login" | "none";
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <Brand />
          {action === "register" && (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Register</Link>
              </Button>
            </div>
          )}
          {action === "login" && (
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/40">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Bhatkal Community Jeddah ·{" "}
            <a
              href="https://bcjed.com"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              bcjed.com
            </a>
          </p>
          <p>
            <Link
              href="/admin/login"
              className="underline-offset-4 hover:underline"
            >
              Organiser sign-in
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
