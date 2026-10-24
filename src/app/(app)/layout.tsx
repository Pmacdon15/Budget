import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { MonthSwitcher } from "@/components/month-switcher";
import { NavLinks, StaticNavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <Logo />
            <span className="hidden sm:inline">Budget</span>
          </Link>
          {/* The links render in the static shell; only `?month=` waits for the URL. */}
          <Suspense
            fallback={<StaticNavLinks className="ml-4 hidden md:flex" />}
          >
            <NavLinks className="ml-4 hidden md:flex" />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<Skeleton className="h-8 w-44" />}>
              <MonthSwitcher />
            </Suspense>
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
        <div className="border-t md:hidden">
          <Suspense
            fallback={
              <StaticNavLinks className="mx-auto max-w-6xl overflow-x-auto px-2 py-1.5" />
            }
          >
            <NavLinks className="mx-auto max-w-6xl overflow-x-auto px-2 py-1.5" />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
