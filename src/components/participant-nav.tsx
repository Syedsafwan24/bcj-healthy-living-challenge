"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LogOut,
  Salad,
  TrendingUp,
  Trophy,
  User,
} from "lucide-react";

import { Brand } from "@/components/brand";
import { RegistrationId } from "@/components/registration-id";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PARTICIPANT_LEADERBOARD_VISIBLE } from "@/lib/features";
import { cn } from "@/lib/utils";

/**
 * The bottom bar on small screens shows these same links, so keep the list
 * short: five is about the limit before the labels stop being readable at
 * 11px. If the leaderboard is ever published to participants, drop something
 * else rather than letting it grow to six.
 */
const LINKS = [
  { href: "/app", label: "Today", icon: CalendarDays, exact: true },
  { href: "/app/history", label: "History", icon: CalendarDays },
  { href: "/app/progress", label: "Progress", icon: TrendingUp },
  // Shown only when BCJ publishes the board — see lib/features.ts.
  ...(PARTICIPANT_LEADERBOARD_VISIBLE
    ? [{ href: "/app/leaderboard", label: "Leaderboard", icon: Trophy }]
    : []),
  { href: "/app/plan", label: "My plan", icon: Salad },
  // Not just a read-only card any more: participants correct their own
  // contact details here, so it needs to be findable without opening a menu.
  { href: "/app/profile", label: "My details", icon: User },
];

export function ParticipantNav({
  displayName,
  registrationId,
  signOut,
}: {
  displayName: string;
  registrationId: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-5">
          <Brand href="/app" />

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(link.href, link.exact)
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-11 gap-2 px-2">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700 dark:bg-green-800 dark:text-green-100">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">
                  {displayName}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="space-y-1">
                <p className="truncate font-medium">{displayName}</p>
                <RegistrationId
                  value={registrationId}
                  size="sm"
                  className="text-muted-foreground"
                />
              </DropdownMenuLabel>
              {/* No links here. Both destinations are in the nav above, and
                  listing them twice on the same screen only makes the reader
                  wonder whether the two go to different places. */}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild variant="destructive">
                <form action={signOut}>
                  <button type="submit" className="flex w-full items-center">
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Bottom bar on small screens. Touch targets are at least 44 px. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-5xl">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href, link.exact);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
