"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  Goal,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  PiggyBank,
  Settings,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickAdd } from "@/components/shell/quick-add";
import { signOutAction } from "@/features/actions";
import { cn } from "@/lib/utils";
import type { Account, BudgetCategory, Profile } from "@/types/domain";

const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/money", label: "Money", icon: PiggyBank },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/goals", label: "Goals", icon: Goal },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/home", label: "Home", icon: Home },
];

export function AppShell({
  children,
  profile,
  email,
  accounts,
  categories,
}: {
  children: React.ReactNode;
  profile: Profile | null;
  email: string | null;
  accounts: Account[];
  categories: BudgetCategory[];
}) {
  const pathname = usePathname();
  const displayName = profile?.display_name || email?.split("@")[0] || "Profile";

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 -z-10 dashboard-grid" />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r bg-background/90 p-4 backdrop-blur-xl lg:flex lg:flex-col">
        <Link href="/overview" className="mb-6 flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ChevronLeft className="size-5 rotate-45" />
          </div>
          <div>
            <p className="text-lg font-black tracking-[0.12em]">TRACKED</p>
            <p className="text-xs text-muted-foreground">Personal command center</p>
          </div>
        </Link>

        <QuickAdd accounts={accounts} categories={categories} />

        <nav className="mt-6 grid gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  active && "bg-accent text-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto grid gap-2">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname === "/settings" && "bg-accent text-accent-foreground",
            )}
          >
            <Settings className="size-4" />
            Settings
          </Link>
          <div className="rounded-md border bg-card p-3">
            <div className="flex items-center gap-3">
              <UserCircle className="size-8 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            </div>
            <form action={signOutAction} className="mt-3">
              <Button variant="outline" size="sm" className="w-full" type="submit">
                <LogOut className="size-4" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/88 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/overview" className="flex items-center gap-2 font-black tracking-[0.12em]">
          <Menu className="size-5" />
          TRACKED
        </Link>
        <div className="w-28">
          <QuickAdd accounts={accounts} categories={categories} />
        </div>
      </header>

      <main className="pb-24 lg:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-background/95 px-2 py-2 backdrop-blur-xl lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[0.68rem] font-semibold text-muted-foreground",
                active && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
