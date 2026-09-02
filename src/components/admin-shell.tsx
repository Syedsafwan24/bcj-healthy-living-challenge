"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  Download,
  Gauge,
  History,
  LogOut,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
  UserCog,
} from "lucide-react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/participants", label: "Participants", icon: Users },
  { href: "/admin/entries", label: "Daily entries", icon: CalendarRange },
  { href: "/admin/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/exports", label: "Exports", icon: Download },
  { href: "/admin/audit", label: "Audit history", icon: History },
  { href: "/admin/accounts", label: "Accounts", icon: UserCog },
  { href: "/admin/security", label: "My security", icon: ShieldCheck },
];

export function AdminShell({
  name,
  email,
  signOut,
  children,
}: {
  name: string;
  email: string;
  signOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {LINKS.map((link) => {
        const Icon = link.icon;
        const active = isActive(link.href, link.exact);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-muted/30">
      {/* ---- sidebar ----
          Sticky and viewport-height, so it stays in place while the page
          scrolls. The nav takes the remaining height and scrolls on its own if
          it ever outgrows a short window; the brand and the footer note stay
          pinned. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
          <Brand href="/admin" subdued className="text-sidebar-foreground" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
        <div className="shrink-0 border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/60">
          Organiser area. Every action here is recorded in the audit history.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---- top bar ---- */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background px-4">
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-11 lg:hidden">
                  Menu
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-64 flex-col bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetTitle className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4 text-sidebar-foreground">
                  <Brand href="/admin" subdued />
                </SheetTitle>
                <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
              </SheetContent>
            </Sheet>
            <span className="hidden text-sm font-medium text-muted-foreground lg:inline">
              BCJ Healthy Living Challenge — organiser
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-11 gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700 dark:bg-green-800 dark:text-green-100">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-32 truncate text-sm sm:inline">
                  {name}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="space-y-0.5">
                <p className="truncate font-medium">{name}</p>
                <p className="truncate text-xs font-normal text-muted-foreground">
                  {email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/admin/security">
                  <ShieldCheck className="mr-2 size-4" />
                  Two-factor and sessions
                </Link>
              </DropdownMenuItem>
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
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
