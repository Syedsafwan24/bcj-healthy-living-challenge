import { Suspense } from "react";
import type { Metadata } from "next";

import { PublicShell } from "@/components/public-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

/**
 * Dynamically rendered so the per-request CSP nonce from `src/middleware.ts`
 * reaches this page's script tags. A statically prerendered page is generated
 * at build time and cannot carry a per-request nonce, so its scripts would be
 * blocked by the Content-Security-Policy and the page would never hydrate.
 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <PublicShell action="none">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-5 py-16 sm:py-24">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>
              Your registration ID is your key. There is no password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Registered several people from one email address? Each has their own
          ID and signs in separately.
        </p>
      </div>
    </PublicShell>
  );
}
