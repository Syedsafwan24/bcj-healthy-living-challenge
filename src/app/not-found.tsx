import Link from "next/link";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

/**
 * 404. Deliberately free of client components: Next prerenders this page, so
 * it cannot carry the per-request CSP nonce and nothing on it may depend on
 * hydration. Plain links work without JavaScript.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-5">
          <Brand href="/" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-20 text-center">
        <p className="tabular text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          That page does not exist
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          The link may be out of date. Everything in the challenge is reachable
          from the pages below.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-12">
            <Link href="/">Home</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link href="/register">Register</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
