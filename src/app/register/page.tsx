import type { Metadata } from "next";

import { PublicShell } from "@/components/public-shell";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Register",
  description:
    "Register for the BCJ Healthy Living Challenge — 12 weeks, one short form a day.",
};

/**
 * Dynamically rendered so the per-request CSP nonce from `src/middleware.ts`
 * reaches this page's script tags. A statically prerendered page is generated
 * at build time and cannot carry a per-request nonce, so its scripts would be
 * blocked by the Content-Security-Policy and the page would never hydrate.
 */
export const dynamic = "force-dynamic";

/** `/register` — the field list in specification section 10. */
export default function RegisterPage() {
  return (
    <PublicShell action="login">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
        <header className="mb-10 space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Register for the challenge
          </h1>
          <p className="max-w-xl leading-relaxed text-muted-foreground">
            Twelve weeks, one new habit each week. Everything below is used to
            set up your account and assign your diet plan.
          </p>
        </header>

        <RegisterForm />
      </div>
    </PublicShell>
  );
}
